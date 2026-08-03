'use strict';

const { Op } = require('sequelize');
const {
  CrmLead,
  CrmConversation,
  CrmMessage,
  CrmAuditLog,
} = require('../models');
const { resolveTenantId } = require('../utils/tenantScope');
const { enqueueInboundTurn, processInboundAiTurn } = require('../services/crmInboundTurnService');

function tid(req) {
  return resolveTenantId(req);
}

/** GET /api/crm/leads */
const listLeads = async (req, res) => {
  try {
    const tenantId = tid(req);
    const where = { tenant_id: tenantId };
    if (req.query.stage) where.stage = req.query.stage;
    if (req.query.q) {
      const q = `%${req.query.q}%`;
      where[Op.or] = [
        { phone: { [Op.like]: q } },
        { name: { [Op.like]: q } },
      ];
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const { rows, count } = await CrmLead.findAndCountAll({
      where,
      order: [['last_message_at', 'DESC'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    return res.json({ total: count, page, limit, data: rows });
  } catch (err) {
    console.error('[crm] listLeads', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** PATCH /api/crm/leads/:id */
const updateLead = async (req, res) => {
  try {
    const tenantId = tid(req);
    const lead = await CrmLead.findOne({ where: { id: req.params.id, tenant_id: tenantId } });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    const allowed = ['stage', 'name', 'campaign_source', 'interest_tags', 'follow_up_status', 'branch_id'];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (patch.stage && !CrmLead.STAGES.includes(patch.stage)) {
      return res.status(400).json({ message: `Invalid stage. Use: ${CrmLead.STAGES.join(', ')}` });
    }
    await lead.update(patch);
    return res.json(lead);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

/** GET /api/crm/conversations */
const listConversations = async (req, res) => {
  try {
    const tenantId = tid(req);
    const where = { tenant_id: tenantId };
    if (req.query.status) where.status = req.query.status;
    const limit = Math.min(parseInt(req.query.limit, 10) || 40, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const { rows, count } = await CrmConversation.findAndCountAll({
      where,
      include: [
        { model: CrmLead, as: 'lead', required: false },
      ],
      order: [['updatedAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    return res.json({ total: count, page, limit, data: rows });
  } catch (err) {
    console.error('[crm] listConversations', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** GET /api/crm/conversations/:id */
const getConversation = async (req, res) => {
  try {
    const tenantId = tid(req);
    const conv = await CrmConversation.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
      include: [{ model: CrmLead, as: 'lead', required: false }],
    });
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    const messages = await CrmMessage.findAll({
      where: { conversation_id: conv.id, tenant_id: tenantId },
      order: [['id', 'ASC']],
      limit: 200,
    });
    return res.json({ conversation: conv, messages });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /api/crm/conversations/:id/claim — human takes over */
const claimConversation = async (req, res) => {
  try {
    const tenantId = tid(req);
    const conv = await CrmConversation.findOne({ where: { id: req.params.id, tenant_id: tenantId } });
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    await conv.update({
      status: 'human_active',
      assigned_user_id: req.user?.id || null,
      handoff_reason: conv.handoff_reason || 'claimed_by_agent',
    });
    await CrmAuditLog.create({
      tenant_id: tenantId,
      actor_type: 'user',
      actor_id: req.user?.id || null,
      action: 'conversation_claimed',
      entity_type: 'conversation',
      entity_id: conv.id,
    });
    return res.json(conv);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /api/crm/conversations/:id/release — return to AI */
const releaseConversation = async (req, res) => {
  try {
    const tenantId = tid(req);
    const conv = await CrmConversation.findOne({ where: { id: req.params.id, tenant_id: tenantId } });
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    await conv.update({
      status: 'ai_resume',
      assigned_user_id: null,
      handoff_reason: null,
    });
    await CrmAuditLog.create({
      tenant_id: tenantId,
      actor_type: 'user',
      actor_id: req.user?.id || null,
      action: 'conversation_released_to_ai',
      entity_type: 'conversation',
      entity_id: conv.id,
    });
    return res.json(conv);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /api/crm/conversations/:id/agent-reply */
const agentReply = async (req, res) => {
  try {
    const tenantId = tid(req);
    const body = String(req.body?.message || '').trim();
    if (!body) return res.status(400).json({ message: 'message is required' });
    const conv = await CrmConversation.findOne({ where: { id: req.params.id, tenant_id: tenantId } });
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });

    if (!['human_active', 'queued'].includes(conv.status)) {
      await conv.update({ status: 'human_active', assigned_user_id: req.user?.id || null });
    }

    const { appendMessage } = require('../services/crmConversationService');
    const { enqueue, QUEUE_NAMES } = require('../services/queue');
    const msg = await appendMessage({
      tenantId,
      conversationId: conv.id,
      direction: 'outbound',
      senderType: 'agent',
      body,
      deliveryStatus: 'pending',
      meta: { agent_id: req.user?.id || null },
    });
    await enqueue(QUEUE_NAMES.WA_OUTBOUND, {
      tenant_id: tenantId,
      conversation_id: conv.id,
      phone: conv.phone,
      message: body,
      crm_message_id: msg.id,
    });
    return res.status(201).json({ message: msg, conversation: conv });
  } catch (err) {
    console.error('[crm] agentReply', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/crm/dev/simulate-inbound
 * Dev helper until WhatsApp Cloud webhook exists.
 */
const simulateInbound = async (req, res) => {
  try {
    const tenantId = tid(req);
    const { phone, message, sync } = req.body || {};
    if (!phone || !message) {
      return res.status(400).json({ message: 'phone and message are required' });
    }
    const payload = {
      tenantId,
      phone,
      message,
      campaignSource: req.body.campaign_source || 'dev_simulate',
      name: req.body.name || null,
    };
    if (sync === true || req.query.sync === '1') {
      const result = await processInboundAiTurn(payload);
      return res.json({ mode: 'sync', result });
    }
    const jobId = await enqueueInboundTurn(payload);
    return res.json({ mode: 'queue', jobId, queued: !!jobId });
  } catch (err) {
    console.error('[crm] simulateInbound', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

module.exports = {
  listLeads,
  updateLead,
  listConversations,
  getConversation,
  claimConversation,
  releaseConversation,
  agentReply,
  simulateInbound,
};
