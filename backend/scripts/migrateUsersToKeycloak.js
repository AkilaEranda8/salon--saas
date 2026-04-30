/**
 * migrateUsersToKeycloak.js
 *
 * Reads all users from the MySQL DB and creates them in Keycloak (salon-saas realm).
 * Since bcrypt hashes cannot be migrated, each user gets a temporary password —
 * they must change it on first Keycloak login.
 *
 * Auth: uses client_credentials service account (salon-backend client).
 * No admin username/password required.
 *
 * Usage (run inside the backend container or locally with .env loaded):
 *   node scripts/migrateUsersToKeycloak.js
 *
 * Required env vars:
 *   KEYCLOAK_URL       e.g. https://auth.hexalyte.com
 *   KC_CLIENT_ID       default: salon-backend
 *   KC_CLIENT_SECRET   from Keycloak → Clients → salon-backend → Credentials
 *   DB_HOST / DB_USER / DB_PASS / DB_NAME
 */

require('dotenv').config();

const { User, Tenant, Branch } = require('../models');
const kc = require('../utils/keycloakAdmin');

const TEMP_PASSWORD = 'SalonReset2025!';

if (!process.env.KEYCLOAK_URL || !process.env.KC_CLIENT_SECRET) {
  console.error('ERROR: Missing KEYCLOAK_URL or KC_CLIENT_SECRET in .env');
  process.exit(1);
}

async function main() {
  console.log('Connecting to DB...');
  const { sequelize } = require('../config/database');
  await sequelize.authenticate();
  console.log('DB connected.\n');

  const [tenants, users] = await Promise.all([
    Tenant.findAll({ attributes: ['id', 'slug', 'name'] }),
    User.findAll({
      include: [
        { model: Tenant, as: 'tenant', attributes: ['id', 'slug', 'name'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
      ],
    }),
  ]);

  // ── Phase 1: create one Keycloak group per tenant (MUST precede users) ──────
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

  // ── Phase 2: create users and add them to their tenant group ────────────────
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
    console.log('Re-run the script to retry failed users — already-existing ones are skipped.');
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
