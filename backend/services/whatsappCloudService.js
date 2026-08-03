/**
 * WhatsApp Cloud API adapter (Meta Graph).
 */
'use strict';

const crypto = require('crypto');
const { WhatsAppBusinessAccount } = require('../models');
const { encryptSecret, decryptSecret, maskSecret, isMaskedPlaceholder } = require('../utils/secretCrypto');
const { getRedis, cacheKey } = require('../utils/redis');

const GRAPH_BASE = 'https://graph.facebook.com';

async function getWabaByTenant(tenantId) {
  return WhatsAppBusinessAccount.findOne({ where: { tenant_id: tenantId } });
}

async function getWabaByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return null;
  const redis = getRedis();
  const ck = cacheKey(0, 'waba', 'pnid', phoneNumberId);
  if (redis) {
    try {
      const tid = await redis.get(ck);
      if (tid) {
        const row = await WhatsAppBusinessAccount.findOne({ where: { tenant_id: Number(tid) } });
        if (row) return row;
      }
    } catch { /* ignore */ }
  }
  const row = await WhatsAppBusinessAccount.findOne({
    where: { phone_number_id: String(phoneNumberId), enabled: true },
  });
  if (row && redis) {
    try {
      await redis.set(ck, String(row.tenant_id), 'EX', 300);
    } catch { /* ignore */ }
  }
  return row;
}

/** Find any WABA matching verify token (webhook subscription challenge). */
async function getWabaByVerifyToken(token) {
  if (!token) return null;
  return WhatsAppBusinessAccount.findOne({
    where: { verify_token: String(token), enabled: true },
  });
}

function toPublic(row) {
  if (!row) {
    return {
      enabled: false,
      waba_id: '',
      phone_number_id: '',
      display_phone: '',
      access_token: '',
      access_token_set: false,
      app_secret: '',
      app_secret_set: false,
      verify_token: '',
      api_version: 'v21.0',
      template_confirm: '',
      template_reminder: '',
      last_error: null,
    };
  }
  const token = decryptSecret(row.access_token_enc);
  const secret = decryptSecret(row.app_secret_enc);
  return {
    enabled: !!row.enabled,
    waba_id: row.waba_id || '',
    phone_number_id: row.phone_number_id || '',
    display_phone: row.display_phone || '',
    access_token: maskSecret(token),
    access_token_set: !!token,
    app_secret: maskSecret(secret),
    app_secret_set: !!secret,
    verify_token: row.verify_token || '',
    api_version: row.api_version || 'v21.0',
    template_confirm: row.template_confirm || '',
    template_reminder: row.template_reminder || '',
    last_error: row.last_error || null,
    webhook_url_hint: '/api/webhooks/whatsapp',
  };
}

async function upsertWabaSettings(tenantId, body, userId) {
  const [row] = await WhatsAppBusinessAccount.findOrCreate({
    where: { tenant_id: tenantId },
    defaults: { tenant_id: tenantId, enabled: false },
  });

  const patch = { updated_by: userId || null };
  if (body.enabled !== undefined) patch.enabled = !!body.enabled;
  if (body.waba_id !== undefined) patch.waba_id = String(body.waba_id || '').trim() || null;
  if (body.phone_number_id !== undefined) patch.phone_number_id = String(body.phone_number_id || '').trim() || null;
  if (body.display_phone !== undefined) patch.display_phone = String(body.display_phone || '').trim() || null;
  if (body.verify_token !== undefined) patch.verify_token = String(body.verify_token || '').trim() || null;
  if (body.api_version !== undefined) patch.api_version = String(body.api_version || 'v21.0').trim();
  if (body.template_confirm !== undefined) patch.template_confirm = String(body.template_confirm || '').trim() || null;
  if (body.template_reminder !== undefined) patch.template_reminder = String(body.template_reminder || '').trim() || null;

  if (body.access_token != null && !isMaskedPlaceholder(body.access_token)) {
    patch.access_token_enc = encryptSecret(String(body.access_token).trim());
  }
  if (body.app_secret != null && !isMaskedPlaceholder(body.app_secret)) {
    patch.app_secret_enc = encryptSecret(String(body.app_secret).trim());
  }

  await row.update(patch);
  await row.reload();

  // bust phone_number_id cache
  const redis = getRedis();
  if (redis && row.phone_number_id) {
    try {
      await redis.del(cacheKey(0, 'waba', 'pnid', row.phone_number_id));
    } catch { /* ignore */ }
  }
  return row;
}

function verifyMetaSignature(appSecret, rawBody, signatureHeader) {
  if (!appSecret || !signatureHeader) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signatureHeader));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function normalizeWaTo(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) digits = `94${digits.slice(1)}`;
  return digits;
}

/**
 * Send a WhatsApp Cloud text message (within 24h session window).
 */
