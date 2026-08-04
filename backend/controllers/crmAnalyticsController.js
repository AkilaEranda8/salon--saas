'use strict';

const { Op, fn, col } = require('sequelize');
const {
  AiUsage,
  AiCreditEntry,
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

async function sumAllUsageCost(tenantId) {
  const row = await AiUsage.findOne({
    where: { tenant_id: tenantId },
    attributes: [[fn('COALESCE', fn('SUM', col('cost')), 0), 'cost']],
    raw: true,
  });
  return Number(row?.cost || 0);
}

async function sumCreditLedger(tenantId) {
  const row = await AiCreditEntry.findOne({
    where: { tenant_id: tenantId },
    attributes: [[fn('COALESCE', fn('SUM', col('amount_usd')), 0), 'total']],
    raw: true,
  });
  return Number(row?.total || 0);
}

async function getWalletSummary(tenantId) {
  const [credits_added, spent_total, topupAgg, recentEntries] = await Promise.all([
    sumCreditLedger(tenantId),
    sumAllUsageCost(tenantId),
    AiCreditEntry.findAll({
      where: { tenant_id: tenantId, entry_type: 'topup' },
      attributes: [
        [fn('COALESCE', fn('SUM', col('amount_usd')), 0), 'total'],
        [fn('COUNT', col('id')), 'count'],
      ],
      raw: true,
    }),
    AiCreditEntry.findAll({
      where: { tenant_id: tenantId },
      order: [['id', 'DESC']],
      limit: 20,
    }),
  ]);

  const topupRow = topupAgg[0] || {};
  const remaining = credits_added - spent_total;

  return {
    currency: 'USD',
    remaining: Math.round(remaining * 10000) / 10000,
    credits_added: Math.round(credits_added * 10000) / 10000,
    spent_total: Math.round(spent_total * 10000) / 10000,
    topups_total: Math.round(Number(topupRow.total || 0) * 10000) / 10000,
    topups_count: Number(topupRow.count || 0),
    low_balance: remaining < 5,
    note: 'Google AI Studio does not expose prepay balance via API. Record top-ups here; remaining = credits − tracked AI spend.',
    entries: recentEntries,
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

    const [today, month, providers, series, wallet] = await Promise.all([
      aggregateUsage(tenantId, todayStart),
      aggregateUsage(tenantId, monthStart),
      byProvider(tenantId, monthStart),
      dailySeries(tenantId, 14),
      getWalletSummary(tenantId),
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
      wallet,
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

    const [leads, conversations, activeChats, bookings, aiMonth, wallet] = await Promise.all([
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
      getWalletSummary(tenantId),
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
        ai_balance_remaining: wallet.remaining,
      },
      wallet,
    });
  } catch (err) {
    console.error('[crm-analytics] overview', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /api/crm/analytics/ai-credits/topup  { amount_usd, note? } */
const addAiCreditTopup = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant required' });

    const amount = Number(req.body?.amount_usd);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'amount_usd must be a positive number' });
    }
    if (amount > 100000) {
      return res.status(400).json({ message: 'amount_usd too large' });
    }

    const entry = await AiCreditEntry.create({
      tenant_id: tenantId,
      entry_type: 'topup',
      amount_usd: Math.round(amount * 10000) / 10000,
      note: String(req.body?.note || 'Gemini / AI Studio top-up').slice(0, 255),
      created_by: req.user?.id || null,
    });

    const wallet = await getWalletSummary(tenantId);
    return res.status(201).json({ entry, wallet });
  } catch (err) {
    console.error('[crm-analytics] topup', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

/**
 * POST /api/crm/analytics/ai-credits/set-balance  { balance_usd, note? }
 * Sync remaining to match the balance shown in Google AI Studio.
 */
const setAiCreditBalance = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant required' });

    const target = Number(req.body?.balance_usd);
    if (!Number.isFinite(target) || target < 0) {
      return res.status(400).json({ message: 'balance_usd must be a non-negative number' });
    }
    if (target > 1000000) {
      return res.status(400).json({ message: 'balance_usd too large' });
    }

    const current = await getWalletSummary(tenantId);
    const delta = Math.round((target - current.remaining) * 10000) / 10000;

    const entry = await AiCreditEntry.create({
      tenant_id: tenantId,
      entry_type: 'set_balance',
      amount_usd: delta,
      note: String(req.body?.note || `Synced to AI Studio balance USD ${target}`).slice(0, 255),
      created_by: req.user?.id || null,
    });

    const wallet = await getWalletSummary(tenantId);
    return res.json({ entry, wallet, previous_remaining: current.remaining });
  } catch (err) {
    console.error('[crm-analytics] set-balance', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

module.exports = {
  getAiCostSummary,
  getCrmOverview,
  addAiCreditTopup,
  setAiCreditBalance,
};
