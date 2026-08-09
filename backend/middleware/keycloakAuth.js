const jwt         = require('jsonwebtoken');
const jwksClient  = require('jwks-rsa');

// ─── JWKS client — fetches Keycloak's public keys and caches them ─────────────
const client = jwksClient({
  jwksUri:             `${process.env.KEYCLOAK_URL}/realms/salon-saas/protocol/openid-connect/certs`,
  cache:               true,
  cacheMaxEntries:     10,
  cacheMaxAge:         30 * 60 * 1000, // 30 minutes
  rateLimit:           true,
  jwksRequestsPerMinute: 10,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

// ─── Permissions map (shared shape — same as legacyAuth) ─────────────────────
const PERMISSIONS = {
  platform_admin: { del: true,  branches: true,  users: true,  all: true,  services: true,  staff: true  },
  superadmin:     { del: true,  branches: true,  users: true,  all: true,  services: true,  staff: true  },
  admin:          { del: true,  branches: true,  users: false, all: true,  services: true,  staff: true  },
  manager:        { del: true,  branches: false, users: false, all: false, services: true,  staff: true  },
  staff:          { del: false, branches: false, users: false, all: false, services: false, staff: false },
};

// Short-lived DB role cache so drifted Keycloak salon_role claims don't block managers.
const _roleCache = new Map(); // dbUserId -> { role, branchId, tenantId, at }
const ROLE_CACHE_MS = 60_000;

function invalidateRoleCache(userId) {
  if (userId == null) return;
  _roleCache.delete(Number(userId));
}

function claimRole(value) {
  if (value == null) return null;
  // Keycloak multi-valued attributes often arrive as arrays.
  const raw = Array.isArray(value) ? value[0] : value;
  const role = String(raw ?? '').trim().toLowerCase();
  return role || null;
}

async function hydrateUserFromDb(user) {
  if (!user?.id) return user;
  const cached = _roleCache.get(user.id);
  if (cached && Date.now() - cached.at < ROLE_CACHE_MS) {
    user.role = cached.role;
    if (cached.branchId != null) user.branchId = cached.branchId;
    if (cached.tenantId != null) user.tenantId = cached.tenantId;
    return user;
  }
  try {
    const { User } = require('../models');
    const row = await User.findByPk(user.id, {
      attributes: ['id', 'role', 'branch_id', 'tenant_id', 'is_active'],
    });
    if (row && row.is_active !== false) {
      const role = String(row.role || '').trim().toLowerCase();
      if (role) user.role = role;
      if (row.branch_id != null) user.branchId = Number(row.branch_id);
      if (row.tenant_id != null) user.tenantId = Number(row.tenant_id);
      _roleCache.set(user.id, {
        role: user.role,
        branchId: user.branchId ?? null,
        tenantId: user.tenantId ?? null,
        at: Date.now(),
      });
    }
  } catch (err) {
    console.warn('[KC auth] DB role hydrate skipped:', err.message);
  }
  return user;
}

// ─── Map Keycloak token claims → existing req.user shape ─────────────────────
function mapClaims(decoded) {
  return {
    id:         decoded.db_user_id  ? Number(decoded.db_user_id)  : null,
    username:   decoded.preferred_username ?? null,
    role:       claimRole(decoded.salon_role),
    branchId:   decoded.branch_id   ? Number(decoded.branch_id)   : null,
    name:       decoded.name        ?? null,
    tenantId:   decoded.tenant_id   ? Number(decoded.tenant_id)   : null,
    tenantSlug: decoded.tenant_slug ?? null,
  };
}

// ─── verifyToken ──────────────────────────────────────────────────────────────
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;

  if (!token) {
    return res.status(401).json({ message: 'No token provided. Access denied.' });
  }

  jwt.verify(token, getKey, { algorithms: ['RS256'] }, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired. Please log in again.' });
      }
      return res.status(403).json({ message: 'Invalid or expired token.' });
    }

    const user = mapClaims(decoded);
    hydrateUserFromDb(user)
      .then((hydrated) => {
        req.user = hydrated;
        req.userTenantId = hydrated.role === 'platform_admin' ? null : (hydrated.tenantId ?? null);
        next();
      })
      .catch(() => {
        req.user = user;
        req.userTenantId = user.role === 'platform_admin' ? null : (user.tenantId ?? null);
        next();
      });
  });
};

// ─── optionalVerifyToken ──────────────────────────────────────────────────────
const optionalVerifyToken = (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;

  if (!token) {
    return res.json({ user: null });
  }

  jwt.verify(token, getKey, { algorithms: ['RS256'] }, (err, decoded) => {
    if (err) return res.json({ user: null });
    const user = mapClaims(decoded);
    hydrateUserFromDb(user)
      .then((hydrated) => {
        req.user = hydrated;
        req.userTenantId = hydrated.role === 'platform_admin' ? null : (hydrated.tenantId ?? null);
        next();
      })
      .catch(() => {
        req.user = user;
        req.userTenantId = user.role === 'platform_admin' ? null : (user.tenantId ?? null);
        next();
      });
  });
};

// ─── requireRole ──────────────────────────────────────────────────────────────
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated.' });
  }
  const userRole = String(req.user.role || '').trim().toLowerCase();
  const allowed = roles.map((r) => String(r).trim().toLowerCase());
  if (!allowed.includes(userRole)) {
    return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
  }
  next();
};

module.exports = {
  verifyToken,
  optionalVerifyToken,
  requireRole,
  PERMISSIONS,
  invalidateRoleCache,
};
