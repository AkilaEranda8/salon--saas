/**
 * requirePlan(...plans) — feature-gate middleware.
 * Use AFTER verifyToken + tenantScope.
 *
 * Usage:
 *   router.post('/helapay/qr', verifyToken, requirePlan('pro', 'enterprise'), handler);
 *
 * Plan hierarchy (lowest → highest): trial → basic → pro → enterprise
 * platform_admin is always allowed through.
 */

const PLAN_RANK = { trial: 0, basic: 1, pro: 2, enterprise: 3 };

const requirePlan = (...plans) => (req, res, next) => {
  if (req.user?.role === 'platform_admin') return next();

  const tenantPlan = (req.tenant?.plan || 'trial').toLowerCase();
  const allowed    = plans.map(p => p.toLowerCase());

  if (!allowed.includes(tenantPlan)) {
    return res.status(403).json({
      message: `This feature requires ${plans.join(' or ')} plan.`,
      code:    'PLAN_UPGRADE_REQUIRED',
      current: tenantPlan,
      required: plans,
    });
  }
  next();
};

module.exports = requirePlan;
