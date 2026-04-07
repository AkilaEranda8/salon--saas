/**
 * tenantWhere(req)
 *
 * Returns a Sequelize WHERE fragment that always scopes queries to the
 * current tenant. Controllers merge this into their own WHERE objects.
 *
 * Usage:
 *   const where = tenantWhere(req);
 *   if (req.userBranchId) where.branch_id = req.userBranchId;
 *   const items = await Model.findAll({ where });
 *
 * platform_admin (tenantId = null) receives an empty object, meaning
 * they can see all tenants' data.
 */
function tenantWhere(req) {
  const tenantId = req.userTenantId ?? req.tenant?.id ?? null;
  if (!tenantId) return {}; // platform_admin sees all
  return { tenant_id: tenantId };
}

module.exports = { tenantWhere };
