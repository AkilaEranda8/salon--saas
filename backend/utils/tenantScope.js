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
  const tenantId = resolveTenantId(req);
  if (!tenantId) return {}; // platform_admin sees all
  return { tenant_id: tenantId };
}

function resolveTenantId(req) {
  // Subdomain / custom-domain (X-Tenant-Slug / X-Tenant-Host) is authoritative for tenant APIs.
  if (req.tenant?.id) return req.tenant.id;
  if (req.user?.role === 'platform_admin') return null;
  return req.userTenantId ?? req.user?.tenantId ?? null;
}

function byIdWhere(req, id) {
  return { id, ...tenantWhere(req) };
}

module.exports = { tenantWhere, resolveTenantId, byIdWhere };
