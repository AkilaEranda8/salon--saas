/**
 * checkSubscription middleware
 *
 * Blocks requests for tenants whose subscription has expired or been suspended.
 * Returns HTTP 402 with a machine-readable code so the frontend can show
 * the appropriate upgrade/billing prompt.
 *
 * Must be used AFTER tenantScope (so req.tenant is populated).
 * platform_admin requests (req.tenant = null) are always allowed through.
 */
const checkSubscription = (req, res, next) => {
  const tenant = req.tenant;

  // Platform admins and requests without a tenant slug bypass this check
  if (!tenant) return next();

  if (tenant.status === 'suspended') {
    return res.status(402).json({
      message: 'Your subscription is suspended. Please update your billing to continue.',
      code: 'SUBSCRIPTION_SUSPENDED',
    });
  }

  if (tenant.plan === 'trial' && tenant.trial_ends_at && new Date(tenant.trial_ends_at) < new Date()) {
    return res.status(402).json({
      message: 'Your free trial has expired. Please subscribe to continue.',
      code: 'TRIAL_EXPIRED',
    });
  }

  next();
};

module.exports = { checkSubscription };
