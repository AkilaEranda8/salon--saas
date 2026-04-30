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

// ─── Admin token cache ────────────────────────────────────────────────────────
let _cachedToken    = null;
let _tokenExpiresAt = 0;

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

/**
 * Find a Keycloak group by name (exact match).
 * Returns the group object or null.
 */
async function findGroupBySlug(tenantSlug) {
  const h = await headers();
  const res = await axios.get(
    `${baseUrl()}/groups?search=${encodeURIComponent(tenantSlug)}&exact=true&max=5`,
    { headers: h }
  );
  return res.data.find((g) => g.name === tenantSlug) ?? null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

// ─── Group management ─────────────────────────────────────────────────────────

/**
 * Create a Keycloak top-level group for a tenant, or return the existing one.
 * MUST be called before creating any users for that tenant.
 *
 * Group name   = tenantSlug  (e.g. "regal")
 * Group attribute tenantSlug is also stored on the group for easy lookup.
 *
 * @param {string} tenantSlug   — unique tenant slug
 * @param {string} [tenantName] — human-readable name (stored as group attribute)
 * @returns {Promise<string>} Keycloak group ID
 */
async function createOrGetGroup(tenantSlug, tenantName = '') {
  if (!KC_URL) return null;

  // Check if group already exists
  const existing = await findGroupBySlug(tenantSlug);
  if (existing) {
    console.log(`[KC] Group already exists: ${tenantSlug} (${existing.id})`);
    return existing.id;
  }

  const h = await headers();
  const res = await axios.post(
    `${baseUrl()}/groups`,
    {
      name:       tenantSlug,
      attributes: {
        tenantSlug: [tenantSlug],
        tenantName: [tenantName || tenantSlug],
      },
    },
    { headers: h }
  );

  // Keycloak returns 201 with Location header containing the new group ID
  const groupId = res.headers.location?.split('/').pop();
  console.log(`[KC] Created group: ${tenantSlug} (${groupId})`);
  return groupId;
}

/**
 * Add a Keycloak user to their tenant's group.
 *
 * @param {string} kcUserId    — Keycloak user UUID
 * @param {string} tenantSlug  — tenant slug (group name)
 */
async function addUserToGroup(kcUserId, tenantSlug) {
  if (!KC_URL || !kcUserId || !tenantSlug) return;

  const group = await findGroupBySlug(tenantSlug);
  if (!group) {
    console.warn(`[KC] addUserToGroup: group not found for slug=${tenantSlug}. Create the group first.`);
    return;
  }

  const h = await headers();
  await axios.put(
    `${baseUrl()}/users/${kcUserId}/groups/${group.id}`,
    {},
    { headers: h }
  );
}

/**
 * Delete a tenant's Keycloak group.
 * Called when a tenant is fully removed from the system.
 *
 * @param {string} tenantSlug
 */
async function deleteGroup(tenantSlug) {
  if (!KC_URL) return;

  const group = await findGroupBySlug(tenantSlug);
  if (!group) return;

  const h = await headers();
  await axios.delete(`${baseUrl()}/groups/${group.id}`, { headers: h });
  console.log(`[KC] Deleted group: ${tenantSlug}`);
}

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

  // Add user to their tenant group (group must already exist)
  if (tenantSlug) {
    await addUserToGroup(kcUserId, tenantSlug);
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
  // Group lifecycle (must run BEFORE user creation)
  createOrGetGroup,
  addUserToGroup,
  deleteGroup,
  // User lifecycle
  createUser,
  updateUser,
  updatePassword,
  deleteUser,
  setEnabled,
  findByDbId,
};
