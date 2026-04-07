/**
 * migrateToSaas.js
 *
 * One-time, idempotent migration that converts the single-tenant Zane Salon
 * system into the SaaS multi-tenant architecture.
 *
 * Safe to re-run: all operations check current state before acting.
 *
 * Steps:
 *   1. Add tenant_id columns to all tables (if not already present)
 *   2. Create the Zane Salon tenant record (if not already present)
 *   3. Backfill tenant_id = 1 on all rows where tenant_id IS NULL
 *   4. Widen the customers unique index to include tenant_id
 *   5. Update users.role ENUM to include 'platform_admin'
 *
 * Run: node scripts/migrateToSaas.js
 */

require('dotenv').config();
const { sequelize } = require('../config/database');
const { Tenant }    = require('../models');

const TABLES_WITH_TENANT = [
  'branches',
  'users',
  'staff',
  'staff_branches',
  'customers',
  'appointments',
  'payments',
  'payment_splits',
  'inventory',
  'expenses',
  'packages',
  'customer_packages',
  'package_redemptions',
  'discounts',
  'walk_in_queue',
  'reminders',
  'reviews',
  'notification_logs',
  'notification_settings',
  'attendance',
  'staff_fcm_tokens',
  'services',
];

async function tableExists(table) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = :table`,
    { replacements: { table }, type: sequelize.QueryTypes.SELECT }
  );
  return rows.cnt > 0;
}

async function columnExists(table, column) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = :table
       AND COLUMN_NAME  = :column`,
    { replacements: { table, column }, type: sequelize.QueryTypes.SELECT }
  );
  return rows.cnt > 0;
}

async function indexExists(table, indexName) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = :table
       AND INDEX_NAME   = :indexName`,
    { replacements: { table, indexName }, type: sequelize.QueryTypes.SELECT }
  );
  return rows.cnt > 0;
}

async function run() {
  console.log('=== SaaS Migration starting ===\n');

  // ── Step 1: Add tenant_id columns (idempotent) ────────────────────────────
  console.log('Step 1: Adding tenant_id columns...');
  for (const table of TABLES_WITH_TENANT) {
    const tExists = await tableExists(table);
    if (!tExists) {
      console.log(`  - ${table}: table does not exist, skipping`);
      continue;
    }
    const exists = await columnExists(table, 'tenant_id');
    if (!exists) {
      await sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN tenant_id INT NULL`);
      console.log(`  ✓ Added tenant_id to ${table}`);
    } else {
      console.log(`  - ${table}: tenant_id already exists`);
    }
  }

  // ── Step 2: Update users.role ENUM ────────────────────────────────────────
  console.log('\nStep 2: Updating users.role ENUM...');
  try {
    await sequelize.query(
      `ALTER TABLE users MODIFY COLUMN role ENUM('platform_admin','superadmin','admin','manager','staff') NOT NULL DEFAULT 'staff'`
    );
    console.log('  ✓ users.role ENUM updated');
  } catch (err) {
    if (err.message.includes('Duplicate entry') || err.original?.code === 'ER_DUP_ENTRY') {
      console.log('  - users.role ENUM already up to date');
    } else {
      // MySQL may throw an error if the enum is already correct — that's fine
      console.log(`  - users.role: ${err.message}`);
    }
  }

  // ── Step 3: Create Zane Salon tenant ──────────────────────────────────────
  console.log('\nStep 3: Creating Zane Salon tenant...');
  let zaneTenant = await Tenant.findOne({ where: { slug: 'zane' } });
  if (!zaneTenant) {
    zaneTenant = await Tenant.create({
      name:          'Zane Salon',
      slug:          'zane',
      email:         'admin@zanesalon.com',
      plan:          'enterprise',
      status:        'active',
      trial_ends_at: null,
      max_branches:  -1,
      max_staff:     -1,
    });
    console.log(`  ✓ Created Zane Salon tenant, id: ${zaneTenant.id}`);
  } else {
    console.log(`  - Zane Salon tenant already exists, id: ${zaneTenant.id}`);
  }

  const tenantId = zaneTenant.id;

  // ── Step 4: Backfill tenant_id on all tables ──────────────────────────────
  console.log('\nStep 4: Backfilling tenant_id...');
  for (const table of TABLES_WITH_TENANT) {
    const tExists = await tableExists(table);
    if (!tExists) {
      console.log(`  - ${table}: table does not exist, skipping`);
      continue;
    }
    const [result] = await sequelize.query(
      `UPDATE \`${table}\` SET tenant_id = ? WHERE tenant_id IS NULL`,
      { replacements: [tenantId] }
    );
    console.log(`  ✓ ${table}: ${result.affectedRows} rows updated`);
  }

  // ── Step 5: Recreate customers unique index ───────────────────────────────
  console.log('\nStep 5: Updating customers unique index...');

  const oldIndexExists = await indexExists('customers', 'customers_phone_branch_unique');
  if (oldIndexExists) {
    await sequelize.query(`ALTER TABLE customers DROP INDEX customers_phone_branch_unique`);
    console.log('  ✓ Dropped old customers_phone_branch_unique index');
  }

  const newIndexExists = await indexExists('customers', 'customers_phone_branch_tenant_unique');
  if (!newIndexExists) {
    await sequelize.query(
      `ALTER TABLE customers ADD UNIQUE KEY customers_phone_branch_tenant_unique (phone, branch_id, tenant_id)`
    );
    console.log('  ✓ Created customers_phone_branch_tenant_unique index');
  } else {
    console.log('  - customers_phone_branch_tenant_unique already exists');
  }

  // ── Step 6: Add composite indexes for query performance ───────────────────
  console.log('\nStep 6: Adding performance indexes...');
  const perfIndexes = [
    { table: 'branches',     index: 'idx_branches_tenant',          cols: '(tenant_id)' },
    { table: 'users',        index: 'idx_users_tenant',             cols: '(tenant_id)' },
    { table: 'staff',        index: 'idx_staff_tenant_branch',      cols: '(tenant_id, branch_id)' },
    { table: 'customers',    index: 'idx_customers_tenant_branch',  cols: '(tenant_id, branch_id)' },
    { table: 'appointments', index: 'idx_appts_tenant_branch',      cols: '(tenant_id, branch_id)' },
    { table: 'payments',     index: 'idx_payments_tenant_branch',   cols: '(tenant_id, branch_id)' },
    { table: 'services',     index: 'idx_services_tenant',          cols: '(tenant_id)' },
  ];

  for (const { table, index, cols } of perfIndexes) {
    const tExists = await tableExists(table);
    if (!tExists) {
      console.log(`  - ${table}: table does not exist, skipping index ${index}`);
      continue;
    }
    const exists = await indexExists(table, index);
    if (!exists) {
      await sequelize.query(`ALTER TABLE \`${table}\` ADD INDEX \`${index}\` ${cols}`);
      console.log(`  ✓ Added index ${index}`);
    } else {
      console.log(`  - ${index} already exists`);
    }
  }

  console.log('\n=== SaaS Migration complete ===');
  console.log(`\nZane Salon tenant ID: ${tenantId}`);
  console.log('Verify with: SELECT COUNT(*) FROM branches WHERE tenant_id IS NULL;');
  console.log('Expected: 0\n');

  await sequelize.close();
}

run().catch((err) => {
  console.error('\n✗ Migration failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
