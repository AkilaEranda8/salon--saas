/**
 * Import inv_products for Salon Larvendo from JSON.
 *
 * Usage (inside backend container / with DB env):
 *   node scripts/importLarvendoStockProducts.js [--tenant-slug=salon-larvendo] [--dry-run]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { sequelize } = require('../config/database');
const { Tenant, Branch, InvProduct, InvStockMovement } = require('../models');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const slugArg = args.find((a) => a.startsWith('--tenant-slug='));
const tenantSlug = slugArg ? slugArg.split('=')[1] : 'salon-larvendo';
const dataPath = path.join(__dirname, 'data', 'larvendo_stock_products.json');

async function main() {
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Missing data file: ${dataPath}`);
  }
  const products = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  if (!Array.isArray(products) || !products.length) {
    throw new Error('No products in JSON');
  }

  const tenant = await Tenant.findOne({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`Tenant not found: ${tenantSlug}`);

  const branches = await Branch.findAll({
    where: { tenant_id: tenant.id },
    order: [['id', 'ASC']],
  });
  if (!branches.length) throw new Error(`No branches for tenant ${tenantSlug}`);
  const branch = branches[0];

  const existing = await InvProduct.count({
    where: { tenant_id: tenant.id, branch_id: branch.id },
  });

  console.log(JSON.stringify({
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    branch: { id: branch.id, name: branch.name },
    toImport: products.length,
    existingProducts: existing,
    dryRun,
  }, null, 2));

  if (dryRun) {
    console.log('Dry run — no writes.');
    await sequelize.close();
    return;
  }

  let created = 0;
  let skipped = 0;
  const t = await sequelize.transaction();
  try {
    for (const p of products) {
      const name = String(p.name || '').trim();
      if (!name) { skipped += 1; continue; }

      const found = await InvProduct.findOne({
        where: {
          tenant_id: tenant.id,
          branch_id: branch.id,
          name,
        },
        transaction: t,
      });
      if (found) {
        skipped += 1;
        continue;
      }

      const opening = Number(p.opening_stock) || 0;
      const product = await InvProduct.create({
        tenant_id: tenant.id,
        branch_id: branch.id,
        name,
        brand: p.brand || null,
        sku: p.sku || null,
        product_type: p.product_type || 'consumable',
        unit: p.unit || 'ml',
        cost_price: 0,
        sell_price: 0,
        opening_stock: opening,
        current_stock: opening,
        min_stock: Number(p.min_stock) || 0,
        max_stock: 0,
        status: p.status || 'active',
        notes: p.notes || null,
      }, { transaction: t });

      if (opening !== 0) {
        await InvStockMovement.create({
          tenant_id: tenant.id,
          branch_id: branch.id,
          product_id: product.id,
          movement_type: 'opening',
          opening_qty: 0,
          quantity_changed: opening,
          closing_qty: opening,
          reference_type: 'product',
          reference_id: product.id,
          user_id: null,
          remarks: 'Opening stock (Larvendo Stock Aug 2026 import)',
          moved_at: new Date(),
        }, { transaction: t });
      }
      created += 1;
    }
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

  const after = await InvProduct.count({
    where: { tenant_id: tenant.id, branch_id: branch.id },
  });
  console.log(JSON.stringify({ created, skipped, productsAfter: after }, null, 2));
  await sequelize.close();
}

main().catch(async (err) => {
  console.error(err);
  try { await sequelize.close(); } catch { /* ignore */ }
  process.exit(1);
});
