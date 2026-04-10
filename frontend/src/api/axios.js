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
  const isAuthRoute = path === '/login' || path === '/platform/login';
  const tenantSlug = getTenantSlug();

  config.headers = config.headers || {};
  const customHost = getCustomHostname();
  if (!isPlatformRoute && !isAuthRoute && tenantSlug) {
    config.headers['X-Tenant-Slug'] = tenantSlug;
    delete config.headers['X-Tenant-Host'];
  } else if (!isPlatformRoute && !isAuthRoute && customHost) {
    config.headers['X-Tenant-Host'] = customHost;
    delete config.headers['X-Tenant-Slug'];
  } else {
    delete config.headers['X-Tenant-Slug'];
    delete config.headers['X-Tenant-Host'];
  }
  return config;
});

// Redirect to /login on 401 Unauthorized (but not when already on /login,
// which would cause an infinite reload loop during the initial auth check)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const path = window.location.pathname || '/';
    const isLoginPath = path === '/login' || path === '/platform/login';
    if (
      error.response?.status === 401 &&
      !isLoginPath
    ) {
      localStorage.removeItem('zanesalon_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
