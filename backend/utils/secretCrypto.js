/**
 * Encrypt / decrypt tenant secrets (AI API keys, Meta tokens) at rest.
 * AES-256-GCM. Key from AI_SECRETS_KEY only — no JWT/hardcoded fallbacks.
 */
'use strict';

const crypto = require('crypto');

const PREFIX = 'enc:v1:';

function getKeyMaterial() {
  const raw = process.env.AI_SECRETS_KEY;
  if (!raw || String(raw).trim().length < 16) {
    const err = new Error(
      'AI_SECRETS_KEY is required (min 16 chars). Do not reuse JWT_SECRET.'
    );
    err.code = 'AI_SECRETS_KEY_MISSING';
    throw err;
  }
  return crypto.createHash('sha256').update(String(raw)).digest();
}

let cachedKey = null;
let cachedRaw = null;

function getKey() {
  const raw = process.env.AI_SECRETS_KEY;
  if (!cachedKey || cachedRaw !== raw) {
    cachedKey = getKeyMaterial();
    cachedRaw = raw;
  }
  return cachedKey;
}

/** Clear cached key material (tests / rotation without full restart). */
function clearKeyCache() {
  cachedKey = null;
  cachedRaw = null;
}

function encryptSecret(plain) {
  if (plain == null || plain === '') return null;
  const text = String(plain);
  if (text.startsWith(PREFIX)) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptSecret(stored) {
  if (stored == null || stored === '') return null;
  const s = String(stored);
  if (!s.startsWith(PREFIX)) return s;
  const buf = Buffer.from(s.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function maskSecret(val) {
  if (!val) return '';
  const s = String(val);
  if (s.length <= 4) return '****';
  return '••••••••' + s.slice(-4);
}

function isMaskedPlaceholder(val) {
  if (val == null || val === '') return true;
  const s = String(val).trim();
  return s.startsWith('••••') || s === '****' || /^•+\w{0,4}$/.test(s);
}

module.exports = {
  encryptSecret,
  decryptSecret,
  maskSecret,
  isMaskedPlaceholder,
  clearKeyCache,
};
