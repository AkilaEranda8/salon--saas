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
  // SECURITY: For an authenticated tenant user, the tenant is ALWAYS taken from
  // their verified token — never from the client-supplied X-Tenant-Slug /
  // X-Tenant-Host header. Otherwise a logged-in user of tenant A could read or
  // write tenant B's data simply by changing the request header (cross-tenant IDOR).
  if (req.user && req.user.role !== 'platform_admin') {
    return req.userTenantId ?? req.user.tenantId ?? null;
  }

  // platform_admin: the header selects which tenant to act on (impersonation /
  // support browsing). No header ⇒ null ⇒ access across all tenants.
  if (req.user?.role === 'platform_admin') {
    return req.tenant?.id ?? null;
  }

  // Unauthenticated, tenant-scoped flows (login / public endpoints) resolve the
  // tenant from the subdomain/host header.
  return req.tenant?.id ?? null;
}

function byIdWhere(req, id) {
  return { id, ...tenantWhere(req) };
}

module.exports = { tenantWhere, resolveTenantId, byIdWhere };
