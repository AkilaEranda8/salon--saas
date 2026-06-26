'use strict';

const { resolveTenantId } = require('./tenantScope');

/**
 * Resolves and validates tenant context for WhatsApp API routes.
 * Each tenant's QR session, messages, and send path are strictly isolated.
 */
function requireWhatsAppTenant(req) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    return {
      ok: false,
      status: 403,
      message: 'Tenant context required. Each salon must connect WhatsApp from its own admin account.',
    };
  }

  const tid = Number(tenantId);
  if (!Number.isInteger(tid) || tid < 1) {
    return { ok: false, status: 400, message: 'Invalid tenant.' };
  }

  // Salon users: always scoped to JWT tenant — never a client header.
  if (req.user && req.user.role !== 'platform_admin') {
    const userTid = Number(req.userTenantId ?? req.user.tenantId ?? req.user.tenant_id);
    if (userTid && userTid !== tid) {
      return { ok: false, status: 403, message: 'Access denied — tenant mismatch.' };
    }
  }

  // Platform admin must explicitly browse a tenant (X-Tenant-Slug / Host).
  if (req.user?.role === 'platform_admin') {
    if (!req.tenant?.id || Number(req.tenant.id) !== tid) {
      return {
        ok: false,
        status: 403,
        message: 'Select a salon tenant before managing WhatsApp.',
      };
    }
  }

  return { ok: true, tenantId: tid };
}

function normalizeTenantId(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isInteger(tid) || tid < 1) {
    throw new Error('Invalid tenant_id');
  }
  return tid;
}

function resolveSocketWhatsAppTenant(socket, payload = {}) {
  const role = socket.user?.role;
  if (!role || !['superadmin', 'admin', 'platform_admin'].includes(role)) {
    return null;
  }

  if (role === 'platform_admin') {
    const requested = payload.tenantId != null ? Number(payload.tenantId) : null;
    if (!requested || !Number.isInteger(requested) || requested < 1) return null;
    return requested;
  }

  const tid = Number(socket.user?.tenantId ?? socket.user?.tenant_id);
  if (!tid || !Number.isInteger(tid)) return null;
  return tid;
}

module.exports = { requireWhatsAppTenant, normalizeTenantId, resolveSocketWhatsAppTenant };
