'use strict';

/**
 * RC8 — Monthly Gemini cost dashboard aggregates (from AiUsage + policy constants).
 * Does not call Gemini. No API keys. No message contents.
 */

const { Op } = require('sequelize');
const { AiUsage, CrmConversation } = require('../models');

/** Official RC8 policy (USD) — mirrors ai_engine cost_router */
const POLICY = {
  monthly_hard_cap: 20,
  monthly_planned: 16,
  safety_reserve: 4,
  target_avg_conversation: 0.016,
  warn_conversation: 0.02,
  hard_conversation_cap: 0.03,
  daily_planned: 0.53,
  models: {
    'gemini-3.1-flash-lite': { role: 'simple', input_per_1m: 0.25, output_per_1m: 1.5 },
    'gemini-3.8-flash': { role: 'normal', input_per_1m: 0.75, output_per_1m: 3.75 },
    'gemini-4-hydrogen': { role: 'complex', input_per_1m: 1.5, output_per_1m: 7.5 },
  },
  argon_blocked: true,
};

function startOfMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function buildMonthlyBudgetDashboard(tenantId, { from = null } = {}) {
  const monthStart = from || startOfMonth();
  const where = {
    tenant_id: tenantId,
    createdAt: { [Op.gte]: monthStart },
  };

  const rows = await AiUsage.findAll({
    where,
    attributes: [
      'id', 'model', 'provider', 'prompt_tokens', 'completion_tokens',
      'total_tokens', 'cost', 'conversation_id', 'purpose', 'createdAt',
    ],
    raw: true,
  });

  let totalSpend = 0;
  let totalPrompt = 0;
  let totalCompletion = 0;
  let repairCalls = 0;
  const byModel = {};
  const byConversation = new Map();

  for (const r of rows) {
    const cost = Number(r.cost) || 0;
    totalSpend += cost;
    totalPrompt += Number(r.prompt_tokens) || 0;
    totalCompletion += Number(r.completion_tokens) || 0;
    const model = String(r.model || 'unknown');
    if (!byModel[model]) {
      byModel[model] = { model, calls: 0, cost: 0, prompt_tokens: 0, completion_tokens: 0 };
    }
    byModel[model].calls += 1;
    byModel[model].cost += cost;
    byModel[model].prompt_tokens += Number(r.prompt_tokens) || 0;
    byModel[model].completion_tokens += Number(r.completion_tokens) || 0;
    const purpose = String(r.purpose || '');
    if (/repair|retry/i.test(purpose)) repairCalls += 1;

    const cid = r.conversation_id || `call:${r.id}`;
    const prev = byConversation.get(cid) || { conversation_id: cid, cost: 0, calls: 0 };
    prev.cost += cost;
    prev.calls += 1;
    byConversation.set(cid, prev);
  }

  const convCosts = [...byConversation.values()].map((c) => c.cost).sort((a, b) => a - b);
  const convCount = byConversation.size || 0;
  const avgConv = convCount ? totalSpend / convCount : 0;
  const p95 = percentile(convCosts, 95);

  const routing = Object.values(byModel).map((m) => ({
    ...m,
    cost: Math.round(m.cost * 1e6) / 1e6,
    pct_of_spend: totalSpend ? Math.round((m.cost / totalSpend) * 1000) / 10 : 0,
  }));

  const hard = POLICY.monthly_hard_cap;
  const pct = hard ? (totalSpend / hard) * 100 : 0;
  const alerts = [];
  for (const th of [70, 85, 95]) {
    if (pct >= th) alerts.push(th);
  }

  const crmConvMonth = await CrmConversation.count({
    where: { tenant_id: tenantId, createdAt: { [Op.gte]: monthStart } },
  }).catch(() => convCount);

  return {
    ok: true,
    tenant_id: tenantId,
    period_start_utc: monthStart.toISOString(),
    policy: POLICY,
    total_spend_usd: Math.round(totalSpend * 1e6) / 1e6,
    spend_by_model: routing,
    conversations_with_usage: convCount,
    crm_conversations_month: crmConvMonth,
    avg_cost_per_conversation: Math.round(avgConv * 1e6) / 1e6,
    p95_cost_per_conversation: Math.round(p95 * 1e6) / 1e6,
    target_avg_conversation: POLICY.target_avg_conversation,
    token_consumption: {
      prompt_tokens: totalPrompt,
      completion_tokens: totalCompletion,
      total_tokens: totalPrompt + totalCompletion,
    },
    model_routing_distribution: routing.map((m) => ({
      model: m.model,
      calls: m.calls,
      pct_calls: rows.length ? Math.round((m.calls / rows.length) * 1000) / 10 : 0,
    })),
    repair_retry_calls: repairCalls,
    budget: {
      hard_cap: hard,
      planned: POLICY.monthly_planned,
      safety_reserve: POLICY.safety_reserve,
      spent: Math.round(totalSpend * 1e6) / 1e6,
      remaining_hard: Math.round(Math.max(0, hard - totalSpend) * 1e6) / 1e6,
      pct_of_hard: Math.round(pct * 10) / 10,
      allow_hydrogen: totalSpend < POLICY.monthly_planned,
      hard_exhausted: totalSpend >= hard,
      alerts_pct: alerts,
    },
    notes: [
      'Costs from AiUsage using official rate table / DB rates.',
      'gemini-4-argon is blocked from normal production routing.',
      'Atomic Redis reservations live in ai_engine budget_ledger (after RC8 deploy).',
    ],
  };
}

module.exports = {
  POLICY,
  buildMonthlyBudgetDashboard,
};
