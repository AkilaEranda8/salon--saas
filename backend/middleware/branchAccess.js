/**
 * branchAccess middleware
 *
 * - For manager/staff: sets req.userBranchIds (1–2 ids) and req.userBranchId (primary),
 *   so controllers can auto-filter queries.
 * - Branch id comes from JWT first; if missing, from linked Staff.branch_id (add-staff API).
 * - For superadmin/admin: req.userBranchId / req.userBranchIds are null (sees all branches
 *   within their tenant).
 * - For platform_admin: sees everything across all tenants.
 * - Validates that the authenticated user's tenantId matches req.tenant.id to prevent
 *   cross-tenant token reuse attacks.
 *
 * Must be used AFTER verifyToken.
 */
const { jwtBranchIds } = require('../utils/branchScope');
const { primaryBranchIdFromStaffUser } = require('../utils/resolveUserBranch');

const branchAccess = async (req, res, next) => {
  try {
    if (!req.user) return next();

    const { role, tenantId } = req.user;

    // Cross-tenant token reuse protection
    if (req.tenant && role !== 'platform_admin') {
      if (tenantId !== req.tenant.id) {
        return res.status(403).json({ message: 'Token does not match this tenant.' });
      }
    }

    req.userTenantId = (role === 'platform_admin') ? null : (tenantId ?? null);

    if (role === 'manager' || role === 'staff') {
      let ids = jwtBranchIds(req.user);
      if (!ids.length) {
        const fromStaff = await primaryBranchIdFromStaffUser(req.user, req.userTenantId);
        if (fromStaff != null) ids = [fromStaff];
      }
      req.userBranchIds = ids;
      req.userBranchId  = ids[0] ?? null;
    } else {
      req.userBranchIds = null;
      req.userBranchId  = null;
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { branchAccess };