async function sendCloudText({ tenantId, to, body, wabaRow = null }) {
  const row = wabaRow || await getWabaByTenant(tenantId);
  if (!row || !row.enabled) {
    const err = new Error('WhatsApp Cloud API not configured/enabled for tenant');
    err.code = 'WABA_NOT_CONFIGURED';
    throw err;
  }
  const token = decryptSecret(row.access_token_enc);
  const phoneNumberId = row.phone_number_id;
  if (!token || !phoneNumberId) {
    const err = new Error('Missing Cloud API access token or phone_number_id');
    err.code = 'WABA_INCOMPLETE';
    throw err;
  }

  const version = row.api_version || 'v21.0';
  const url = `${GRAPH_BASE}/${version}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizeWaTo(to),
    type: 'text',
    text: { preview_url: false, body: String(body || '').slice(0, 4096) },
  };

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `Cloud API ${r.status}`;
    await row.update({ last_error: msg }).catch(() => {});
    const err = new Error(msg);
    err.code = 'WABA_SEND_FAILED';
    err.data = data;
    throw err;
  }
  await row.update({ last_error: null }).catch(() => {});
  const waMessageId = data?.messages?.[0]?.id || null;
  return { waMessageId, raw: data };
}

/**
 * Send an approved template message (outside session window).
 */
async function sendCloudTemplate({
  tenantId,
  to,
  templateName,
  languageCode = 'en',
  components = [],
  wabaRow = null,
}) {
  const row = wabaRow || await getWabaByTenant(tenantId);
  if (!row || !row.enabled) {
    const err = new Error('WhatsApp Cloud API not configured/enabled for tenant');
    err.code = 'WABA_NOT_CONFIGURED';
    throw err;
  }
  const token = decryptSecret(row.access_token_enc);
  const phoneNumberId = row.phone_number_id;
  if (!token || !phoneNumberId || !templateName) {
    const err = new Error('Missing token, phone_number_id, or template name');
    err.code = 'WABA_INCOMPLETE';
    throw err;
  }

  const version = row.api_version || 'v21.0';
  const url = `${GRAPH_BASE}/${version}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: normalizeWaTo(to),
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length ? { components } : {}),
    },
  };

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `Cloud API ${r.status}`;
    await row.update({ last_error: msg }).catch(() => {});
    const err = new Error(msg);
    err.code = 'WABA_SEND_FAILED';
    err.data = data;
    throw err;
  }
  await row.update({ last_error: null }).catch(() => {});
  return { waMessageId: data?.messages?.[0]?.id || null, raw: data };
}

/** Lightweight token check via phone number metadata */
async function testCloudConnection(tenantId) {
  const row = await getWabaByTenant(tenantId);
  if (!row) return { ok: false, message: 'No WABA settings saved' };
  const token = decryptSecret(row.access_token_enc);
  if (!token || !row.phone_number_id) {
    return { ok: false, message: 'access_token and phone_number_id required' };
  }
  const version = row.api_version || 'v21.0';
  const url = `${GRAPH_BASE}/${version}/${row.phone_number_id}?fields=display_phone_number,verified_name`;
  const started = Date.now();
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `HTTP ${r.status}`;
    await row.update({ last_error: msg });
    return { ok: false, message: msg, detail: data };
  }
  await row.update({
    last_error: null,
    display_phone: data.display_phone_number || row.display_phone,
  });
  return {
    ok: true,
    message: 'Cloud API connection OK',
    display_phone: data.display_phone_number,
    verified_name: data.verified_name,
    latency_ms: Date.now() - started,
  };
}

/**
 * Parse inbound webhook payload into message events.
 * @returns {Array<{ phoneNumberId, from, text, waMessageId, contactName, timestamp }>}
 */
function parseInboundMessages(payload) {
  const out = [];
  const entries = payload?.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;
      const contacts = value.contacts || [];
      const contactName = contacts[0]?.profile?.name || null;
      for (const msg of value.messages || []) {
        let text = '';
        if (msg.type === 'text') text = msg.text?.body || '';
        else if (msg.type === 'button') text = msg.button?.text || msg.button?.payload || '';
        else if (msg.type === 'interactive') {
          text = msg.interactive?.button_reply?.title
            || msg.interactive?.list_reply?.title
            || '';
        } else {
          text = `[${msg.type} received]`;
        }
        out.push({
          phoneNumberId,
          from: msg.from,
          text,
          waMessageId: msg.id,
          contactName,
          timestamp: msg.timestamp,
          type: msg.type,
        });
      }
    }
  }
  return out;
}

/**
 * Parse status callbacks.
 * @returns {Array<{ waMessageId, status, recipientId, errors }>}
 */
function parseStatusUpdates(payload) {
  const out = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id || null;
      for (const st of change.value?.statuses || []) {
        out.push({
          waMessageId: st.id,
          status: st.status, // sent | delivered | read | failed
          recipientId: st.recipient_id,
          errors: st.errors || null,
          timestamp: st.timestamp,
          phoneNumberId,
        });
      }
    }
  }
  return out;
}

module.exports = {
  getWabaByTenant,
  getWabaByPhoneNumberId,
  getWabaByVerifyToken,
  toPublic,
  upsertWabaSettings,
  verifyMetaSignature,
  sendCloudText,
  sendCloudTemplate,
  testCloudConnection,
  parseInboundMessages,
  parseStatusUpdates,
  normalizeWaTo,
};
