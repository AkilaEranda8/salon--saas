/**
 * auth.js — feature-flag facade
 *
 * Set KEYCLOAK_URL in .env to switch ALL protected routes to Keycloak JWT
 * validation (RS256 via JWKS).  Remove / unset the variable to fall back
 * to the original HS256 cookie-based JWT (legacyAuth).
 *
 * No other files need to change — every route already imports from here.
 */

const impl = process.env.KEYCLOAK_URL
  ? require('./keycloakAuth')
  : require('./legacyAuth');

module.exports = impl;
