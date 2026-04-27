/**
 * HelaPay / HelaPOS QR Payment Service
 * Base URL: https://helapos.lk/merchant-api
 * Docs: HelaPOS Merchant QR API v1.2.0
 */

const axios          = require('axios');
const { decrypt }    = require('../utils/crypto');

const HELA_BASE    = 'https://helapos.lk/merchant-api';
const HELA_TIMEOUT = 10_000; // 10 s — prevent event-loop hang on slow API

// In-memory token cache: tenantId → { accessToken, refreshToken, expiresAt }
const tokenCache = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAuthCode(appId, appSecret) {
  return Buffer.from(`${appId}:${appSecret}`).toString('base64');
}

function isCacheValid(entry) {
  if (!entry) return false;
  return Date.now() < entry.expiresAt - 60_000; // 1 min buffer
}

// ── Token Management ──────────────────────────────────────────────────────────

async function getAccessToken(tenant) {
  const { id: tenantId, helapay_app_id } = tenant;
  const helapay_app_secret = decrypt(tenant.helapay_app_secret); // decrypt at-rest value

  if (!helapay_app_id || !helapay_app_secret) {
    throw new Error('HelaPay App ID and App Secret are not configured for this tenant.');
  }

  // Check cache
  const cached = tokenCache.get(tenantId);
  if (isCacheValid(cached)) return cached.accessToken;

  // Try refresh if we have a refresh token
  if (cached?.refreshToken) {
    try {
      const refreshed = await refreshAccessToken(cached.refreshToken);
      const entry = {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: Date.now() + 20 * 60 * 1000,
      };
      tokenCache.set(tenantId, entry);
      return entry.accessToken;
    } catch (_) {
      tokenCache.delete(tenantId);
    }
  }

  // Fresh token
  const authCode = buildAuthCode(helapay_app_id, helapay_app_secret);
  const { data } = await axios.post(
    `${HELA_BASE}/merchant/api/v1/getToken`,
    { grant_type: 'client_credentials' },
    {
      timeout: HELA_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authCode}`,
      },
    }
  );

  if (!data.accessToken) throw new Error('HelaPay token response missing accessToken.');

  const entry = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken || null,
    expiresAt: Date.now() + 20 * 60 * 1000,
  };
  tokenCache.set(tenantId, entry);
  return entry.accessToken;
}

async function refreshAccessToken(refreshToken) {
  const { data } = await axios.post(
    `${HELA_BASE}/merchant/api/v1/merchant/auth/refresh`,
    { refreshToken },
    { timeout: HELA_TIMEOUT, headers: { 'Content-Type': 'application/json' } }
  );
  const row = Array.isArray(data.data) ? data.data[0] : data.data;
  if (!row?.accessToken) throw new Error('Refresh failed.');
  return row;
}

// ── QR Generation ─────────────────────────────────────────────────────────────

/**
 * Generate a dynamic LankaQR code.
 * @param {object} tenant     - Tenant record with helapay_* fields
 * @param {string} reference  - Your internal payment/order reference
 * @param {number} amount     - Amount in LKR
 * @returns {{ qr_data, qr_reference, reference }}
 */
async function generateQR(tenant, reference, amount) {
  if (!tenant.helapay_business_id) {
    throw new Error('HelaPay Business ID is not configured for this tenant.');
  }
  const accessToken = await getAccessToken(tenant);

  const { data } = await axios.post(
    `${HELA_BASE}/merchant/api/helapos/qr/generate`,
    {
      b: String(tenant.helapay_business_id),
      r: String(reference),
      am: parseFloat(amount),
    },
    {
      timeout: HELA_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (data.statusCode !== '200' && data.statusCode !== 200) {
    throw new Error(data.statusMessage || 'QR generation failed.');
  }

  return {
    qr_data: data.qr_data,
    qr_reference: data.qr_reference,
    reference: data.reference,
  };
}

// ── Payment Status ────────────────────────────────────────────────────────────

/**
 * Check payment status for a given reference.
 * payment_status: 2=Success, 0=Pending, -1=Failed
 */
async function checkPaymentStatus(tenant, { reference, qr_reference }) {
  const accessToken = await getAccessToken(tenant);

  const body = {};
  if (reference)    body.reference = String(reference);
  if (qr_reference) body.qr_reference = String(qr_reference);

  const { data } = await axios.post(
    `${HELA_BASE}/merchant/api/helapos/sales/getSaleStatus`,
    body,
    {
      timeout: HELA_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return data;
}

// ── Transaction History ───────────────────────────────────────────────────────

async function getTransactionHistory(tenant, { start, end }) {
  if (!tenant.helapay_business_id) {
    throw new Error('HelaPay Business ID is not configured.');
  }
  const accessToken = await getAccessToken(tenant);

  const { data } = await axios.post(
    `${HELA_BASE}/merchant/api/helapos/sales`,
    {
      businessId: String(tenant.helapay_business_id),
      start,
      end,
    },
    {
      timeout: HELA_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return data;
}

// ── Session Revoke ────────────────────────────────────────────────────────────

async function revokeSession(tenantId) {
  const cached = tokenCache.get(tenantId);
  if (!cached) return;
  try {
    await axios.post(
      `${HELA_BASE}/merchant/api/v1/merchant/auth/logout`,
      { refreshToken: cached.refreshToken },
      { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cached.accessToken}` } }
    );
  } finally {
    tokenCache.delete(tenantId);
  }
}

module.exports = {
  generateQR,
  checkPaymentStatus,
  getTransactionHistory,
  revokeSession,
};
