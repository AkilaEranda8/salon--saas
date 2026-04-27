/**
 * AES-256-GCM encrypt/decrypt for sensitive fields (e.g. helapay_app_secret).
 * Requires ENCRYPTION_KEY env var: 64-char hex string (32 bytes).
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Gracefully handles:
 *  - Missing ENCRYPTION_KEY: skips encryption (logs warning once)
 *  - Legacy plaintext values: decrypt() returns them unchanged
 */

const crypto = require('crypto');

const ALGO         = 'aes-256-gcm';
const ENC_PREFIX   = 'enc:';
let   _keyWarned   = false;

function getKey() {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length < 64) {
    if (!_keyWarned) {
      console.warn('[crypto] ENCRYPTION_KEY not set — sensitive fields stored in plaintext. ' +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
      _keyWarned = true;
    }
    return null;
  }
  return Buffer.from(keyHex.slice(0, 64), 'hex');
}

function encrypt(text) {
  if (!text) return text;
  const key = getKey();
  if (!key) return text; // encryption not configured — store as-is
  if (text.startsWith(ENC_PREFIX)) return text; // already encrypted

  const iv       = crypto.randomBytes(16);
  const cipher   = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag      = cipher.getAuthTag();

  return ENC_PREFIX +
    [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decrypt(stored) {
  if (!stored) return stored;
  if (!stored.startsWith(ENC_PREFIX)) return stored; // legacy plaintext — return as-is

  try {
    const key = getKey();
    if (!key) return stored; // can't decrypt without key — return raw (will fail auth anyway)

    const [ivHex, tagHex, encHex] = stored.slice(ENC_PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
  } catch {
    return stored; // tampered or wrong key — caller will get an auth error downstream
  }
}

module.exports = { encrypt, decrypt };
