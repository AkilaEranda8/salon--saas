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
const { emitConversationChanged } = require('../services/crmRealtime');

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

const FOLLOW_UP_STATUSES = ['none', 'pending', 'done', 'snoozed'];

function buildLeadWhere(req, tenantId) {
  const where = { tenant_id: tenantId };
  if (req.query.stage) {
    const stages = String(req.query.stage).split(',').map((s) => s.trim()).filter(Boolean);
    if (stages.length === 1) where.stage = stages[0];
    else if (stages.length > 1) where.stage = { [Op.in]: stages };
  }
  if (req.query.follow_up) where.follow_up_status = String(req.query.follow_up);
  if (req.query.opt_out === '1' || req.query.opt_out === 'true') where.marketing_opt_out = true;
  if (req.query.opt_out === '0' || req.query.opt_out === 'false') where.marketing_opt_out = false;
  if (req.query.has_customer === '1' || req.query.has_customer === 'true') {
    where.customer_id = { [Op.ne]: null };
  }
  if (req.query.has_customer === '0' || req.query.has_customer === 'false') {
    where.customer_id = null;
  }
  if (req.query.source) {
    where.campaign_source = { [Op.like]: `%${String(req.query.source).trim()}%` };
  }
  if (req.query.q) {
    const q = `%${String(req.query.q).trim()}%`;
    where[Op.or] = [
      { phone: { [Op.like]: q } },
      { name: { [Op.like]: q } },
      { campaign_source: { [Op.like]: q } },
    ];
  }
  return where;
}

async function attachLatestConversations(tenantId, leads) {
  if (!leads.length) return leads;
  const ids = leads.map((l) => l.id);
  const convs = await CrmConversation.findAll({
    where: { tenant_id: tenantId, lead_id: { [Op.in]: ids } },
    attributes: ['id', 'lead_id', 'status', 'phone', 'updatedAt', 'last_inbound_at'],
    order: [['updatedAt', 'DESC']],
  });
  const byLead = new Map();
  for (const c of convs) {
    if (!byLead.has(c.lead_id)) byLead.set(c.lead_id, c);
  }
  return leads.map((row) => {
    const json = typeof row.toJSON === 'function' ? row.toJSON() : { ...row };
    const conv = byLead.get(json.id);
    json.conversation = conv
      ? {
          id: conv.id,
          status: conv.status,
          phone: conv.phone,
          updated_at: conv.updatedAt,
          last_inbound_at: conv.last_inbound_at,
        }
      : null;
    return json;
  });
}

async function leadSummary(tenantId) {
  const byStage = {};
  for (const s of CrmLead.STAGES) byStage[s] = 0;
  const stageRows = await CrmLead.findAll({
    where: { tenant_id: tenantId },
    attributes: [
      'stage',
      [CrmLead.sequelize.fn('COUNT', CrmLead.sequelize.col('id')), 'count'],
    ],
    group: ['stage'],
    raw: true,
  });
  let total = 0;
  for (const r of stageRows) {
    const n = Number(r.count) || 0;
    total += n;
    byStage[r.stage] = n;
  }
  const [followUpPending, optOut, linkedCustomers] = await Promise.all([
    CrmLead.count({ where: { tenant_id: tenantId, follow_up_status: 'pending' } }),
    CrmLead.count({ where: { tenant_id: tenantId, marketing_opt_out: true } }),
    CrmLead.count({ where: { tenant_id: tenantId, customer_id: { [Op.ne]: null } } }),
  ]);
  const openPipeline = total - (byStage.converted || 0) - (byStage.lost || 0);
  return {
    total,
    openPipeline,
    followUpPending,
    optOut,
    linkedCustomers,
    byStage,
  };
}

