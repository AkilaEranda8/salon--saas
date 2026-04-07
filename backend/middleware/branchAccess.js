/**
 * branchAccess middleware
 *
 * - For manager/staff: sets req.userBranchIds (1–2 ids) and req.userBranchId (primary),
 *   so controllers can auto-filter queries.
 * - For superadmin/admin: req.userBranchId / req.userBranchIds are null (sees all branches
 *   within their tenant).
 * - For platform_admin: sees everything across all tenants.
 * - Validates that the authenticated user's tenantId matches req.tenant.id to prevent
 *   cross-tenant token reuse attacks.
 *
 * Must be used AFTER verifyToken.
 */
const { jwtBranchIds } = require('../utils/branchScope');

const branchAccess = (req, res, next) => {
  if (!req.user) return next();

  const { role, tenantId } = req.user;

  // Cross-tenant token reuse protection
  if (req.tenant && role !== 'platform_admin') {
    if (tenantId !== req.tenant.id) {
      return res.status(403).json({ message: 'Token does not match this tenant.' });
    }
  }

  if (role === 'manager' || role === 'staff') {
    req.userBranchIds = jwtBranchIds(req.user);
    req.userBranchId  = req.userBranchIds[0] ?? req.user.branchId ?? null;
  } else {
    req.userBranchIds = null;
    req.userBranchId  = null;
  }

  // Expose tenant ID for controllers
  req.userTenantId = (role === 'platform_admin') ? null : (tenantId ?? null);

  next();
};

module.exports = { branchAccess };
