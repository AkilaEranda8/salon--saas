/**
 * migrateUsersToKeycloak.js
 *
 * Reads all users from the MySQL DB and creates them in Keycloak (salon-saas realm).
 * Since bcrypt hashes cannot be migrated, each user is created with a temporary
 * password and the UPDATE_PASSWORD required action — they will be prompted to set
 * a new password on first login.
 *
 * Usage (from repo root or on the server):
 *   node scripts/migrateUsersToKeycloak.js
 *
 * Required env vars (already in .env):
 *   KEYCLOAK_URL        e.g. https://auth.hexalyte.com
 *   KC_ADMIN_USER       Keycloak admin username
 *   KC_ADMIN_PASSWORD   Keycloak admin password
 *   DB_HOST / DB_USER / DB_PASS / DB_NAME
 */

require('dotenv').config();
const axios = require('axios');

const { User, Tenant, Branch } = require('../models');
const kc = require('../utils/keycloakAdmin');

const KC_URL   = process.env.KEYCLOAK_URL;
const KC_REALM = 'salon-saas';
const KC_ADMIN = process.env.KC_ADMIN_USER;
const KC_PASS  = process.env.KC_ADMIN_PASSWORD;

// ─── Temp password issued to every migrated user ──────────────────────────────
// Users MUST change this on first Keycloak login (UPDATE_PASSWORD required action).
const TEMP_PASSWORD = 'SalonReset2025!';

if (!KC_URL || !KC_ADMIN || !KC_PASS) {
  console.error('Missing KEYCLOAK_URL, KC_ADMIN_USER, or KC_ADMIN_PASSWORD in .env');
  process.exit(1);
}

// ─── Get Keycloak admin access token ─────────────────────────────────────────
async function getAdminToken() {
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
  return res.data.access_token;
}

// ─── Create a single user in Keycloak ────────────────────────────────────────
async function createKeycloakUser(token, user, tenant) {
  const baseUrl = `${KC_URL}/admin/realms/${KC_REALM}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const tenantSlug = tenant?.slug ?? '';
  // Namespace username to avoid collisions across tenants (both can have "admin")
  const kcUsername = tenantSlug
    ? `${tenantSlug}__${user.username}`
    : user.username;

  const nameParts  = (user.name || '').trim().split(' ');
  const firstName  = nameParts[0] || user.username;
  const lastName   = nameParts.slice(1).join(' ') || '';

  const payload = {
    username:   kcUsername,
    email:      user.email || null,
    firstName,
    lastName,
    enabled:    !!user.is_active,
    attributes: {
      salonRole:  [user.role],
      dbUserId:   [String(user.id)],
      tenantId:   [String(user.tenant_id ?? '')],
      tenantSlug: [tenantSlug],
      branchId:   [String(user.branch_id ?? '')],
    },
    credentials: [{
      type:      'password',
      value:     TEMP_PASSWORD,
      temporary: true,         // forces password change on first login
    }],
    requiredActions: user.must_change_password
      ? ['UPDATE_PASSWORD', 'UPDATE_PROFILE']
      : ['UPDATE_PASSWORD'],
  };

  // Create user
  let kcUserId;
  try {
    const createRes = await axios.post(`${baseUrl}/users`, payload, { headers });
    // Keycloak returns the new user URL in Location header
    kcUserId = createRes.headers.location?.split('/').pop();
  } catch (err) {
    const status = err.response?.status;
    if (status === 409) {
      // Already exists — fetch existing user id
      const search = await axios.get(
        `${baseUrl}/users?username=${encodeURIComponent(kcUsername)}&exact=true`,
        { headers }
      );
      kcUserId = search.data[0]?.id;
      if (!kcUserId) {
        console.warn(`  ⚠ Conflict but could not find existing user: ${kcUsername}`);
        return;
      }
      console.log(`  ~ Already exists, updating attributes: ${kcUsername}`);
      await axios.put(`${baseUrl}/users/${kcUserId}`, { attributes: payload.attributes }, { headers });
    } else {
      throw err;
    }
  }

  if (!kcUserId) return;

  // Assign realm role
  const rolesRes = await axios.get(
    `${baseUrl}/roles/${encodeURIComponent(user.role)}`,
    { headers }
  );
  const roleRep = rolesRes.data;

  await axios.post(
    `${baseUrl}/users/${kcUserId}/role-mappings/realm`,
    [roleRep],
    { headers }
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Connecting to DB...');
  const { sequelize } = require('../config/database');
  await sequelize.authenticate();
  console.log('DB connected.\n');

  console.log('Fetching admin token from Keycloak...');
  const token = await getAdminToken();
  console.log('Token acquired.\n');

  const users = await User.findAll({
    include: [
      { model: Tenant, as: 'tenant', attributes: ['id', 'slug', 'name'] },
      { model: Branch, as: 'branch', attributes: ['id', 'name'] },
    ],
  });

  // ── Phase 1: create one Keycloak group per tenant ──────────────────────────
  const tenants = await Tenant.findAll({ attributes: ['id', 'slug', 'name'] });
  console.log(`Phase 1 — creating ${tenants.length} tenant groups...\n`);

  for (const tenant of tenants) {
    try {
      await kc.createOrGetGroup(tenant.slug, tenant.name);
      console.log(`  ✓ group: ${tenant.slug}`);
    } catch (err) {
      const msg = err.response?.data?.errorMessage || err.message;
      console.error(`  ✗ group: ${tenant.slug} — ${msg}`);
    }
  }

  // ── Phase 2: create users and add them to their groups ─────────────────────
  console.log(`\nPhase 2 — migrating ${users.length} users...\n`);

  let success = 0;
  let failed  = 0;

  for (const user of users) {
    const label = `[${user.role}] ${user.tenant?.slug ?? 'platform'}/${user.username}`;
    try {
      await kc.createUser({
        dbUserId:   user.id,
        username:   user.username,
        name:       user.name,
        email:      user.email,
        role:       user.role,
        tenantId:   user.tenant_id,
        tenantSlug: user.tenant?.slug ?? '',
        branchId:   user.branch_id,
        password:   TEMP_PASSWORD,
        temporary:  true,
      });
      console.log(`  ✓ ${label}`);
      success++;
    } catch (err) {
      const msg = err.response?.data?.errorMessage || err.response?.data?.error || err.message;
      console.error(`  ✗ ${label} — ${msg}`);
      failed++;
    }
  }

  console.log(`\n=== Migration complete: ${success} succeeded, ${failed} failed ===`);

  if (failed > 0) {
    console.log('\nRe-run the script to retry failed users — it will skip already-existing ones.');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