/** GET /api/crm/leads */
const listLeads = async (req, res) => {
  try {
    const tenantId = tid(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required' });
    const where = buildLeadWhere(req, tenantId);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const sort = String(req.query.sort || 'recent');
    let order = [['last_message_at', 'DESC'], ['id', 'DESC']];
    if (sort === 'oldest') order = [['last_message_at', 'ASC'], ['id', 'ASC']];
    if (sort === 'name') order = [['name', 'ASC'], ['id', 'DESC']];
    if (sort === 'stage') order = [['stage', 'ASC'], ['last_message_at', 'DESC']];

    const { rows, count } = await CrmLead.findAndCountAll({
      where,
      include: [{
        model: Customer,
        as: 'customer',
        required: false,
        attributes: ['id', 'name', 'phone', 'email'],
      }],
      order,
      limit,
      offset: (page - 1) * limit,
    });
    const data = await attachLatestConversations(tenantId, rows);
    const summary = await leadSummary(tenantId);
    return res.json({
      total: count,
      page,
      limit,
      stages: CrmLead.STAGES,
      followUpStatuses: FOLLOW_UP_STATUSES,
      summary,
      data,
    });
  } catch (err) {
    console.error('[crm] listLeads', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** GET /api/crm/leads/summary */
const getLeadsSummary = async (req, res) => {
  try {
    const tenantId = tid(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required' });
    const summary = await leadSummary(tenantId);
    return res.json({ stages: CrmLead.STAGES, summary });
  } catch (err) {
    console.error('[crm] getLeadsSummary', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /api/crm/leads — manual lead */
const createLead = async (req, res) => {
  try {
    const tenantId = tid(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required' });
    const phoneRaw = String(req.body.phone || '').replace(/\D/g, '');
    if (!phoneRaw || phoneRaw.length < 9) {
      return res.status(400).json({ message: 'Valid phone required' });
    }
    const existing = await CrmLead.findOne({ where: { tenant_id: tenantId, phone: phoneRaw } });
    if (existing) {
      return res.status(409).json({ message: 'Lead with this phone already exists', lead: existing });
    }
    let stage = req.body.stage || 'new';
    if (!CrmLead.STAGES.includes(stage)) stage = 'new';
    const lead = await CrmLead.create({
      tenant_id: tenantId,
      phone: phoneRaw,
      name: req.body.name ? String(req.body.name).trim().slice(0, 150) : null,
      stage,
      campaign_source: req.body.campaign_source
        ? String(req.body.campaign_source).trim().slice(0, 120)
        : 'manual',
      follow_up_status: FOLLOW_UP_STATUSES.includes(req.body.follow_up_status)
        ? req.body.follow_up_status
        : 'none',
      interest_tags: Array.isArray(req.body.interest_tags) ? req.body.interest_tags : null,
      branch_id: req.body.branch_id || null,
      last_message_at: new Date(),
    });
    await CrmAuditLog.create({
      tenant_id: tenantId,
      actor_type: 'user',
      actor_id: req.user?.id || null,
      action: 'lead_created',
      entity_type: 'lead',
      entity_id: lead.id,
      meta: { phone: phoneRaw, source: lead.campaign_source },
    }).catch(() => {});
    return res.status(201).json(lead);
  } catch (err) {
    console.error('[crm] createLead', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** PATCH /api/crm/leads/:id */
const updateLead = async (req, res) => {
  try {
    const tenantId = tid(req);
    const lead = await CrmLead.findOne({ where: { id: req.params.id, tenant_id: tenantId } });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    const allowed = [
      'stage', 'name', 'campaign_source', 'interest_tags',
      'follow_up_status', 'branch_id', 'marketing_opt_out',
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (patch.stage && !CrmLead.STAGES.includes(patch.stage)) {
      return res.status(400).json({ message: `Invalid stage. Use: ${CrmLead.STAGES.join(', ')}` });
    }
    if (patch.follow_up_status && !FOLLOW_UP_STATUSES.includes(patch.follow_up_status)) {
      return res.status(400).json({ message: `Invalid follow_up_status` });
    }
    if (patch.name != null) patch.name = String(patch.name).trim().slice(0, 150) || null;
    if (patch.campaign_source != null) {
      patch.campaign_source = String(patch.campaign_source).trim().slice(0, 120) || null;
    }
    if (patch.marketing_opt_out !== undefined) {
      patch.marketing_opt_out = !!patch.marketing_opt_out;
      patch.marketing_opt_out_at = patch.marketing_opt_out ? new Date() : null;
    }
    await lead.update(patch);
    const refreshed = await CrmLead.findByPk(lead.id, {
      include: [{
        model: Customer,
        as: 'customer',
        required: false,
        attributes: ['id', 'name', 'phone', 'email'],
      }],
    });
    const [enriched] = await attachLatestConversations(tenantId, [refreshed]);
    return res.json(enriched);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /api/crm/leads/bulk  { ids, stage?, follow_up_status?, marketing_opt_out? } */
const bulkUpdateLeads = async (req, res) => {
  try {
    const tenantId = tid(req);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ message: 'ids required' });
    const patch = {};
    if (req.body.stage != null) {
      if (!CrmLead.STAGES.includes(req.body.stage)) {
        return res.status(400).json({ message: 'Invalid stage' });
      }
      patch.stage = req.body.stage;
    }
    if (req.body.follow_up_status != null) {
      if (!FOLLOW_UP_STATUSES.includes(req.body.follow_up_status)) {
        return res.status(400).json({ message: 'Invalid follow_up_status' });
      }
      patch.follow_up_status = req.body.follow_up_status;
    }
    if (req.body.marketing_opt_out !== undefined) {
      patch.marketing_opt_out = !!req.body.marketing_opt_out;
      patch.marketing_opt_out_at = patch.marketing_opt_out ? new Date() : null;
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ message: 'Nothing to update' });
    }
    const [n] = await CrmLead.update(patch, {
      where: { tenant_id: tenantId, id: { [Op.in]: ids } },
    });
    return res.json({ ok: true, updated: n, patch });
  } catch (err) {
    console.error('[crm] bulkUpdateLeads', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** DELETE /api/crm/leads/:id — remove lead + related CRM chats (salon customer kept) */
const deleteLead = async (req, res) => {
  try {
    const tenantId = tid(req);
    const lead = await CrmLead.findOne({ where: { id: req.params.id, tenant_id: tenantId } });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const leadId = lead.id;
    const phone = lead.phone;
    const { sequelize } = require('../config/database');
    const {
      CrmBookingRequest,
      CrmAiMemory,
      CrmFollowUpJob,
      AiUsage,
    } = require('../models');

    const convs = await CrmConversation.findAll({
      where: { tenant_id: tenantId, lead_id: leadId },
      attributes: ['id'],
    });
    const convIds = convs.map((c) => c.id);

    await sequelize.transaction(async (t) => {
      if (convIds.length) {
        await CrmMessage.destroy({
          where: { tenant_id: tenantId, conversation_id: { [Op.in]: convIds } },
          transaction: t,
        });
        await CrmBookingRequest.destroy({
          where: { tenant_id: tenantId, conversation_id: { [Op.in]: convIds } },
          transaction: t,
        }).catch(() => {});
        await AiUsage.update(
          { conversation_id: null },
          { where: { tenant_id: tenantId, conversation_id: { [Op.in]: convIds } }, transaction: t }
        ).catch(() => {});
        await CrmConversation.destroy({
          where: { tenant_id: tenantId, id: { [Op.in]: convIds } },
          transaction: t,
        });
      }

      await CrmBookingRequest.destroy({
        where: { tenant_id: tenantId, lead_id: leadId },
        transaction: t,
      }).catch(() => {});
      await CrmAiMemory.destroy({
        where: { tenant_id: tenantId, lead_id: leadId },
        transaction: t,
      }).catch(() => {});
      await CrmFollowUpJob.update(
        { lead_id: null, conversation_id: null },
        { where: { tenant_id: tenantId, lead_id: leadId }, transaction: t }
      ).catch(() => {});

      await lead.destroy({ transaction: t });
    });

    await CrmAuditLog.create({
      tenant_id: tenantId,
      actor_type: 'user',
      actor_id: req.user?.id || null,
      action: 'lead_deleted',
      entity_type: 'lead',
      entity_id: leadId,
      meta: { phone, conversations_deleted: convIds.length },
    }).catch(() => {});

    return res.json({
      message: 'Lead deleted',
      id: leadId,
      conversations_deleted: convIds.length,
    });
  } catch (err) {
    console.error('[crm] deleteLead', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

/** GET /api/crm/conversations */
const listConversations = async (req, res) => {
  try {
    const tenantId = tid(req);
    const where = { tenant_id: tenantId };
    if (req.query.status) where.status = req.query.status;
    if (req.query.lead_id) where.lead_id = Number(req.query.lead_id) || 0;
    if (req.query.phone) {
      const digits = String(req.query.phone).replace(/\D/g, '');
      if (digits) where.phone = { [Op.like]: `%${digits}%` };
    }
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

    // Side-panel context: linked salon customer + last few appointments (best-effort)
    let customer = null;
    let recentAppointments = [];
    const customerId = conv.customer_id || json.lead?.customer_id || null;
    if (customerId) {
      try {
        const { Appointment, Service } = require('../models');
        customer = await Customer.findOne({
          where: { id: customerId, tenant_id: tenantId },
          attributes: ['id', 'name', 'phone', 'email'],
        });
        recentAppointments = await Appointment.findAll({
          where: { customer_id: customerId, tenant_id: tenantId },
          attributes: ['id', 'date', 'time', 'status'],
          include: [{ model: Service, as: 'service', attributes: ['id', 'name'], required: false }],
          order: [['date', 'DESC'], ['time', 'DESC']],
          limit: 3,
        });
      } catch (e) {
        console.warn('[crm] getConversation side panel', e.message);
      }
    }
    return res.json({
      conversation: json,
      messages,
      customer,
      recent_appointments: recentAppointments,
    });
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
    emitConversationChanged(tenantId, conv.id, { reason: 'closed' });
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

    emitConversationChanged(tenantId, conversationId, { reason: 'deleted' });
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
    // Drop mid-flow booking state so AI doesn't resume a stale flow after release
    try {
      const { clearBookingSession } = require('../services/crmHandoffService');
      await clearBookingSession({ tenantId, conversationId: conv.id, phone: conv.phone });
    } catch (e) {
      console.warn('[crm] claim clear session', e.message);
    }
    // Also ask ai_engine to clear (handles phone variants / shared Redis patterns)
    try {
      const { clearSession } = require('../services/aiEngineClient');
      await clearSession({ tenantId, phone: conv.phone, conversationId: conv.id });
    } catch (e) {
      console.warn('[crm] claim ai_engine clearSession', e.message);
    }
    await CrmAuditLog.create({
      tenant_id: tenantId,
      actor_type: 'user',
      actor_id: req.user?.id || null,
      action: 'conversation_claimed',
      entity_type: 'conversation',
      entity_id: conv.id,
    });
    emitConversationChanged(tenantId, conv.id, { reason: 'claimed' });
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
    emitConversationChanged(tenantId, conv.id, { reason: 'released' });
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

    if (conv.status === 'queued') {
      // Agent answered a queued handoff — they now own the thread
      await conv.update({
        status: 'human_active',
        assigned_user_id: conv.assigned_user_id || req.user?.id || null,
      });
      try {
        const { clearBookingSession } = require('../services/crmHandoffService');
        await clearBookingSession({ tenantId, conversationId: conv.id, phone: conv.phone });
      } catch (e) {
        console.warn('[crm] agentReply clear session', e.message);
      }
    } else if (conv.status !== 'human_active') {
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
  getLeadsSummary,
  createLead,
  updateLead,
  bulkUpdateLeads,
  deleteLead,
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
