const { Op } = require('sequelize');
const { User, Staff, StaffSpecialization } = require('../models');
const { tenantWhere } = require('./tenantScope');
const { hasFranchiseCommission } = require('./tenantFeatures');
const { staffBelongsToBranch, staffWhereForBranch } = require('./staffBranchFilter');

const MANAGER_ROLE_TITLES = ['Salon Manager', 'Branch Manager'];

/**
 * Branch manager staff for oversight commission.
 * Priority: Branch Manager role → Salon Manager role → manager-login linked staff.
 */
async function resolveBranchManagerStaff(req, branchId, { transaction } = {}) {
  const scope = tenantWhere(req);
  const bid = Number(branchId);
  if (!bid) return null;

  const branchClause = await staffWhereForBranch(bid);
  const include = [{ model: StaffSpecialization, as: 'specializations' }];

  // 1) Explicit Branch Manager / Salon Manager on this branch (primary or staff_branches link)
  for (const roleTitle of ['Branch Manager', 'Salon Manager']) {
    const row = await Staff.findOne({
      where: {
        ...scope,
        ...branchClause,
        is_active: true,
        role_title: roleTitle,
      },
      include,
      transaction,
    });
    if (row) return row;
  }

  // 2) Legacy: manager login user linked to a staff profile
  const managerUsers = await User.findAll({
    where: { role: 'manager', branch_id: bid, is_active: true, ...scope },
    attributes: ['id'],
    transaction,
    limit: 5,
  });

  for (const mu of managerUsers) {
    const linked = await Staff.findOne({
      where: { user_id: mu.id, is_active: true, ...scope },
      include,
      transaction,
    });
    if (linked) return linked;
  }

  return null;
}

/**
 * Manager override % — branch setting > tenant default > manager staff profile.
 * Always percentage of total service amount (not worker commission).
 */
function resolveManagerOverridePercent(branch, tenant, managerStaff) {
  const branchPct = branch?.manager_commission_percent;
  if (branchPct != null && branchPct !== '' && parseFloat(branchPct) > 0) {
    return parseFloat(branchPct);
  }
  const tenantPct = tenant?.default_manager_commission_percent;
  if (tenantPct != null && tenantPct !== '' && parseFloat(tenantPct) > 0) {
    return parseFloat(tenantPct);
  }
  if (managerStaff && parseFloat(managerStaff.commission_value) > 0) {
    return parseFloat(managerStaff.commission_value);
  }
  return 0;
}

function managerEligibleForOversight(managerStaff, overridePercent) {
  if (!managerStaff) return false;
  if (managerStaff.salary_type === 'salary_only') return false;
  const pct = overridePercent != null
    ? parseFloat(overridePercent)
    : parseFloat(managerStaff.commission_value);
  return pct > 0;
}

function franchiseCommissionEnabled(tenant) {
  return hasFranchiseCommission(tenant);
}

/** Manager override only when Franchise Commission feature is enabled for the tenant. */
function shouldApplyManagerOverride(tenant) {
  return hasFranchiseCommission(tenant);
}

module.exports = {
  resolveBranchManagerStaff,
  resolveManagerOverridePercent,
  managerEligibleForOversight,
  franchiseCommissionEnabled,
  shouldApplyManagerOverride,
  staffBelongsToBranch,
  MANAGER_ROLE_TITLES,
};
