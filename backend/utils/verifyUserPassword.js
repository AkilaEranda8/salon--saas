/**
 * Re-check the signed-in user's password (Keycloak when configured, else bcrypt).
 * Used for destructive admin actions (e.g. delete payment).
 */
const axios = require('axios');
const bcrypt = require('bcryptjs');
const { User } = require('../models');

const KC_REALM_URL = () =>
  `${process.env.KEYCLOAK_URL}/realms/salon-saas/protocol/openid-connect`;

const KC_PUBLIC_CLIENT_ID = process.env.KC_PUBLIC_CLIENT_ID || 'salon-frontend';
const KC_PUBLIC_CLIENT_SECRET = process.env.KC_PUBLIC_CLIENT_SECRET || '';

function addKcClientAuth(params) {
  params.set('client_id', KC_PUBLIC_CLIENT_ID);
  if (KC_PUBLIC_CLIENT_SECRET) {
    params.set('client_secret', KC_PUBLIC_CLIENT_SECRET);
  }
  return params;
}

async function verifyViaKeycloak(user, password, tenantSlug) {
  const raw = String(user.username || '').trim();
  const candidates = [];
  const add = (v) => {
    const s = v && String(v).trim();
    if (s && !candidates.includes(s)) candidates.push(s);
  };
  if (tenantSlug && raw && !raw.startsWith(`${tenantSlug}__`)) {
    add(`${tenantSlug}__${raw}`);
  }
  add(raw);
  if (user.email) add(user.email);

  let lastAuthError = null;
  for (const kcUsername of candidates) {
    try {
      const params = addKcClientAuth(new URLSearchParams({
        grant_type: 'password',
        username: kcUsername,
        password,
      }));
      await axios.post(`${KC_REALM_URL()}/token`, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      });
      return true;
    } catch (err) {
      lastAuthError = err;
      const status = err.response?.status;
      const errorCode = err.response?.data?.error;
      if (status === 401 || (status === 400 && errorCode === 'invalid_grant')) {
        continue;
      }
      console.error('[verifyUserPassword] KC error:', err.response?.data || err.message);
      const e = new Error('Authentication service unavailable.');
      e.status = 502;
      throw e;
    }
  }
  if (lastAuthError) return false;
  return false;
}

/**
 * @param {object} req — Express request (needs req.user.id, optional req.tenant.slug)
 * @param {string} password
 * @returns {Promise<{ ok: true } | { ok: false, status: number, message: string }>}
 */
async function verifyUserPassword(req, password) {
  const pwd = password != null ? String(password) : '';
  if (!pwd) {
    return { ok: false, status: 400, message: 'Password is required.' };
  }
  if (!req.user?.id) {
    return { ok: false, status: 401, message: 'Not authenticated.' };
  }

  const user = await User.findByPk(req.user.id, {
    attributes: ['id', 'username', 'email', 'password', 'is_active'],
  });
  if (!user || user.is_active === false) {
    return { ok: false, status: 401, message: 'User not found.' };
  }

  if (process.env.KEYCLOAK_URL) {
    try {
      const ok = await verifyViaKeycloak(user, pwd, req.tenant?.slug ?? null);
      if (!ok) {
        return { ok: false, status: 401, message: 'Incorrect password.' };
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        status: err.status || 502,
        message: err.message || 'Authentication service unavailable.',
      };
    }
  }

  if (!user.password) {
    return { ok: false, status: 401, message: 'Incorrect password.' };
  }
  const match = await bcrypt.compare(pwd, user.password);
  if (!match) {
    return { ok: false, status: 401, message: 'Incorrect password.' };
  }
  return { ok: true };
}

module.exports = { verifyUserPassword };
