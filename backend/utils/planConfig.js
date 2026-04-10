const PLAN_LIMITS = {
  trial: { branch: 1, staff: 5, service: 20 },
  basic: { branch: 1, staff: 10, service: 50 },
  pro: { branch: 5, staff: 50, service: 200 },
  enterprise: { branch: -1, staff: -1, service: -1 },
};

/**
 * PLAN_FEATURES – defines which features are available per plan.
 * true = allowed, false = gated (prompt upgrade).
 */
const PLAN_FEATURES = {
  trial: {
    ai_chat: false,
    loyalty: false,
    membership: false,
    packages: false,
    kpi_dashboard: false,
    marketing_auto: false,
    advanced_reports: false,
    inventory: true,
    discounts: false,
    recurring: false,
    custom_domain: false,
    consent_forms: true,
    offer_sms: false,
    multi_branch: false,
    reviews: true,
    expenses: true,
  },
  basic: {
    ai_chat: false,
    loyalty: false,
    membership: false,
    packages: true,
    kpi_dashboard: false,
    marketing_auto: false,
    advanced_reports: false,
    inventory: true,
    discounts: true,
    recurring: true,
    custom_domain: false,
    consent_forms: true,
    offer_sms: true,
    multi_branch: false,
    reviews: true,
    expenses: true,
  },
  pro: {
    ai_chat: true,
    loyalty: true,
    membership: true,
    packages: true,
    kpi_dashboard: true,
    marketing_auto: true,
    advanced_reports: true,
    inventory: true,
    discounts: true,
    recurring: true,
    custom_domain: false,
    consent_forms: true,
    offer_sms: true,
    multi_branch: true,
    reviews: true,
    expenses: true,
  },
  enterprise: {
    ai_chat: true,
    loyalty: true,
    membership: true,
    packages: true,
    kpi_dashboard: true,
    marketing_auto: true,
    advanced_reports: true,
    inventory: true,
    discounts: true,
    recurring: true,
    custom_domain: true,
    consent_forms: true,
    offer_sms: true,
    multi_branch: true,
    reviews: true,
    expenses: true,
  },
};

/**
 * Minimum required plan for feature (used in upgrade prompts)
 */
const FEATURE_MIN_PLAN = {};
for (const feature of Object.keys(PLAN_FEATURES.enterprise)) {
  for (const plan of ['trial', 'basic', 'pro', 'enterprise']) {
    if (PLAN_FEATURES[plan][feature]) {
      FEATURE_MIN_PLAN[feature] = plan;
      break;
    }
  }
}

function normalizePlan(plan = 'trial') {
  const key = String(plan || 'trial').toLowerCase();
  return PLAN_LIMITS[key] ? key : 'trial';
}

function getPlanLimits(plan = 'trial') {
  return PLAN_LIMITS[normalizePlan(plan)];
}

function getTenantCaps(plan = 'trial') {
  const limits = getPlanLimits(plan);
  return {
    max_branches: limits.branch,
    max_staff:    limits.staff,
    max_services: limits.service,
  };
}

function addTrialDays(startDate = new Date(), days = 14) {
  const date = new Date(startDate);
  date.setDate(date.getDate() + Number(days || 14));
  return date;
}

function getPlanFeatures(plan = 'trial') {
  return PLAN_FEATURES[normalizePlan(plan)] || PLAN_FEATURES.trial;
}

function hasFeature(plan, feature) {
  const features = getPlanFeatures(plan);
  return features[feature] === true;
}

function getMinPlanForFeature(feature) {
  return FEATURE_MIN_PLAN[feature] || 'enterprise';
}

module.exports = {
  PLAN_LIMITS,
  PLAN_FEATURES,
  FEATURE_MIN_PLAN,
  getPlanLimits,
  getPlanFeatures,
  hasFeature,
  getMinPlanForFeature,
  getTenantCaps,
  addTrialDays,
};
