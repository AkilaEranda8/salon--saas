'use strict';

const { Op } = require('sequelize');
const { Customer, Tenant } = require('../models');

const WALK_IN_CUSTOMER_NAME = 'Walk-in Customer';

/**
 * Ensure a shared Walk-in Customer exists for the tenant (branch_id null = all branches).
 */
async function ensureWalkInCustomerForTenant(tenantId) {
  if (!tenantId) return null;

  const existing = await Customer.findOne({
    where: {
      tenant_id: tenantId,
      name: WALK_IN_CUSTOMER_NAME,
      branch_id: null,
    },
  });
  if (existing) return existing;

  // Legacy: same name under a branch — promote/reuse first match
  const legacy = await Customer.findOne({
    where: {
      tenant_id: tenantId,
      name: WALK_IN_CUSTOMER_NAME,
    },
    order: [['id', 'ASC']],
  });
  if (legacy) {
    if (legacy.branch_id != null) {
      await legacy.update({ branch_id: null });
    }
    return legacy;
  }

  try {
    return await Customer.create({
      name: WALK_IN_CUSTOMER_NAME,
      phone: null,
      email: null,
      branch_id: null,
      tenant_id: tenantId,
      visits: 0,
      total_spent: 0,
      loyalty_points: 0,
    });
  } catch (err) {
    // Race: another request created it
    const again = await Customer.findOne({
      where: { tenant_id: tenantId, name: WALK_IN_CUSTOMER_NAME },
      order: [['id', 'ASC']],
    });
    if (again) return again;
    throw err;
  }
}

/** Seed Walk-in Customer for every tenant (startup). */
async function ensureWalkInCustomersForAllTenants() {
  const tenants = await Tenant.findAll({ attributes: ['id', 'slug'], order: [['id', 'ASC']] });
  let created = 0;
  for (const t of tenants) {
    const before = await Customer.count({
      where: { tenant_id: t.id, name: WALK_IN_CUSTOMER_NAME },
    });
    await ensureWalkInCustomerForTenant(t.id);
    const after = await Customer.count({
      where: { tenant_id: t.id, name: WALK_IN_CUSTOMER_NAME },
    });
    if (after > before) created += 1;
  }
  console.log(`[WalkInCustomer] Ensured for ${tenants.length} tenants (${created} created).`);
}

/** Sort helper: Walk-in Customer first, then A–Z. */
function sortWalkInFirst(rows = []) {
  return [...rows].sort((a, b) => {
    const aW = a?.name === WALK_IN_CUSTOMER_NAME ? 0 : 1;
    const bW = b?.name === WALK_IN_CUSTOMER_NAME ? 0 : 1;
    if (aW !== bW) return aW - bW;
    return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
  });
}

function isWalkInCustomerName(name) {
  return String(name || '').trim().toLowerCase() === WALK_IN_CUSTOMER_NAME.toLowerCase();
}

module.exports = {
  WALK_IN_CUSTOMER_NAME,
  ensureWalkInCustomerForTenant,
  ensureWalkInCustomersForAllTenants,
  sortWalkInFirst,
  isWalkInCustomerName,
};
