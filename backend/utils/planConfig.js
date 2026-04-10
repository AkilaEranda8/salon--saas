const PLAN_LIMITS = {
  trial: { branch: 1, staff: 5, service: 20 },
  basic: { branch: 1, staff: 10, service: 50 },
  pro: { branch: 5, staff: 50, service: 200 },
  enterprise: { branch: -1, staff: -1, service: -1 },
};

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

module.exports = {
  PLAN_LIMITS,
  getPlanLimits,
  getTenantCaps,
  addTrialDays,
};
