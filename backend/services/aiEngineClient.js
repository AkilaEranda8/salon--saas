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

module.exports = {
  health,
  runTurn,
  AI_ENGINE_URL,
};
