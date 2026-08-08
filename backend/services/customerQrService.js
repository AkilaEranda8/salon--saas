const jwt = require('jsonwebtoken');

const QR_TYPE = 'customer_checkin_qr';
const QR_PREFIX = 'HEXAONE_CI.';
const DEFAULT_TTL_SEC = 180; // portal live QR — 3 minutes
const PORTAL_MAX_TTL_SEC = 600; // 10 minutes
const STAFF_DEFAULT_TTL_SEC = 90 * 24 * 60 * 60; // printable card — 90 days
const STAFF_MAX_TTL_SEC = 365 * 24 * 60 * 60; // 1 year

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured.');
  return secret;
}

function normalizePhoneDigits(phone = '') {
  return String(phone).replace(/\D/g, '');
}

function buildPhoneVariants(phone = '') {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return [];
  const set = new Set([digits]);
  if (digits.startsWith('0') && digits.length > 1) {
    set.add(digits.slice(1));
    set.add(`94${digits.slice(1)}`);
  }
  if (digits.startsWith('94') && digits.length > 2) {
    set.add(digits.slice(2));
    set.add(`0${digits.slice(2)}`);
  }
  return Array.from(set);
}

/**
 * Issue a check-in QR token.
 * Portal live QR: short TTL. Staff printable/download: longer TTL (maxTtlSec).
 */
function issueCheckInQr({
  phone,
  tenantId,
  customerId = null,
  name = null,
  ttlSec = DEFAULT_TTL_SEC,
  maxTtlSec = PORTAL_MAX_TTL_SEC,
}) {
  const normalized = normalizePhoneDigits(phone);
  if (!normalized) throw Object.assign(new Error('Phone is required.'), { status: 400 });
  const tid = Number(tenantId);
  if (!Number.isInteger(tid) || tid <= 0) {
    throw Object.assign(new Error('tenantId is required.'), { status: 400 });
  }

  const cap = Math.max(60, Number(maxTtlSec) || PORTAL_MAX_TTL_SEC);
  const expiresIn = Math.max(60, Math.min(Number(ttlSec) || DEFAULT_TTL_SEC, cap));
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const token = jwt.sign(
    {
      type: QR_TYPE,
      phone: normalized,
      tenantId: tid,
      customerId: customerId ? Number(customerId) : null,
      name: name || null,
    },
    requireJwtSecret(),
    { expiresIn, algorithm: 'HS256' },
  );

  return {
    code: `${QR_PREFIX}${token}`,
    token,
    expires_at: new Date(expiresAt * 1000).toISOString(),
    expires_in: expiresIn,
  };
}

/**
 * Verify a scanned QR payload (raw JWT or HEXAONE_CI.<jwt>).
 */
function verifyCheckInQr(rawCode) {
  let code = String(rawCode || '').trim();
  if (!code) throw Object.assign(new Error('QR code is required.'), { status: 400 });
  if (code.startsWith(QR_PREFIX)) code = code.slice(QR_PREFIX.length);

  let decoded;
  try {
    decoded = jwt.verify(code, requireJwtSecret(), { algorithms: ['HS256'] });
  } catch (_err) {
    throw Object.assign(new Error('Invalid or expired QR code.'), { status: 401 });
  }

  if (decoded.type !== QR_TYPE || !decoded.phone || !decoded.tenantId) {
    throw Object.assign(new Error('Invalid check-in QR.'), { status: 401 });
  }

  return {
    phone: normalizePhoneDigits(decoded.phone),
    tenantId: Number(decoded.tenantId),
    customerId: decoded.customerId ? Number(decoded.customerId) : null,
    name: decoded.name || null,
    exp: decoded.exp || null,
  };
}

module.exports = {
  QR_TYPE,
  QR_PREFIX,
  DEFAULT_TTL_SEC,
  PORTAL_MAX_TTL_SEC,
  STAFF_DEFAULT_TTL_SEC,
  STAFF_MAX_TTL_SEC,
  issueCheckInQr,
  verifyCheckInQr,
  buildPhoneVariants,
  normalizePhoneDigits,
};
