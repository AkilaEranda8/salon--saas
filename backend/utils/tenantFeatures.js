/**
 * Per-tenant feature flags — platform admin enables/disables modules per salon.
 * When enabled_features is set on a tenant, only keys explicitly true are active.
 * When null, plan defaults apply (backward compatible for existing tenants).
 */
const { getPlanFeatures } = require('./planConfig');

const FEATURE_CATALOG = [
  { key: 'ai_chat', label: 'AI Chat', category: 'Main' },
  { key: 'loyalty', label: 'Loyalty Program', category: 'Operations' },
  { key: 'membership', label: 'Membership Plans', category: 'Operations' },
  { key: 'packages', label: 'Packages', category: 'Operations' },
  { key: 'discounts', label: 'Discounts', category: 'Operations' },
  { key: 'recurring', label: 'Recurring Appointments', category: 'Operations' },
  { key: 'inventory', label: 'Inventory', category: 'Catalogue' },
  { key: 'kpi_dashboard', label: 'KPI Dashboard', category: 'Analytics' },
  { key: 'advanced_reports', label: 'Advanced Reports', category: 'Analytics' },
  { key: 'expenses', label: 'Expenses', category: 'Analytics' },
  { key: 'offer_sms', label: 'Offer SMS', category: 'Engage' },
  { key: 'marketing_auto', label: 'Marketing Automation', category: 'Engage' },
  { key: 'consent_forms', label: 'Consent Forms', category: 'Account' },
  { key: 'custom_domain', label: 'Custom Domain', category: 'Config' },
  { key: 'multi_branch', label: 'Multi-Branch', category: 'Config' },
  { key: 'reviews', label: 'Reviews', category: 'Engage' },
  { key: 'service_wise_commission', label: 'Service-Wise Commission', category: 'Team' },
];

const FEATURE_KEYS = new Set(FEATURE_CATALOG.map((f) => f.key));

function parseEnabledFeatures(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;

  const out = {};
  for (const key of FEATURE_KEYS) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  return Object.keys(out).length ? out : null;
}

/** Effective map used by API + sidebar (all catalog keys). */
function getEffectiveFeatures(tenant) {
  const plan = tenant?.plan || 'trial';
  const planDefaults = getPlanFeatures(plan);
  const adminFlags = parseEnabledFeatures(tenant?.enabled_features);

  const out = {};
  for (const key of FEATURE_KEYS) {
    if (adminFlags) {
      out[key] = adminFlags[key] === true;
    } else {
      out[key] = planDefaults[key] === true;
    }
  }
  return out;
}

function hasTenantFeature(tenant, feature) {
  if (!tenant) return true;
  return getEffectiveFeatures(tenant)[feature] === true;
}

/** Hide service catalogue commission in API payloads when the flag is off. */
function sanitizeServiceRecord(service, tenant) {
  const json = service && typeof service.toJSON === 'function' ? service.toJSON() : { ...(service || {}) };
  if (!hasTenantFeature(tenant, 'service_wise_commission')) {
    json.commission_type = null;
    json.commission_value = null;
  }
  return json;
}

/** Hide per-service staff commission data when the flag is off. */
function sanitizeStaffRecord(staff, tenant) {
  const json = staff && typeof staff.toJSON === 'function' ? staff.toJSON() : { ...(staff || {}) };
  if (!hasTenantFeature(tenant, 'service_wise_commission') && Array.isArray(json.specializations)) {
    if (json.salary_type === 'salary_only') {
      json.specializations = json.specializations.map((s) => ({
        ...s,
        commission_type: null,
        commission_value: null,
      }));
    } else {
      json.specializations = [];
    }
  }
  return json;
}

/** Strip per-service commission overrides when the tenant flag is off. */
function applyServiceWiseCommissionPolicy(items, tenant) {
  if (!Array.isArray(items)) return [];
  if (hasTenantFeature(tenant, 'service_wise_commission')) return items;
  return items.map((item) => ({
    service_id: item.service_id,
    commission_type: null,
    commission_value: null,
  }));
}

function sanitizeFeaturesInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('features object is required.');
  }
  const out = {};
  for (const key of FEATURE_KEYS) {
    if (typeof input[key] === 'boolean') out[key] = input[key];
  }
  if (!Object.keys(out).length) {
    throw new Error('At least one feature toggle is required.');
  }
  return out;
}

/** Seed new tenants from plan so admin can adjust per salon. */
function defaultsFromPlan(plan) {
  const planDefaults = getPlanFeatures(plan);
  const out = {};
  for (const key of FEATURE_KEYS) {
    out[key] = planDefaults[key] === true;
  }
  return out;
}

/** Attach effective_features for API / auth responses. */
function enrichTenantPayload(tenant) {
  if (!tenant) return null;
  const json = typeof tenant.toJSON === 'function' ? tenant.toJSON() : { ...tenant };
  json.effective_features = getEffectiveFeatures(tenant);
  return json;
}

/** Sequelize attribute list for auth tenant includes. */
const TENANT_AUTH_ATTRIBUTES = [
  'id', 'slug', 'name', 'brand_name',
  'logo_sidebar_url', 'logo_header_url', 'logo_login_url', 'logo_public_url',
  'primary_color', 'sidebar_style', 'font_family',
  'plan', 'status', 'trial_ends_at', 'enabled_features',
];

module.exports = {
  FEATURE_CATALOG,
  FEATURE_KEYS,
  parseEnabledFeatures,
  getEffectiveFeatures,
  hasTenantFeature,
  applyServiceWiseCommissionPolicy,
  sanitizeServiceRecord,
  sanitizeStaffRecord,
  sanitizeFeaturesInput,
  defaultsFromPlan,
  enrichTenantPayload,
  TENANT_AUTH_ATTRIBUTES,
};
