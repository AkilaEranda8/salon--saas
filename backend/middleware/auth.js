const jwt = require('jsonwebtoken');

// ─── Permissions map ──────────────────────────────────────────────────────────
const PERMISSIONS = {
  platform_admin: { del: true,  branches: true,  users: true,  all: true,  services: true,  staff: true  },
  superadmin:     { del: true,  branches: true,  users: true,  all: true,  services: true,  staff: true  },
  admin:          { del: true,  branches: true,  users: false, all: true,  services: true,  staff: true  },
  manager:        { del: true,  branches: false, users: false, all: false, services: false, staff: true  },
  staff:          { del: false, branches: false, users: false, all: false, services: false, staff: false },
};

// ─── verifyToken ──────────────────────────────────────────────────────────────
const verifyToken = (req, res, next) => {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null);

  if (!token) {
    return res.status(401).json({ message: 'No token provided. Access denied.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    req.userTenantId = decoded.role === 'platform_admin' ? null : (decoded.tenantId ?? null);
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
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

module.exports = { verifyToken, requireRole, PERMISSIONS };
