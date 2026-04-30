/**
 * keycloakAdmin.js — Keycloak Admin REST API utility
 *
 * Provides all user-lifecycle operations needed to keep Keycloak in sync
 * with the application's MySQL users table.
 *
 * Only active when KEYCLOAK_URL is set in .env; every exported function is
 * a no-op (resolves to null) in legacy mode so controllers need no guards.
 */

const axios = require('axios');

const KC_URL   = process.env.KEYCLOAK_URL;
const KC_REALM = 'salon-saas';
const KC_ADMIN = process.env.KC_ADMIN_USER;
const KC_PASS  = process.env.KC_ADMIN_PASSWORD;

// ─── Admin token cache ──────────────────────────────────────────────────────
let _cachedToken    = null;
let _tokenExpiresAt = 0;

// ─── Tenant group cache (slug → Keycloak group id) ───────────────────────────
const _groupCache = new Map();

async function getAdminToken() {
  const now = Date.now();
  // Reuse cached token if it has more than 15 s remaining
  if (_cachedToken && now < _tokenExpiresAt - 15_000) {
    return _cachedToken;
  }

  const res = await axios.post(
    `${KC_URL}/realms/master/protocol/openid-connect/token`,
    new URLSearchParams({
      grant_type: 'password',
      client_id:  'admin-cli',
      username:   KC_ADMIN,
      password:   KC_PASS,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  _cachedToken    = res.data.access_token;
  _tokenExpiresAt = now + (res.data.expires_in * 1000);
  return _cachedToken;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
function baseUrl() {
  return `${KC_URL}/admin/realms/${KC_REALM}`;
}

async function headers() {
  const token = await getAdminToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/**
 * Find a Keycloak user by the `dbUserId` attribute we store on every user.
 * Returns the Keycloak user object or null.
 */
async function findByDbId(dbUserId) {
  const h = await headers();
  const res = await axios.get(
    `${baseUrl()}/users?q=dbUserId:${dbUserId}&exact=false&max=5`,
    { headers: h }
  );
  // Filter precisely — Keycloak attribute search is prefix-based
  return res.data.find((u) => u.attributes?.dbUserId?.[0] === String(dbUserId)) ?? null;
}

// ─── Group helpers ───────────────────────────────────────────────────────────

/**
 * Ensure a Keycloak group named after the tenant slug exists.
 * Creates it if absent, then caches and returns the group id.
 *
 * Group structure (flat, one per tenant):
 *   salon-saas realm
 *     └─ regal          ← tenantSlug
 *     └─ luxehair
 *     └─ ...
 *
 * @param {string} tenantSlug
 * @returns {Promise<string|null>} Keycloak group id
 */
async function ensureTenantGroup(tenantSlug) {
  if (!KC_URL || !tenantSlug) return null;

  if (_groupCache.has(tenantSlug)) return _groupCache.get(tenantSlug);

  const h = await headers();

  // Search for existing group
  const searchRes = await axios.get(
    `${baseUrl()}/groups?search=${encodeURIComponent(tenantSlug)}&exact=true&max=5`,
    { headers: h }
  );
  const existing = searchRes.data.find((g) => g.name === tenantSlug);

  if (existing) {
    _groupCache.set(tenantSlug, existing.id);
    return existing.id;
  }

  // Create new group
  const createRes = await axios.post(
    `${baseUrl()}/groups`,
    { name: tenantSlug },
    { headers: h }
  );
  const groupId = createRes.headers.location?.split('/').pop();
  _groupCache.set(tenantSlug, groupId);
  console.log(`[KC] Created tenant group: ${tenantSlug} (${groupId})`);
  return groupId;
}

/**
 * Add a Keycloak user to a group.
 */
async function addUserToGroup(kcUserId, groupId) {
  if (!KC_URL || !kcUserId || !groupId) return;
  const h = await headers();
  await axios.put(
    `${baseUrl()}/users/${kcUserId}/groups/${groupId}`,
    {},
    { headers: h }
  );
}

/**
 * Delete the Keycloak group for a tenant slug (call when tenant is deleted).
 */
async function deleteTenantGroup(tenantSlug) {
  if (!KC_URL || !tenantSlug) return;
  const groupId = await ensureTenantGroup(tenantSlug).catch(() => null);
  if (!groupId) return;
  const h = await headers();
  await axios.delete(`${baseUrl()}/groups/${groupId}`, { headers: h });
  _groupCache.delete(tenantSlug);
  console.log(`[KC] Deleted tenant group: ${tenantSlug}`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a user in Keycloak.
 *
 * @param {object} opts
 * @param {number}  opts.dbUserId     — DB users.id
 * @param {string}  opts.username     — short username (will be prefixed with tenantSlug__)
 * @param {string}  opts.name         — display name
 * @param {string}  [opts.email]
 * @param {string}  opts.role         — salon_role: superadmin | admin | manager | staff | platform_admin
 * @param {number}  [opts.tenantId]
 * @param {string}  [opts.tenantSlug]
 * @param {number}  [opts.branchId]
 * @param {string}  opts.password     — plain-text password (set at creation time)
 * @param {boolean} [opts.temporary]  — force password change on first login (default false)
 */
async function createUser(opts) {
  if (!KC_URL) return null;

  const {
    dbUserId, username, name, email, role,
    tenantId, tenantSlug, branchId,
    password, temporary = false,
  } = opts;

  const nameParts = (name || '').trim().split(' ');
  const kcUsername = tenantSlug ? `${tenantSlug}__${username}` : username;

  const payload = {
    username:   kcUsername,
    email:      email || undefined,
    firstName:  nameParts[0] || username,
    lastName:   nameParts.slice(1).join(' ') || '',
    enabled:    true,
    attributes: {
      salonRole:  [role],
      dbUserId:   [String(dbUserId)],
      tenantId:   [String(tenantId  ?? '')],
      tenantSlug: [tenantSlug ?? ''],
      branchId:   [String(branchId ?? '')],
    },
    credentials: [{
      type:      'password',
      value:     password,
      temporary: !!temporary,
    }],
    requiredActions: temporary ? ['UPDATE_PASSWORD'] : [],
  };

  const h = await headers();
  let kcUserId;

  try {
    const res = await axios.post(`${baseUrl()}/users`, payload, { headers: h });
    kcUserId = res.headers.location?.split('/').pop();
  } catch (err) {
    if (err.response?.status === 409) {
      // Already exists — fetch and update attributes
      const existing = await findByDbId(dbUserId);
      if (existing) {
        kcUserId = existing.id;
        await axios.put(
          `${baseUrl()}/users/${kcUserId}`,
          { attributes: payload.attributes, enabled: true },
          { headers: h }
        );
        console.log(`[KC] User already existed, updated attributes: ${kcUsername}`);
      }
    } else {
      throw err;
    }
  }

  if (!kcUserId) return null;

  // Assign realm role
  await assignRole(kcUserId, role);

  // Add to tenant group (creates group first if needed)
  if (tenantSlug) {
    const groupId = await ensureTenantGroup(tenantSlug);
    await addUserToGroup(kcUserId, groupId);
  }

  return kcUserId;
}

/**
 * Assign a realm role to a Keycloak user.
 * Removes all previous salon roles first to prevent role stacking.
 */
async function assignRole(kcUserId, newRole) {
  if (!KC_URL || !kcUserId) return;

  const SALON_ROLES = ['platform_admin', 'superadmin', 'admin', 'manager', 'staff'];
  const h = await headers();

  // Fetch current realm role mappings
  const currentRes = await axios.get(
    `${baseUrl()}/users/${kcUserId}/role-mappings/realm`,
    { headers: h }
  );
  const toRemove = currentRes.data.filter((r) => SALON_ROLES.includes(r.name));
  if (toRemove.length) {
    await axios.delete(
      `${baseUrl()}/users/${kcUserId}/role-mappings/realm`,
      { headers: h, data: toRemove }
    );
  }

  // Fetch the target role representation
  const roleRes = await axios.get(
    `${baseUrl()}/roles/${encodeURIComponent(newRole)}`,
    { headers: h }
  );
  await axios.post(
    `${baseUrl()}/users/${kcUserId}/role-mappings/realm`,
    [roleRes.data],
    { headers: h }
  );
}

/**
 * Update a Keycloak user's attributes and profile fields.
 * Pass only the fields that changed.
 *
 * @param {number} dbUserId
 * @param {object} updates  — { name?, email?, role?, branchId?, isActive? }
 */
async function updateUser(dbUserId, updates) {
  if (!KC_URL) return;

  const kcUser = await findByDbId(dbUserId);
  if (!kcUser) {
    console.warn(`[KC] updateUser: no Keycloak user found for dbUserId=${dbUserId}`);
    return;
  }

  const h = await headers();
  const patch = { attributes: { ...kcUser.attributes } };

  if (updates.name !== undefined) {
    const parts       = (updates.name || '').trim().split(' ');
    patch.firstName   = parts[0] || kcUser.firstName;
    patch.lastName    = parts.slice(1).join(' ') || '';
  }
  if (updates.email    !== undefined) patch.email                            = updates.email || null;
  if (updates.isActive !== undefined) patch.enabled                          = !!updates.isActive;
  if (updates.role     !== undefined) patch.attributes.salonRole             = [updates.role];
  if (updates.branchId !== undefined) patch.attributes.branchId              = [String(updates.branchId ?? '')];

  await axios.put(`${baseUrl()}/users/${kcUser.id}`, patch, { headers: h });

  // Role change requires the role-mapping endpoint
  if (updates.role !== undefined) {
    await assignRole(kcUser.id, updates.role);
  }
}

/**
 * Update a Keycloak user's password.
 *
 * @param {number}  dbUserId
 * @param {string}  newPassword
 * @param {boolean} [temporary=false]
 */
async function updatePassword(dbUserId, newPassword, temporary = false) {
  if (!KC_URL) return;

  const kcUser = await findByDbId(dbUserId);
  if (!kcUser) return;

  const h = await headers();
  await axios.put(
    `${baseUrl()}/users/${kcUser.id}/reset-password`,
    { type: 'password', value: newPassword, temporary },
    { headers: h }
  );
}

/**
 * Delete a user from Keycloak.
 *
 * @param {number} dbUserId
 */
async function deleteUser(dbUserId) {
  if (!KC_URL) return;

  const kcUser = await findByDbId(dbUserId);
  if (!kcUser) return;

  const h = await headers();
  await axios.delete(`${baseUrl()}/users/${kcUser.id}`, { headers: h });
}

/**
 * Enable or disable a user in Keycloak (mirrors is_active in DB).
 *
 * @param {number}  dbUserId
 * @param {boolean} enabled
 */
async function setEnabled(dbUserId, enabled) {
  if (!KC_URL) return;

  const kcUser = await findByDbId(dbUserId);
  if (!kcUser) return;

  const h = await headers();
  await axios.put(`${baseUrl()}/users/${kcUser.id}`, { enabled }, { headers: h });
}

module.exports = {
  createUser,
  updateUser,
  updatePassword,
  deleteUser,
  setEnabled,
  findByDbId,
  ensureTenantGroup,
  addUserToGroup,
  deleteTenantGroup,
};
