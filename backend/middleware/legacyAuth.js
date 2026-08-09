const jwt    = require('jsonwebtoken');
const crypto = require('crypto');

// ─── Permissions map ──────────────────────────────────────────────────────────
const PERMISSIONS = {
  platform_admin: { del: true,  branches: true,  users: true,  all: true,  services: true,  staff: true  },
  superadmin:     { del: true,  branches: true,  users: true,  all: true,  services: true,  staff: true  },
  admin:          { del: true,  branches: true,  users: false, all: true,  services: true,  staff: true  },
  manager:        { del: true,  branches: false, users: false, all: false, services: true,  staff: true  },
  staff:          { del: false, branches: false, users: false, all: false, services: false, staff: false },
};

// ─── verifyToken ──────────────────────────────────────────────────────────────
const verifyToken = async (req, res, next) => {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null);

  if (!token) {
    return res.status(401).json({ message: 'No token provided. Access denied.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // ── Check revocation list ─────────────────────────────────────────────────
    try {
      const { RevokedToken } = require('../models');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const revoked = await RevokedToken.findByPk(hash);
      if (revoked) return res.status(401).json({ message: 'Session has been revoked. Please log in again.' });
    } catch (_) {
      // RevokedToken table may not exist yet — fail open to avoid lockout
    }

    // ── Bulk session revoke (per-user timestamp) ──────────────────────────────
    try {
      if (decoded?.id) {
        const { User } = require('../models');
        const row = await User.findByPk(decoded.id, {
          attributes: ['id', 'sessions_revoked_at', 'is_active'],
        });
        if (row && row.is_active === false) {
          return res.status(401).json({ message: 'Account is inactive.' });
        }
        if (row?.sessions_revoked_at && decoded.iat) {
          const revokedAtSec = Math.floor(new Date(row.sessions_revoked_at).getTime() / 1000);
          if (decoded.iat < revokedAtSec) {
            return res.status(401).json({ message: 'Session has been revoked. Please log in again.' });
          }
        }
      }
    } catch (_) {
      // Column may not exist yet — fail open
    }

    req.user = decoded;
    req.userTenantId = decoded.role === 'platform_admin' ? null : (decoded.tenantId ?? null);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired. Please log in again.' });
    }
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
};

// ─── optionalVerifyToken ──────────────────────────────────────────────────────
const optionalVerifyToken = (req, res, next) => {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null);

  if (!token) {
    return res.json({ user: null });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = decoded;
    req.userTenantId = decoded.role === 'platform_admin' ? null : (decoded.tenantId ?? null);
    return next();
  } catch (_err) {
    return res.json({ user: null });
  }
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

module.exports = { verifyToken, optionalVerifyToken, requireRole, PERMISSIONS };
