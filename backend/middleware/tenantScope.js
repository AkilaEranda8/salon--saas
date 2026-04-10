/**
 * tenantScope middleware
 *
 * Reads the X-Tenant-Slug header, looks up the Tenant record,
 * and attaches it to req.tenant.
 *
 * - If no slug is provided, req.tenant = null (platform_admin login flow).
 * - If the slug is unknown or the tenant is not active, returns 404/403.
 * - Tenant records are cached in memory for 60 seconds to avoid a DB hit
 *   on every request.
 *
 * Must be registered BEFORE all route handlers in server.js.
 */

const { Tenant } = require('../models');

const CACHE_TTL_MS = 60 * 1000; // 60 seconds

const tenantCache = new Map(); // slug → { tenant, cachedAt }

function getCached(slug) {
  const entry = tenantCache.get(slug);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    tenantCache.delete(slug);
    return null;
  }
  return entry.tenant;
}

function setCache(slug, tenant) {
  tenantCache.set(slug, { tenant, cachedAt: Date.now() });
}

/**
 * Call this from tenant update/delete controllers to invalidate the cache
 * so the next request reflects the change within 0 seconds instead of 60.
 */
function invalidateTenantCache(slug) {
  tenantCache.delete(slug);
}

const tenantScope = async (req, res, next) => {
  const slug = req.headers['x-tenant-slug'];
  const customHost = req.headers['x-tenant-host'];

  if (!slug && !customHost) {
    // No tenant context — allow through. Auth routes will check for platform_admin.
    req.tenant = null;
    return next();
  }

  if (slug) {
    // Check cache first
    const cached = getCached(slug);
    if (cached) {
      req.tenant = cached;
      return next();
    }

    try {
      const tenant = await Tenant.findOne({ where: { slug } });

      if (!tenant) {
        return res.status(404).json({ message: 'Salon not found.' });
      }

      if (tenant.status === 'cancelled') {
        return res.status(403).json({
          message: 'This account has been cancelled.',
          code: 'ACCOUNT_CANCELLED',
        });
      }

      setCache(slug, tenant);
      req.tenant = tenant;
      return next();
    } catch (err) {
      console.error('tenantScope error:', err);
      return res.status(500).json({ message: 'Server error resolving tenant.' });
    }
  }

  // Custom domain lookup via X-Tenant-Host header
  const cacheKey = `host:${customHost}`;
  const cached = getCached(cacheKey);
  if (cached) {
    req.tenant = cached;
    return next();
  }

  try {
    const tenant = await Tenant.findOne({ where: { custom_domain: customHost } });

    if (!tenant) {
      return res.status(404).json({ message: 'Salon not found.' });
    }

    if (tenant.status === 'cancelled') {
      return res.status(403).json({
        message: 'This account has been cancelled.',
        code: 'ACCOUNT_CANCELLED',
      });
    }

    setCache(cacheKey, tenant);
    req.tenant = tenant;
    return next();
  } catch (err) {
    console.error('tenantScope customHost error:', err);
    return res.status(500).json({ message: 'Server error resolving tenant.' });
  }
};

module.exports = { tenantScope, invalidateTenantCache };
