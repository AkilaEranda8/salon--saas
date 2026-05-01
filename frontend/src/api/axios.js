import axios from 'axios';
import { getTenantSlug, getCustomHostname } from '../utils/tenant';
import {
  getKcAccessToken,
  isKcTokenExpiring,
  refreshKcToken,
  clearKcTokens,
} from '../utils/kcTokenStore';

const USE_KEYCLOAK = import.meta.env.VITE_USE_KEYCLOAK === 'true';

// Paths that must NOT get an Authorization header (avoid refresh loop)
const KC_PUBLIC_PATHS = ['/auth/kc-login', '/auth/kc-refresh', '/auth/kc-logout'];

const api = axios.create({
  baseURL: '/api',
  withCredentials: !USE_KEYCLOAK, // cookies only needed in legacy mode
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor ───────────────────────────────────────────────────────
// 1. Attach X-Tenant-Slug / X-Tenant-Host headers (both modes)
// 2. In Keycloak mode: refresh token if expiring, then add Bearer header
api.interceptors.request.use(async (config) => {
  const path = window.location.pathname || '/';
  const isPlatformRoute = path.startsWith('/platform');
  const tenantSlug = getTenantSlug();

  config.headers = config.headers || {};

  const customHost = getCustomHostname();
  if (!isPlatformRoute && tenantSlug) {
    config.headers['X-Tenant-Slug'] = tenantSlug;
    delete config.headers['X-Tenant-Host'];
  } else if (!isPlatformRoute && customHost) {
    config.headers['X-Tenant-Host'] = customHost;
    delete config.headers['X-Tenant-Slug'];
  } else {
    delete config.headers['X-Tenant-Slug'];
    delete config.headers['X-Tenant-Host'];
  }

  if (USE_KEYCLOAK) {
    const isPublic = KC_PUBLIC_PATHS.some((p) => config.url?.includes(p));
    if (!isPublic) {
      try {
        let token = getKcAccessToken();
        if (token && isKcTokenExpiring()) {
          token = await refreshKcToken();
        }
        if (token) config.headers['Authorization'] = `Bearer ${token}`;
      } catch {
        // Let the request proceed; backend will return 401
      }
    }
  }

  return config;
});

// ── Response interceptor ──────────────────────────────────────────────────────
// Redirect to /login on 401 Unauthorized (but not when already on /login).
// Redirect to /billing on 402 Payment Required (subscription expired/suspended).
// Dispatch 403 PLAN_LIMIT / FEATURE_GATED events for upgrade modal.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const path = window.location.pathname || '/';
    const isLoginPath = path === '/login' || path === '/platform/login';
    const status = error.response?.status;
    const code   = error.response?.data?.code;

    if (status === 401 && !isLoginPath) {
      if (USE_KEYCLOAK) {
        clearKcTokens();
        window.location.href = path.startsWith('/platform') ? '/platform/login' : '/login';
      } else {
        localStorage.removeItem('zanesalon_user');
        window.location.href = '/login';
      }
    }

    // 402 — subscription expired or suspended → redirect to billing
    if (status === 402 && path !== '/billing' && !path.startsWith('/billing')) {
      const subCode = code || 'SUBSCRIPTION_ISSUE';
      window.location.href = `/billing?reason=${subCode}`;
      return new Promise(() => {}); // prevent further handling
    }

    // 403 with plan limit or feature gate → dispatch event for UpgradePlanModal
    if (status === 403 && (code?.startsWith('PLAN_LIMIT_') || code === 'FEATURE_GATED')) {
      window.dispatchEvent(new CustomEvent('plan-upgrade-needed', {
        detail: error.response.data,
      }));
    }

    return Promise.reject(error);
  }
);

export default api;
