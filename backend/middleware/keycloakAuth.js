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
  manager:        { del: true,  branches: false, users: false, all: false, services: false, staff: true  },
  staff:          { del: false, branches: false, users: false, all: false, services: false, staff: false },
};

// ─── Map Keycloak token claims → existing req.user shape ─────────────────────
function mapClaims(decoded) {
  return {
    id:         decoded.db_user_id  ? Number(decoded.db_user_id)  : null,
    username:   decoded.preferred_username ?? null,
    role:       decoded.salon_role  ?? null,
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

    req.user        = mapClaims(decoded);
    req.userTenantId = req.user.role === 'platform_admin' ? null : (req.user.tenantId ?? null);
    next();
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
    req.user        = mapClaims(decoded);
    req.userTenantId = req.user.role === 'platform_admin' ? null : (req.user.tenantId ?? null);
    next();
  });
};

// ─── requireRole ──────────────────────────────────────────────────────────────
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated.' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
  }
  next();
};

module.exports = { verifyToken, optionalVerifyToken, requireRole, PERMISSIONS };
