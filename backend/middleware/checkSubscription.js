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

// Short in-memory cache of the latest past_due period end per tenant (avoid a DB hit per request)
const GRACE_CACHE_TTL_MS = 60 * 1000;
const graceCache = new Map(); // tenantId -> { end: Date|null, at }

function invalidateSubscriptionGraceCache(tenantId) {
  if (tenantId == null) return;
  graceCache.delete(Number(tenantId));
}

async function getPastDueEnd(tenantId) {
  const key = Number(tenantId);
  const hit = graceCache.get(key);
  if (hit && Date.now() - hit.at < GRACE_CACHE_TTL_MS) return hit.end;
  const { Subscription } = require('../models');
  const sub = await Subscription.findOne({
    where: { tenant_id: key },
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    attributes: ['id', 'status', 'current_period_end'],
  });
  const end = sub && sub.status === 'past_due' && sub.current_period_end
    ? new Date(sub.current_period_end)
    : null;
  graceCache.set(key, { end, at: Date.now() });
  return end;
}

const checkSubscription = async (req, res, next) => {
  try {
    const { enforceJwtTenantAuthority } = require('./featureGate');
    const enforced = await enforceJwtTenantAuthority(req, 'subscription');
    if (!enforced.ok) {
      return res.status(enforced.status).json(enforced.body);
    }

    if (req.user?.role === 'platform_admin' && !enforced.tenant) {
      return next();
    }

    const tenant = enforced.tenant;
    if (!tenant) {
      if (req.user && req.user.role !== 'platform_admin') {
        return res.status(403).json({
          message: 'Tenant context required.',
          code: 'TENANT_REQUIRED',
        });
      }
      return next();
    }

    const now = new Date();
    const path = req.originalUrl || req.url || '';
    // Let tenants reach billing/renewal endpoints even when suspended or past grace.
    const isBillingPath = path.startsWith('/api/billing') && !path.startsWith('/api/billing/webhook');

    // JWT-derived tenants bypass tenantScope's cancelled check, so enforce it here too.
    if (tenant.status === 'cancelled') {
      return res.status(403).json({
        message: 'This account has been cancelled.',
        code: 'ACCOUNT_CANCELLED',
      });
    }

    if (tenant.status === 'suspended') {
      if (isBillingPath) {
        res.setHeader('X-Subscription-Warning', 'subscription_suspended');
        return next();
      }
      return res.status(402).json({
        message: 'Your subscription is suspended. Please update your billing to continue.',
        code: 'SUBSCRIPTION_SUSPENDED',
      });
    }

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
        res.setHeader('X-Subscription-Warning', 'trial_grace_period');
      }
    }

    // Tenant.status has no past_due value; payment-failure state lives on the Subscription row.
    // Legacy: tenant.status/subscription_ends_at (kept in case a deployment has them).
    let pastDueEnd = null;
    if (tenant.status === 'past_due' && tenant.subscription_ends_at) {
      pastDueEnd = new Date(tenant.subscription_ends_at);
    } else if (tenant.stripe_subscription_id) {
      pastDueEnd = await getPastDueEnd(tenant.id);
    }
    if (pastDueEnd) {
      const graceCutoff = new Date(pastDueEnd.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
      if (now > graceCutoff) {
        if (isBillingPath) {
          res.setHeader('X-Subscription-Warning', 'subscription_expired');
          return next();
        }
        return res.status(402).json({
          message: 'Your subscription has expired. Please renew to continue.',
          code: 'SUBSCRIPTION_EXPIRED',
        });
      }
      res.setHeader('X-Subscription-Warning', 'past_due_grace_period');
    }

    return next();
  } catch (err) {
    console.error('checkSubscription error:', err);
    return res.status(500).json({ message: 'Subscription check failed.' });
  }
};

module.exports = { checkSubscription, invalidateSubscriptionGraceCache };
