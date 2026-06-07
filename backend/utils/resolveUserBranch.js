const { Staff } = require('../models');

/**
 * Primary branch from the Staff row linked to a portal user (set when staff is added via API).
 */
async function primaryBranchIdFromStaffUser(user, tenantId) {
  if (!user?.id) return null;

  const where = { user_id: user.id };
  if (tenantId != null) where.tenant_id = tenantId;

  const staff = await Staff.findOne({
    where,
    attributes: ['branch_id'],
  });

  const bid = staff?.branch_id;
  if (bid == null || bid === '') return null;
  const n = Number(bid);
  return Number.isFinite(n) ? n : null;
}

module.exports = { primaryBranchIdFromStaffUser };
