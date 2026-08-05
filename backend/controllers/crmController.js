'use strict';

const { Op } = require('sequelize');
const {
  CrmLead,
  CrmConversation,
  CrmMessage,
  CrmAuditLog,
  Customer,
} = require('../models');
const { resolveTenantId } = require('../utils/tenantScope');
const { enqueueInboundTurn, processInboundAiTurn } = require('../services/crmInboundTurnService');

function tid(req) {
  return resolveTenantId(req);
}

function isUnread(conv) {
  const inboundAt = conv.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : 0;
  if (!inboundAt) return false;
  const readAt = conv.staff_last_read_at ? new Date(conv.staff_last_read_at).getTime() : 0;
  if (!readAt) return true;
  return inboundAt > readAt;
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
      include: [{
        model: Customer,
        as: 'customer',
        required: false,
        attributes: ['id', 'name', 'phone', 'email'],
      }],
      order: [['last_message_at', 'DESC'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    return res.json({
      total: count,
      page,
      limit,
      stages: CrmLead.STAGES,
      data: rows,
    });
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
    if (req.query.unread === '1' || req.query.unread === 'true') {
      where[Op.and] = [
        ...(where[Op.and] || []),
        CrmConversation.sequelize.literal(
          '(last_inbound_at IS NOT NULL AND (staff_last_read_at IS NULL OR last_inbound_at > staff_last_read_at))'
        ),
      ];
    }
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
    const data = rows.map((r) => {
      const json = r.toJSON();
      json.unread = isUnread(json);
      return json;
    });
    const unreadCount = data.filter((d) => d.unread).length;
    return res.json({ total: count, page, limit, unread_in_page: unreadCount, data });
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

    // Opening a thread marks it read
    await conv.update({ staff_last_read_at: new Date() });

    const messages = await CrmMessage.findAll({
      where: { conversation_id: conv.id, tenant_id: tenantId },
      order: [['id', 'ASC']],
      limit: 200,
    });
    const json = conv.toJSON();
    json.unread = false;
    return res.json({ conversation: json, messages });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /api/crm/conversations/mark-all-read */
const markAllRead = async (req, res) => {
  try {
    const tenantId = tid(req);
    const rows = await CrmConversation.findAll({
      where: {
        tenant_id: tenantId,
        status: { [Op.ne]: 'closed' },
        last_inbound_at: { [Op.ne]: null },
      },
      attributes: ['id', 'last_inbound_at', 'staff_last_read_at'],
    });
    const ids = rows.filter((r) => isUnread(r)).map((r) => r.id);
    let affected = 0;
    if (ids.length) {
      const [n] = await CrmConversation.update(
        { staff_last_read_at: new Date() },
        { where: { id: { [Op.in]: ids }, tenant_id: tenantId } }
      );
      affected = n;
    }
    await CrmAuditLog.create({
      tenant_id: tenantId,
      actor_type: 'user',
      actor_id: req.user?.id || null,
      action: 'conversations_mark_all_read',
      entity_type: 'conversation',
      entity_id: null,
      meta: { affected },
    }).catch(() => {});
    return res.json({ message: 'Marked read', affected });
  } catch (err) {
    console.error('[crm] markAllRead', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /api/crm/conversations/:id/close */
const closeConversation = async (req, res) => {
  try {
    const tenantId = tid(req);
    const conv = await CrmConversation.findOne({ where: { id: req.params.id, tenant_id: tenantId } });
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    await conv.update({
      status: 'closed',
      assigned_user_id: null,
      handoff_reason: req.body?.reason || conv.handoff_reason || 'closed_by_agent',
      staff_last_read_at: new Date(),
    });
    await CrmAuditLog.create({
      tenant_id: tenantId,
      actor_type: 'user',
      actor_id: req.user?.id || null,
      action: 'conversation_closed',
      entity_type: 'conversation',
      entity_id: conv.id,
    });
    return res.json(conv);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

/** DELETE /api/crm/conversations/:id — remove chat thread + messages (lead kept) */
const deleteConversation = async (req, res) => {
  try {
    const tenantId = tid(req);
    const conv = await CrmConversation.findOne({ where: { id: req.params.id, tenant_id: tenantId } });
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });

    const conversationId = conv.id;
    const phone = conv.phone;
    const { sequelize } = require('../config/database');
    const {
      CrmBookingRequest,
      CrmAiMemory,
      CrmFollowUpJob,
      AiUsage,
    } = require('../models');

    await sequelize.transaction(async (t) => {
      await CrmMessage.destroy({
        where: { conversation_id: conversationId, tenant_id: tenantId },
        transaction: t,
      });
      await CrmBookingRequest.destroy({
        where: { conversation_id: conversationId, tenant_id: tenantId },
        transaction: t,
      }).catch(() => {});
      await CrmAiMemory.destroy({
        where: { conversation_id: conversationId, tenant_id: tenantId },
        transaction: t,
      }).catch(() => {});
      // Keep usage/follow-up history but detach from deleted thread
      await CrmFollowUpJob.update(
        { conversation_id: null },
        { where: { conversation_id: conversationId, tenant_id: tenantId }, transaction: t }
      ).catch(() => {});
      await AiUsage.update(
        { conversation_id: null },
        { where: { conversation_id: conversationId, tenant_id: tenantId }, transaction: t }
      ).catch(() => {});
      await conv.destroy({ transaction: t });
    });

    await CrmAuditLog.create({
      tenant_id: tenantId,
      actor_type: 'user',
      actor_id: req.user?.id || null,
      action: 'conversation_deleted',
      entity_type: 'conversation',
      entity_id: conversationId,
      meta: { phone },
    }).catch(() => {});

    return res.json({ message: 'Conversation deleted', id: conversationId });
  } catch (err) {
    console.error('[crm] deleteConversation', err);
    return res.status(500).json({ message: err.message || 'Server error' });
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
      staff_last_read_at: new Date(),
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

    if (conv.status === 'closed') {
      return res.status(400).json({ message: 'Conversation is closed. Release or open a new thread.' });
    }

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
    await conv.update({ staff_last_read_at: new Date() });
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
 * Dev / staging helper — blocked in production unless ALLOW_CRM_SIMULATE=true.
 */
const simulateInbound = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_CRM_SIMULATE !== 'true') {
      return res.status(403).json({ message: 'Simulate inbound is disabled in production.' });
    }
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
  markAllRead,
  closeConversation,
  deleteConversation,
  claimConversation,
  releaseConversation,
  agentReply,
  simulateInbound,
};
