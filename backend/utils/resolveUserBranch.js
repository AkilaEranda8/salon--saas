const { Staff, User } = require('../models');
const { tenantWhere } = require('./tenantScope');

/**
 * Resolve portal users.id from JWT (db_user_id) or username (Keycloak preferred_username).
 */
async function resolveDbUserId(req) {
  if (req.user?.id) return req.user.id;

  const raw = `${req.user?.username ?? ''}`.trim();
  if (!raw) return null;

  const scope = tenantWhere(req);
  const baseWhere = { is_active: true, ...scope };

  let user = await User.findOne({
    where: { username: raw, ...baseWhere },
    attributes: ['id'],
  });
  if (!user && raw.includes('__')) {
    const short = raw.split('__').pop();
    if (short) {
      user = await User.findOne({
        where: { username: short, ...baseWhere },
        attributes: ['id'],
      });
    }
  }
  return user?.id ?? null;
}

/**
 * Staff.id for the logged-in portal user (staff.user_id link).
 */
async function linkedStaffIdForRequest(req) {
  const userId = await resolveDbUserId(req);
  if (!userId) return null;

  const staff = await Staff.findOne({
    where: { user_id: userId, ...tenantWhere(req) },
    attributes: ['id'],
  });
  return staff?.id ?? null;
}

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

/** Branch id for manager/staff when JWT has no branch_id claim. */
async function primaryBranchIdForRequest(req) {
  const userId = await resolveDbUserId(req);
  if (!userId) return null;
  return primaryBranchIdFromStaffUser({ id: userId }, req.userTenantId ?? req.user?.tenantId);
}

module.exports = {
  resolveDbUserId,
  linkedStaffIdForRequest,
  primaryBranchIdFromStaffUser,
  primaryBranchIdForRequest,
};
