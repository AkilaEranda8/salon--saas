'use strict';

/**
 * Resolve the tenant used for GL posting.
 *
 * - Non-platform users: the JWT tenant (req.userTenantId / req.user.tenantId) is
 *   authoritative. req.tenant is reused only when its id matches; otherwise the
 *   tenant is loaded by id (never trust a header-selected tenant over the JWT).
 * - platform_admin: may act on the header-selected tenant (req.tenant).
 */
async function resolveAccountingTenant(req) {
  const { Tenant } = require('../../models');
  const role = String(req.user?.role || '').trim().toLowerCase();
  const jwtTenantId = req.userTenantId ?? req.user?.tenantId ?? null;

  if (role === 'platform_admin') {
    if (req.tenant?.id) return req.tenant;
    return jwtTenantId ? Tenant.findByPk(jwtTenantId) : null;
  }

  const tid = jwtTenantId || req.tenant?.id || null;
  if (!tid) return null;

  if (req.tenant && Number(req.tenant.id) === Number(tid)) {
    return req.tenant;
  }

  return Tenant.findByPk(tid);
}

module.exports = { resolveAccountingTenant };
