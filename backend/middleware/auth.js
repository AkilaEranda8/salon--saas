/**
 * auth.js — feature-flag facade
 *
 * KEYCLOAK_URL     — enables Keycloak Admin API sync (user/group creation).
 *                    Always set this when Keycloak is running.
 *
 * KEYCLOAK_AUTH_ENABLED=true — additionally switches JWT verification on ALL
 *                    protected routes from legacy HS256 cookies to Keycloak
 *                    RS256 tokens.  Only enable this after the frontend has
 *                    been switched to keycloak-js login.
 *
 * No other files need to change — every route already imports from here.
 */

const impl = process.env.KEYCLOAK_AUTH_ENABLED === 'true'
  ? require('./keycloakAuth')
  : require('./legacyAuth');

module.exports = impl;
