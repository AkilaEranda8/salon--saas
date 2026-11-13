/**
 * HTTP client for the separate ai_engine service.
 * Always sends service secret (fail-closed if missing).
 */
'use strict';

const { getServiceSecret } = require('../middleware/serviceAuth');

const AI_ENGINE_URL = (process.env.AI_ENGINE_URL || 'http://localhost:8010').replace(/\/+$/, '');

function headers() {
  const secret = getServiceSecret();
  if (!secret) {
    const err = new Error('AI_ENGINE_SERVICE_SECRET not configured');
    err.code = 'SERVICE_SECRET_MISSING';
    throw err;
  }
  return {
    'Content-Type': 'application/json',
    'X-Service-Key': secret,
  };
}

async function health() {
  const r = await fetch(`${AI_ENGINE_URL}/health`);
  if (!r.ok) throw new Error(`ai_engine health ${r.status}`);
  return r.json();
}

/**
 * @param {object} payload TurnRequest fields (never include provider API keys)
 */
async function runTurn(payload) {
  // Strip any accidental key fields (C13)
  const {
    openaiApiKey,
    geminiApiKey,
    openai_api_key,
    gemini_api_key,
    ...safe
  } = payload || {};

  const r = await fetch(`${AI_ENGINE_URL}/v1/turns`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(safe),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { detail: text }; }
  if (!r.ok) {
    const err = new Error(data.detail || data.message || `ai_engine turn failed (${r.status})`);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * Drop the customer's in-progress booking/cancel/reschedule dialogue (call when a human claims the chat).
 * Best-effort by design: never throws, so claiming a conversation can't fail because ai_engine is down.
 * @returns {Promise<{ok:boolean, cleared?:number, error?:string}>}
 */
async function clearSession({ tenantId, phone, conversationId = null }) {
  if (!tenantId || !phone) return { ok: false, error: 'tenantId and phone required' };
  try {
    const r = await fetch(`${AI_ENGINE_URL}/v1/sessions/clear`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ tenantId, phone, conversationId }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: data.detail || `ai_engine clear ${r.status}` };
    return { ok: true, cleared: data.cleared || 0 };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  health,
  runTurn,
  clearSession,
  AI_ENGINE_URL,
};
