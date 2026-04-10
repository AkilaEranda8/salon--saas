/**
 * planLimits middleware factory
 *
 * Returns a middleware that checks whether the tenant has reached the
 * plan limit for a given resource before allowing a CREATE operation.
 *
 * Usage in routes:
 *   router.post('/', verifyToken, checkLimit('staff'), ctrl.create);
 *   router.post('/', verifyToken, checkLimit('branch'), ctrl.create);
 *   router.post('/', verifyToken, checkLimit('service'), ctrl.create);
 *
 * Plan limits:
 *   trial:      1 branch, 5 staff, 20 services
 *   basic:      1 branch, 10 staff, 50 services
 *   pro:        5 branches, 50 staff, 200 services
 *   enterprise: unlimited (-1)
 */

const { Staff, Branch, Service } = require('../models');
const { PLAN_LIMITS, getPlanLimits } = require('../utils/planConfig');

const MODELS = {
  staff:   Staff,
  branch:  Branch,
  service: Service,
};

const COUNT_SCOPE = {
  staff:   { is_active: true },
  branch:  { status: 'active' },
  service: { is_active: true },
};

const checkLimit = (resource) => async (req, res, next) => {
  const tenant = req.tenant;
  if (!tenant) return next(); // platform_admin bypasses

  const plan   = tenant.plan || 'trial';
  const limits = getPlanLimits(plan);
  const max    = limits[resource];

  if (max === -1) return next(); // unlimited

  const Model = MODELS[resource];
  if (!Model) return next();

  try {
    const count = await Model.count({
      where: { tenant_id: tenant.id, ...(COUNT_SCOPE[resource] || {}) },
    });

    if (count >= max) {
      return res.status(403).json({
        message: `Your ${plan} plan allows a maximum of ${max} ${resource}${max !== 1 ? 's' : ''}. Please upgrade to add more.`,
        code:    `PLAN_LIMIT_${resource.toUpperCase()}`,
        limit:   max,
        current: count,
      });
    }

    next();
  } catch (err) {
    console.error(`planLimits (${resource}) error:`, err);
    return res.status(500).json({ message: 'Server error checking plan limits.' });
  }
};

module.exports = { checkLimit, PLAN_LIMITS };
