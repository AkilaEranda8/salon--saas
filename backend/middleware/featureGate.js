/**
 * featureGate middleware factory
 *
 * Checks whether the tenant's plan includes a specific feature.
 * Returns HTTP 403 with FEATURE_GATED code so the frontend can show
 * the upgrade modal.
 *
 * Usage in routes:
 *   router.get('/', verifyToken, featureGate('ai_chat'), ctrl.list);
 *   router.post('/', verifyToken, featureGate('loyalty'), ctrl.create);
 */
const { getMinPlanForFeature } = require('../utils/planConfig');
const { hasTenantFeature } = require('../utils/tenantFeatures');

const FEATURE_LABELS = {
  ai_chat: 'AI Chat Assistant',
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

const featureGate = (feature) => (req, res, next) => {
  const tenant = req.tenant;
  // Platform admins and no-tenant requests bypass
  if (!tenant) return next();

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
};

module.exports = { featureGate };
