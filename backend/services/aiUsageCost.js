'use strict';

/**
 * Token → USD cost for AiUsage rows.
 * Matches ai_model_rates with normalization + aliases so flash-latest etc. are not $0.
 */
const { Op } = require('sequelize');
const { AiModelRate, AiUsage } = require('../models');

/** Fallback when DB has no row (USD per 1k tokens). ~25% below list for salon tracking. */
const FALLBACK_RATES = {
  'openai:gpt-4o-mini': { input_per_1k: 0.00011, output_per_1k: 0.00045 },
  'openai:gpt-4o': { input_per_1k: 0.0019, output_per_1k: 0.0075 },
  'gemini:gemini-2.0-flash-lite': { input_per_1k: 0.000055, output_per_1k: 0.00022 },
  'gemini:gemini-2.0-flash': { input_per_1k: 0.000075, output_per_1k: 0.0003 },
  'gemini:gemini-1.5-flash': { input_per_1k: 0.000055, output_per_1k: 0.00022 },
  'gemini:gemini-1.5-flash-8b': { input_per_1k: 0.000028, output_per_1k: 0.00011 },
  'gemini:gemini-flash-latest': { input_per_1k: 0.000075, output_per_1k: 0.0003 },
  'gemini:gemini-2.5-flash': { input_per_1k: 0.00011, output_per_1k: 0.00045 },
  'gemini:gemini-2.5-flash-lite': { input_per_1k: 0.000055, output_per_1k: 0.00022 },
};

const MODEL_ALIASES = {
  'gemini-flash-latest': 'gemini-2.0-flash',
  'gemini-flash': 'gemini-2.0-flash',
  'gemini-pro-latest': 'gemini-2.0-flash',
  'gemini-1.5-flash-latest': 'gemini-1.5-flash',
  'gemini-2.0-flash-exp': 'gemini-2.0-flash',
};

function normalizeModel(model) {
  let m = String(model || 'unknown').trim().toLowerCase();
  if (m.startsWith('models/')) m = m.slice('models/'.length);
  return MODEL_ALIASES[m] || m;
}

function normalizeProvider(provider) {
  return String(provider || 'unknown').trim().toLowerCase();
}

function calcFromRate(rate, promptTokens, completionTokens) {
  const input = Number(rate.input_per_1k) * (promptTokens / 1000);
  const output = Number(rate.output_per_1k) * (completionTokens / 1000);
  const cost = Math.round((input + output) * 1e6) / 1e6; // 6 dp
  return { cost, currency: rate.currency || 'USD' };
}

async function resolveRate(provider, model) {
  const p = normalizeProvider(provider);
  const m = normalizeModel(model);

  let rate = await AiModelRate.findOne({
    where: { provider: p, model: m, active: true },
  });
  if (rate) return rate;

  // Prefix / contains match (e.g. gemini-2.0-flash-001 → gemini-2.0-flash)
  const candidates = await AiModelRate.findAll({
    where: { provider: p, active: true },
  });
  const scored = candidates
    .map((r) => {
      const rm = normalizeModel(r.model);
      let score = 0;
      if (m === rm) score = 100;
      else if (m.startsWith(rm) || rm.startsWith(m)) score = 80;
      else if (m.includes(rm) || rm.includes(m)) score = 40;
      else if (m.includes('flash-lite') && rm.includes('flash-lite')) score = 70;
      else if (m.includes('flash') && rm.includes('flash') && !rm.includes('lite')) score = 60;
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored[0]) return scored[0].r;

  const fb = FALLBACK_RATES[`${p}:${m}`]
    || (m.includes('flash-lite') ? FALLBACK_RATES['gemini:gemini-2.0-flash-lite'] : null)
    || (m.includes('flash') ? FALLBACK_RATES['gemini:gemini-2.0-flash'] : null)
    || (p === 'openai' ? FALLBACK_RATES['openai:gpt-4o-mini'] : null)
    || (p === 'gemini' ? FALLBACK_RATES['gemini:gemini-2.0-flash'] : null);

  if (fb) return { ...fb, currency: 'USD' };
  return null;
}

async function computeCost(provider, model, promptTokens, completionTokens) {
  const prompt = Number(promptTokens) || 0;
  const completion = Number(completionTokens) || 0;
  const rate = await resolveRate(provider, model);
  if (!rate) return { cost: 0, currency: 'USD', matched_model: null };
  const out = calcFromRate(rate, prompt, completion);
  return { ...out, matched_model: rate.model || normalizeModel(model) };
}

/**
 * Persist one AI usage row with correct cost.
 */
async function recordAiUsage({
  tenant_id,
  conversation_id = null,
  provider,
  model,
  prompt_tokens = 0,
  completion_tokens = 0,
  latency_ms = null,
  purpose = 'whatsapp_turn',
}) {
  if (!tenant_id) return null;
  const prompt = Number(prompt_tokens) || 0;
  const completion = Number(completion_tokens) || 0;
  const { cost, currency } = await computeCost(provider, model, prompt, completion);
  return AiUsage.create({
    tenant_id,
    conversation_id: conversation_id || null,
    provider: normalizeProvider(provider) || 'unknown',
    model: model ? String(model).slice(0, 120) : null,
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    cost,
    currency,
    latency_ms: latency_ms != null ? Number(latency_ms) : null,
    purpose: purpose || 'whatsapp_turn',
  });
}

/** Recompute cost for rows stored as 0 while tokens > 0 (missing rate bug). */
async function backfillZeroCosts({ limit = 5000 } = {}) {
  const rows = await AiUsage.findAll({
    where: {
      cost: { [Op.lte]: 0 },
      total_tokens: { [Op.gt]: 0 },
    },
    order: [['id', 'ASC']],
    limit,
  });
  let updated = 0;
  for (const row of rows) {
    const { cost, currency } = await computeCost(
      row.provider,
      row.model,
      row.prompt_tokens,
      row.completion_tokens
    );
    if (cost > 0) {
      await row.update({ cost, currency });
      updated += 1;
    }
  }
  return { scanned: rows.length, updated };
}

/** Reprice all usage rows after rate changes. */
async function recomputeAllCosts({ limit = 20000 } = {}) {
  const rows = await AiUsage.findAll({
    where: { total_tokens: { [Op.gt]: 0 } },
    order: [['id', 'ASC']],
    limit,
  });
  let updated = 0;
  for (const row of rows) {
    const { cost, currency } = await computeCost(
      row.provider,
      row.model,
      row.prompt_tokens,
      row.completion_tokens
    );
    if (Number(row.cost) !== cost || row.currency !== currency) {
      await row.update({ cost, currency });
      updated += 1;
    }
  }
  return { scanned: rows.length, updated };
}

module.exports = {
  normalizeModel,
  normalizeProvider,
  computeCost,
  recordAiUsage,
  backfillZeroCosts,
  recomputeAllCosts,
  FALLBACK_RATES,
};
