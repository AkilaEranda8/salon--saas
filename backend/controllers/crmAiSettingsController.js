/**
 * CRM AI Settings — tenant OpenAI / Gemini keys from UI.
 */
'use strict';

const { TenantAiSettings, AiModelRate } = require('../models');
const { resolveTenantId } = require('../utils/tenantScope');
const {
  encryptSecret,
  decryptSecret,
  maskSecret,
  isMaskedPlaceholder,
} = require('../utils/secretCrypto');

const PROVIDERS = new Set(['openai', 'gemini', 'nvidia', 'local']);

function defaultModelFor(provider) {
  if (provider === 'gemini') return 'gemini-2.0-flash-lite';
  if (provider === 'nvidia') return 'meta/llama-3.3-70b-instruct';
  if (provider === 'local') return 'local';
  return 'gpt-4o-mini';
}

async function getOrCreateSettings(tenantId) {
  const [row] = await TenantAiSettings.findOrCreate({
    where: { tenant_id: tenantId },
    defaults: {
      tenant_id: tenantId,
      provider: 'openai',
      model: 'gpt-4o-mini',
    },
  });
  return row;
}

function toPublic(row) {
  const openaiPlain = decryptSecret(row.openai_api_key_enc);
  const geminiPlain = decryptSecret(row.gemini_api_key_enc);
  return {
    provider: row.provider || 'openai',
    model: row.model || defaultModelFor(row.provider),
    openai_api_key: maskSecret(openaiPlain),
    openai_api_key_set: !!openaiPlain,
    gemini_api_key: maskSecret(geminiPlain),
    gemini_api_key_set: !!geminiPlain,
    updated_at: row.updatedAt || row.updated_at || null,
  };
}

/** GET /api/crm/ai-settings */
const getAiSettings = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant required.' });
    const row = await getOrCreateSettings(tenantId);
    return res.json(toPublic(row));
  } catch (err) {
    console.error('[ai-settings] get', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/** PUT /api/crm/ai-settings */
const updateAiSettings = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant required.' });

    const row = await getOrCreateSettings(tenantId);
    const body = req.body || {};
    const patch = { updated_by: req.user?.id || null };

    if (body.provider != null) {
      const p = String(body.provider).toLowerCase().trim();
      if (!PROVIDERS.has(p)) {
        return res.status(400).json({ message: 'Invalid provider. Use openai, gemini, nvidia, or local.' });
      }
      patch.provider = p;
    }

    if (body.model != null && String(body.model).trim()) {
      patch.model = String(body.model).trim().slice(0, 120);
    } else if (patch.provider && !body.model) {
      patch.model = defaultModelFor(patch.provider);
    }

    if (body.openai_api_key != null && !isMaskedPlaceholder(body.openai_api_key)) {
      patch.openai_api_key_enc = encryptSecret(String(body.openai_api_key).trim());
    }
    if (body.gemini_api_key != null && !isMaskedPlaceholder(body.gemini_api_key)) {
      patch.gemini_api_key_enc = encryptSecret(String(body.gemini_api_key).trim());
    }

    await row.update(patch);
    await row.reload();
    return res.json(toPublic(row));
  } catch (err) {
    console.error('[ai-settings] put', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * POST /api/crm/ai-settings/test
 * Lightweight connectivity check against selected provider.
 */
const testAiSettings = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant required.' });

    const row = await getOrCreateSettings(tenantId);
    const provider = String(req.body?.provider || row.provider || 'openai').toLowerCase();
    const model = String(req.body?.model || row.model || defaultModelFor(provider));

    let apiKey = null;
    if (provider === 'openai') {
      const fromBody = req.body?.openai_api_key;
      apiKey = (!isMaskedPlaceholder(fromBody) && fromBody)
        ? String(fromBody).trim()
        : decryptSecret(row.openai_api_key_enc);
    } else if (provider === 'gemini') {
      const fromBody = req.body?.gemini_api_key;
      apiKey = (!isMaskedPlaceholder(fromBody) && fromBody)
        ? String(fromBody).trim()
        : decryptSecret(row.gemini_api_key_enc);
    } else {
      return res.json({
        ok: true,
        provider,
        model,
        message: `${provider} uses server/env configuration — skipped live key test.`,
      });
    }

    if (!apiKey) {
      return res.status(400).json({ ok: false, message: `No ${provider} API key configured.` });
    }

    const started = Date.now();
    if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        return res.status(400).json({
          ok: false,
          provider,
          message: `OpenAI rejected key (${r.status}).`,
          detail: text.slice(0, 200),
        });
      }
    } else if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
      const r = await fetch(url);
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        return res.status(400).json({
          ok: false,
          provider,
          message: `Gemini rejected key (${r.status}).`,
          detail: text.slice(0, 200),
        });
      }
    }

    return res.json({
      ok: true,
      provider,
      model,
      latency_ms: Date.now() - started,
      message: 'Connection successful.',
    });
  } catch (err) {
    console.error('[ai-settings] test', err);
    return res.status(500).json({ ok: false, message: err.message || 'Test failed.' });
  }
};

/** Internal: decrypted config for ai_engine (service auth). */
const getAiSettingsInternal = async (req, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId || req.query.tenantId, 10);
    if (!tenantId) return res.status(400).json({ message: 'tenantId required.' });
    const row = await getOrCreateSettings(tenantId);
    return res.json({
      tenant_id: tenantId,
      provider: row.provider,
      model: row.model,
      openai_api_key: decryptSecret(row.openai_api_key_enc),
      gemini_api_key: decryptSecret(row.gemini_api_key_enc),
    });
  } catch (err) {
    console.error('[ai-settings] internal', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const listModelRates = async (_req, res) => {
  try {
    const rows = await AiModelRate.findAll({
      where: { active: true },
      order: [['provider', 'ASC'], ['model', 'ASC']],
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  getAiSettings,
  updateAiSettings,
  testAiSettings,
  getAiSettingsInternal,
  listModelRates,
};
