import Keycloak from 'keycloak-js';

/**
 * Module-level Keycloak singleton.
 * Imported by AuthContext (to init/login/logout) and by axios (to read the token).
 * Only constructed when VITE_USE_KEYCLOAK=true so legacy mode is unaffected.
 */
const keycloak = new Keycloak({
  url:      import.meta.env.VITE_KEYCLOAK_URL,
  realm:    'salon-saas',
  clientId: 'salon-frontend',
});

export default keycloak;
