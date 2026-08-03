'use strict';

const { Op, fn, col } = require('sequelize');
const {
  AiUsage,
  CrmConversation,
  CrmBookingRequest,
  CrmLead,
} = require('../models');
const { resolveTenantId } = require('../utils/tenantScope');

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function aggregateUsage(tenantId, from, to) {
  const where = {
    tenant_id: tenantId,
    createdAt: { [Op.gte]: from },
  };
  if (to) where.createdAt[Op.lt] = to;

  const row = await AiUsage.findOne({
    where,
    attributes: [
      [fn('COUNT', col('id')), 'calls'],
      [fn('COALESCE', fn('SUM', col('prompt_tokens')), 0), 'prompt_tokens'],
      [fn('COALESCE', fn('SUM', col('completion_tokens')), 0), 'completion_tokens'],
      [fn('COALESCE', fn('SUM', col('total_tokens')), 0), 'total_tokens'],
      [fn('COALESCE', fn('SUM', col('cost')), 0), 'cost'],
      [fn('AVG', col('latency_ms')), 'avg_latency_ms'],
    ],
    raw: true,
  });

  return {
    calls: Number(row?.calls || 0),
    prompt_tokens: Number(row?.prompt_tokens || 0),
    completion_tokens: Number(row?.completion_tokens || 0),
    total_tokens: Number(row?.total_tokens || 0),
    cost: Number(row?.cost || 0),
    avg_latency_ms: row?.avg_latency_ms != null ? Math.round(Number(row.avg_latency_ms)) : null,
  };
}

async function byProvider(tenantId, from) {
  const rows = await AiUsage.findAll({
    where: {
      tenant_id: tenantId,
      createdAt: { [Op.gte]: from },
    },
    attributes: [
      'provider',
      'model',
      [fn('COUNT', col('id')), 'calls'],
      [fn('COALESCE', fn('SUM', col('total_tokens')), 0), 'total_tokens'],
      [fn('COALESCE', fn('SUM', col('cost')), 0), 'cost'],
    ],
    group: ['provider', 'model'],
    raw: true,
  });
  return rows.map((r) => ({
    provider: r.provider,
    model: r.model,
    calls: Number(r.calls || 0),
    total_tokens: Number(r.total_tokens || 0),
    cost: Number(r.cost || 0),
  }));
}

async function dailySeries(tenantId, days = 14) {
  const from = daysAgo(days - 1);
  const rows = await AiUsage.findAll({
    where: {
      tenant_id: tenantId,
      createdAt: { [Op.gte]: from },
    },
    attributes: [
      [fn('DATE', col('created_at')), 'day'],
      [fn('COUNT', col('id')), 'calls'],
      [fn('COALESCE', fn('SUM', col('cost')), 0), 'cost'],
      [fn('COALESCE', fn('SUM', col('total_tokens')), 0), 'tokens'],
    ],
    group: [fn('DATE', col('created_at'))],
    order: [[fn('DATE', col('created_at')), 'ASC']],
    raw: true,
  });
  return rows.map((r) => ({
    day: r.day,
    calls: Number(r.calls || 0),
    cost: Number(r.cost || 0),
    tokens: Number(r.tokens || 0),
  }));
}

/** GET /api/crm/analytics/ai-cost */
const getAiCostSummary = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant required' });

    const todayStart = startOfDay();
    const monthStart = startOfMonth();

    const [today, month, providers, series] = await Promise.all([
      aggregateUsage(tenantId, todayStart),
      aggregateUsage(tenantId, monthStart),
      byProvider(tenantId, monthStart),
      dailySeries(tenantId, 14),
    ]);

    const convCount = await CrmConversation.count({
      where: {
        tenant_id: tenantId,
        createdAt: { [Op.gte]: monthStart },
      },
    });

    const bookingCount = await CrmBookingRequest.count({
      where: {
        tenant_id: tenantId,
        status: 'confirmed',
        createdAt: { [Op.gte]: monthStart },
      },
    });

    const leadCount = await CrmLead.count({
      where: {
        tenant_id: tenantId,
        createdAt: { [Op.gte]: monthStart },
      },
    });

    const converted = await CrmLead.count({
      where: {
        tenant_id: tenantId,
        stage: 'converted',
        updatedAt: { [Op.gte]: monthStart },
      },
    });

    const costPerConversation = convCount > 0 ? month.cost / convCount : 0;
    const costPerBooking = bookingCount > 0 ? month.cost / bookingCount : 0;

    const recent = await AiUsage.findAll({
      where: { tenant_id: tenantId },
      order: [['id', 'DESC']],
      limit: 25,
      attributes: [
        'id', 'provider', 'model', 'prompt_tokens', 'completion_tokens',
        'total_tokens', 'cost', 'currency', 'latency_ms', 'purpose',
        'conversation_id', 'createdAt',
      ],
    });

    return res.json({
      currency: 'USD',
      today: {
        ...today,
        label: "Today's AI Cost",
      },
      month: {
        ...month,
        label: 'Monthly AI Cost',
        conversations: convCount,
        bookings: bookingCount,
        leads: leadCount,
        converted_leads: converted,
        cost_per_conversation: costPerConversation,
        cost_per_booking: costPerBooking,
      },
      providers,
      series,
      recent,
    });
  } catch (err) {
    console.error('[crm-analytics] ai-cost', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

/** GET /api/crm/analytics/overview — engagement KPIs */
const getCrmOverview = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant required' });
    const monthStart = startOfMonth();

    const [leads, conversations, activeChats, bookings, aiMonth] = await Promise.all([
      CrmLead.count({ where: { tenant_id: tenantId, createdAt: { [Op.gte]: monthStart } } }),
      CrmConversation.count({ where: { tenant_id: tenantId, createdAt: { [Op.gte]: monthStart } } }),
      CrmConversation.count({
        where: {
          tenant_id: tenantId,
          status: { [Op.in]: ['ai_active', 'queued', 'human_active', 'ai_resume'] },
        },
      }),
      CrmBookingRequest.count({
        where: { tenant_id: tenantId, status: 'confirmed', createdAt: { [Op.gte]: monthStart } },
      }),
      aggregateUsage(tenantId, monthStart),
    ]);

    const conversion = conversations > 0 ? (bookings / conversations) * 100 : 0;

    return res.json({
      month: {
        leads,
        conversations,
        active_chats: activeChats,
        confirmed_bookings: bookings,
        conversion_rate_pct: Math.round(conversion * 10) / 10,
        ai_cost: aiMonth.cost,
        ai_calls: aiMonth.calls,
      },
    });
  } catch (err) {
    console.error('[crm-analytics] overview', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAiCostSummary,
  getCrmOverview,
};
