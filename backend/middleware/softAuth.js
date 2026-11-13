/**
 * softAuth — verify the JWT when one is present, otherwise continue unauthenticated.
 *
 * Mounted before checkSubscription / enforceMaintenanceMode in server.js so that
 * req.user / req.userTenantId are populated and featureGate.enforceJwtTenantAuthority
 * can force the JWT tenant for non-platform users (instead of trusting X-Tenant-Slug).
 *
 * - No token  -> next() with no req.user (route-level verifyToken will reject with 401)
 * - Token     -> delegates to the real verifyToken (legacy HS256 or Keycloak RS256).
 *               Invalid/expired/revoked tokens are rejected here with the usual 401/403.
 * On success `req.authVerified = true` so the route-level verifyToken can skip
 * repeating the revocation / user DB lookups within the same request.
 */
const { verifyToken } = require('./auth');

const softAuth = (req, res, next) => {
  const keycloak = process.env.KEYCLOAK_AUTH_ENABLED === 'true';
  const hasBearer = !!req.headers.authorization?.startsWith('Bearer ');
  const hasCookie = !keycloak && !!req.cookies?.token;

  if (!hasBearer && !hasCookie) return next();

  return verifyToken(req, res, (err) => {
    if (err) return next(err);
    req.authVerified = true;
    return next();
  });
};

module.exports = { softAuth };
