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
const GRACE_DAYS = 7; // days after expiry before hard-blocking

const checkSubscription = (req, res, next) => {
  const tenant = req.tenant;

  // Platform admins and requests without a tenant slug bypass this check
  if (!tenant) return next();

  const now = new Date();

  // Hard suspended
  if (tenant.status === 'suspended') {
    return res.status(402).json({
      message: 'Your subscription is suspended. Please update your billing to continue.',
      code: 'SUBSCRIPTION_SUSPENDED',
    });
  }

  // Trial expired — check grace period
  if (tenant.plan === 'trial' && tenant.trial_ends_at) {
    const trialEnd = new Date(tenant.trial_ends_at);
    if (trialEnd < now) {
      const graceCutoff = new Date(trialEnd.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
      if (now > graceCutoff) {
        return res.status(402).json({
          message: 'Your free trial has expired. Please subscribe to continue.',
          code: 'TRIAL_EXPIRED',
        });
      }
      // Within grace — allow through but signal to frontend
      res.setHeader('X-Subscription-Warning', 'trial_grace_period');
    }
  }

  // Paid plan that lapsed (past_due) — check grace period
  if (tenant.status === 'past_due' && tenant.subscription_ends_at) {
    const subEnd = new Date(tenant.subscription_ends_at);
    const graceCutoff = new Date(subEnd.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    if (now > graceCutoff) {
      return res.status(402).json({
        message: 'Your subscription has expired. Please renew to continue.',
        code: 'SUBSCRIPTION_EXPIRED',
      });
    }
    res.setHeader('X-Subscription-Warning', 'past_due_grace_period');
  }

  next();
};

module.exports = { checkSubscription };
