import axios from 'axios';
import { getTenantSlug, getCustomHostname } from '../utils/tenant';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Resolve tenant context at request time so route changes are respected.
api.interceptors.request.use((config) => {
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
  return config;
});

// Redirect to /login on 401 Unauthorized (but not when already on /login,
// which would cause an infinite reload loop during the initial auth check).
// Redirect to /billing on 402 Payment Required (subscription expired/suspended).
// Dispatch 403 PLAN_LIMIT / FEATURE_GATED events for upgrade modal.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const path = window.location.pathname || '/';
    const isLoginPath = path === '/login' || path === '/platform/login';
    const status = error.response?.status;
    const code   = error.response?.data?.code;

    if (status === 401 && !isLoginPath) {
      localStorage.removeItem('zanesalon_user');
      window.location.href = '/login';
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
