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
// NOTE: token management is handled internally by keycloakAdmin.js.
// We keep a local copy here only for the user-create calls below.
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
async function createKeycloakUser(_token, user, tenant) {
  // Delegate entirely to keycloakAdmin.createUser which handles
  // username namespacing, attributes, role assignment, AND group membership.
  await kc.createUser({
    dbUserId:   user.id,
    username:   user.username,
    name:       user.name,
    email:      user.email,
    role:       user.role,
    tenantId:   user.tenant_id,
    tenantSlug: tenant?.slug ?? '',
    branchId:   user.branch_id,
    password:   TEMP_PASSWORD,
    temporary:  true,
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Connecting to DB...');
  const { sequelize } = require('../config/database');
  await sequelize.authenticate();
  console.log('DB connected.\n');

  console.log('Fetching admin token from Keycloak...');
  await getAdminToken(); // warm up the keycloakAdmin token cache
  console.log('Token acquired.\n');

  const users = await User.findAll({
    include: [
      { model: Tenant, as: 'tenant', attributes: ['id', 'slug', 'name'] },
      { model: Branch, as: 'branch', attributes: ['id', 'name'] },
    ],
    order: [['tenant_id', 'ASC']],
  });

  // ── Pre-create one group per tenant slug ──────────────────────────────────
  const slugs = [...new Set(
    users.map((u) => u.tenant?.slug).filter(Boolean)
  )];
  console.log(`Creating ${slugs.length} tenant groups...`);
  for (const slug of slugs) {
    try {
      await kc.ensureTenantGroup(slug);
      console.log(`  ✓ group: ${slug}`);
    } catch (err) {
      console.error(`  ✗ group: ${slug} — ${err.message}`);
    }
  }
  console.log();

  console.log(`Migrating ${users.length} users...\n`);

  let success = 0;
  let failed  = 0;

  for (const user of users) {
    const label = `[${user.role}] ${user.tenant?.slug ?? 'platform'}/${user.username}`;
    try {
      await createKeycloakUser(null, user, user.tenant);
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
