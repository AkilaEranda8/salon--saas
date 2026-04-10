const { getMaintenanceMode } = require('../services/systemSettings');

const EXEMPT_PREFIXES = [
  '/api/public',
  '/api/auth',
  '/api/health',
  '/api/platform',
  '/api/onboarding',
  '/api/billing/webhook',
];

function isExemptPath(path = '') {
  return EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

async function enforceMaintenanceMode(req, res, next) {
  try {
    if (isExemptPath(req.originalUrl || req.url || '')) return next();

    const mode = await getMaintenanceMode();
    if (!mode.enabled) return next();

    if (req.user?.role === 'platform_admin') return next();

    return res.status(503).json({
      message: mode.message || 'System is under maintenance. Please try again later.',
      maintenance: {
        enabled: true,
        endsAt: mode.endsAt || null,
      },
    });
  } catch (_err) {
    return next();
  }
}

module.exports = { enforceMaintenanceMode };
