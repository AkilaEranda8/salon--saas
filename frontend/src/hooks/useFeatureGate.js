/**
 * useFeatureGate – checks whether a feature is available for the current tenant's plan.
 *
 * Usage:
 *   const { allowed, minPlan, gate } = useFeatureGate('ai_chat');
 *   if (!allowed) return gate;       // renders upgrade prompt inline
 *   // ...render feature normally
 *
 *   // Or just check:
 *   const { allowed } = useFeatureGate('loyalty');
 */
import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

// Must mirror backend PLAN_FEATURES.  Keep in sync with backend/utils/planConfig.js
const PLAN_FEATURES = {
  trial: {
    ai_chat: false, loyalty: false, membership: false, packages: false,
    kpi_dashboard: false, marketing_auto: false, advanced_reports: false,
    inventory: true, discounts: false, recurring: false, custom_domain: false,
    consent_forms: true, offer_sms: false, multi_branch: false,
    reviews: true, expenses: true,
  },
  basic: {
    ai_chat: false, loyalty: false, membership: false, packages: true,
    kpi_dashboard: false, marketing_auto: false, advanced_reports: false,
    inventory: true, discounts: true, recurring: true, custom_domain: false,
    consent_forms: true, offer_sms: true, multi_branch: false,
    reviews: true, expenses: true,
  },
  pro: {
    ai_chat: true, loyalty: true, membership: true, packages: true,
    kpi_dashboard: true, marketing_auto: true, advanced_reports: true,
    inventory: true, discounts: true, recurring: true, custom_domain: false,
    consent_forms: true, offer_sms: true, multi_branch: true,
    reviews: true, expenses: true,
  },
  enterprise: {
    ai_chat: true, loyalty: true, membership: true, packages: true,
    kpi_dashboard: true, marketing_auto: true, advanced_reports: true,
    inventory: true, discounts: true, recurring: true, custom_domain: true,
    consent_forms: true, offer_sms: true, multi_branch: true,
    reviews: true, expenses: true,
  },
};

const PLAN_ORDER = ['trial', 'basic', 'pro', 'enterprise'];

const PLAN_LABELS = {
  trial: 'Free Trial',
  basic: 'Basic',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const FEATURE_LABELS = {
  ai_chat: 'AI Chat Assistant',
  loyalty: 'Loyalty Program',
  membership: 'Membership Plans',
  packages: 'Packages',
  kpi_dashboard: 'KPI Dashboard',
  marketing_auto: 'Marketing Automation',
  advanced_reports: 'Advanced Reports',
  inventory: 'Inventory Management',
  discounts: 'Discounts',
  recurring: 'Recurring Appointments',
  custom_domain: 'Custom Domain',
  consent_forms: 'Consent Forms',
  offer_sms: 'Offer SMS',
  multi_branch: 'Multi-Branch',
  reviews: 'Reviews',
  expenses: 'Expense Tracking',
};

function getMinPlan(feature) {
  for (const plan of PLAN_ORDER) {
    if (PLAN_FEATURES[plan]?.[feature]) return plan;
  }
  return 'enterprise';
}

export function hasFeature(plan, feature) {
  const p = (plan || 'trial').toLowerCase();
  return PLAN_FEATURES[p]?.[feature] === true;
}

export function useFeatureGate(feature) {
  const { tenant } = useAuth();
  const plan = (tenant?.plan || 'trial').toLowerCase();

  return useMemo(() => {
    const allowed = PLAN_FEATURES[plan]?.[feature] === true;
    const minPlan = getMinPlan(feature);
    return {
      allowed,
      currentPlan: plan,
      minPlan,
      minPlanLabel: PLAN_LABELS[minPlan] || minPlan,
      featureLabel: FEATURE_LABELS[feature] || feature,
    };
  }, [plan, feature]);
}

export { PLAN_FEATURES, PLAN_ORDER, PLAN_LABELS, FEATURE_LABELS };
