/**
 * featureGate — JWT tenant is authoritative for non-platform_admin (C2).
 */
'use strict';

const { Tenant, CrmAuditLog } = require('../models');
const { getMinPlanForFeature } = require('../utils/planConfig');
const { hasTenantFeature } = require('../utils/tenantFeatures');

const FEATURE_LABELS = {
  ai_chat: 'AI Chat Assistant',
  whatsapp_ai_crm: 'WhatsApp AI CRM',
  ai_knowledge_base: 'AI Knowledge Base',
  loyalty: 'Loyalty Program',
  membership: 'Membership Plans',
  packages: 'Packages',
  kpi_dashboard: 'KPI Dashboard',
  marketing_auto: 'Marketing Automation',
  advanced_reports: 'Advanced Reports',
  discounts: 'Discounts',
  recurring: 'Recurring Appointments',
  custom_domain: 'Custom Domain',
  offer_sms: 'Offer SMS',
  multi_branch: 'Multi-Branch',
  service_wise_commission: 'Service-Wise Commission',
};

async function logTenantMismatch(req, jwtTenantId, slugTenantId, feature) {
  console.error('[security] TENANT_SLUG_MISMATCH', {
    userId: req.user?.id,
    role: req.user?.role,
    jwtTenantId,
    slugTenantId,
    feature,
    path: req.originalUrl || req.url,
  });
  try {
    await CrmAuditLog.create({
      tenant_id: jwtTenantId || null,
      actor_type: 'user',
      actor_id: req.user?.id || null,
      action: 'security.tenant_slug_mismatch',
      entity_type: 'tenant',
      entity_id: slugTenantId || null,
      meta: {
        jwt_tenant_id: jwtTenantId,
        slug_tenant_id: slugTenantId,
        feature,
        path: req.originalUrl || req.url,
        ip: req.ip || null,
      },
    });
  } catch (e) {
    console.warn('[security] audit log failed', e.message);
  }
}

/**
 * Enforce JWT vs slug. Mutates req.tenant to JWT tenant for normal users.
 * @returns {{ ok: true, tenant } | { ok: false, status, body }}
 */
async function enforceJwtTenantAuthority(req, feature) {
  const role = req.user?.role;
  const jwtTenantId = req.userTenantId ?? req.user?.tenantId ?? null;
  const slugTenant = req.tenant || null;
  const slugTenantId = slugTenant?.id ?? null;

  // Platform admin: may explicitly select another tenant via slug/header
  if (role === 'platform_admin') {
    if (slugTenant) return { ok: true, tenant: slugTenant };
    return { ok: true, tenant: null }; // no salon selected
  }

  // Unauthenticated — leave to route auth
  if (!req.user) {
    if (slugTenant) return { ok: true, tenant: slugTenant };
    return { ok: true, tenant: null };
  }

  // Tenant users: JWT is authoritative
  if (!jwtTenantId) {
    return {
      ok: false,
      status: 403,
      body: { message: 'Tenant context required.', code: 'TENANT_REQUIRED', feature },
    };
  }

  if (slugTenantId != null && Number(slugTenantId) !== Number(jwtTenantId)) {
    await logTenantMismatch(req, Number(jwtTenantId), Number(slugTenantId), feature);
    return {
      ok: false,
      status: 403,
      body: {
        message: 'Tenant mismatch. Request denied.',
        code: 'TENANT_SLUG_MISMATCH',
        feature,
      },
    };
  }

  let tenant = slugTenant && Number(slugTenant.id) === Number(jwtTenantId)
    ? slugTenant
    : null;
  if (!tenant) {
    tenant = await Tenant.findByPk(jwtTenantId);
  }
  if (!tenant) {
    return {
      ok: false,
      status: 403,
      body: { message: 'Tenant context required.', code: 'TENANT_REQUIRED', feature },
    };
  }

  req.tenant = tenant; // force JWT tenant
  return { ok: true, tenant };
}

const featureGate = (feature) => async (req, res, next) => {
  try {
    const enforced = await enforceJwtTenantAuthority(req, feature);
    if (!enforced.ok) {
      return res.status(enforced.status).json(enforced.body);
    }

    // Platform admin without selected salon may pass (platform ops)
    if (req.user?.role === 'platform_admin' && !enforced.tenant) {
      return next();
    }

    const tenant = enforced.tenant;
    if (!tenant) {
      return res.status(403).json({
        message: 'Tenant context required.',
        code: 'TENANT_REQUIRED',
        feature,
      });
    }

    if (hasTenantFeature(tenant, feature)) {
      return next();
    }

    const plan = tenant.plan || 'trial';
    const requiredPlan = getMinPlanForFeature(feature);
    const label = FEATURE_LABELS[feature] || feature;
    const adminControlled = tenant.enabled_features != null;

    return res.status(403).json({
      message: adminControlled
        ? `${label} is not enabled for this salon. Contact your platform administrator.`
        : `${label} requires the ${requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)} plan. Please upgrade to access this feature.`,
      code: adminControlled ? 'FEATURE_DISABLED' : 'FEATURE_GATED',
      feature,
      requiredPlan,
      currentPlan: plan,
    });
  } catch (err) {
    console.error('featureGate error:', err);
    return res.status(500).json({ message: 'Feature gate error.' });
  }
};

module.exports = {
  featureGate,
  enforceJwtTenantAuthority,
  FEATURE_LABELS,
};
