/**
 * Tenant slug detection utility.
 *
 * The tenant slug is the subdomain of salon.hexalyte.com.
 * e.g. https://zane.salon.hexalyte.com  →  slug = "zane"
 *
 * For local development, the slug can be provided via:
 *   1. VITE_TENANT_SLUG env var  (e.g. VITE_TENANT_SLUG=zane npm run dev)
 *   2. ?tenant=xxx query param   (e.g. http://localhost:3006/?tenant=zane)
 */

const RESERVED_SLUGS = new Set([
  'www', 'api', 'pma', 'main', 'app', 'admin', 'platform', 'status',
]);

/**
 * Returns the tenant slug for the current page, or null if not in a tenant context
 * (e.g. marketing site, platform admin dashboard).
 */
export function getTenantSlug() {
  const pathname = window.location.pathname || '/';

  // Platform routes must not carry tenant slug headers.
  if (pathname.startsWith('/platform')) {
    return null;
  }

  // 1. Build/env var (for local dev or tests)
  if (import.meta.env.VITE_TENANT_SLUG) {
    return import.meta.env.VITE_TENANT_SLUG;
  }

  // 2. Query parameter fallback for local dev without subdomains
  const urlParam = new URLSearchParams(window.location.search).get('tenant');
  if (urlParam) return urlParam;

  // 3. SessionStorage — set during platform-admin impersonation so slug
  //    persists across React Router navigation within the impersonated tab.
  const storedSlug = sessionStorage.getItem('impersonation_tenant_slug');
  if (storedSlug) return storedSlug;

  // 4. Logged-in user payload fallback (local dev where URL has no tenant query/subdomain)
  try {
    const raw = localStorage.getItem('zanesalon_user');
    if (raw) {
      const user = JSON.parse(raw);
      const slugFromUser = user?.tenant?.slug;
      if (slugFromUser) return slugFromUser;
    }
  } catch {
    // Ignore malformed localStorage and continue with hostname detection.
  }

  // 5. Parse from hostname: expected format {slug}.salon.hexalyte.com
  return detectFromHostname(window.location.hostname);
}

/**
 * Returns whether the current page is a platform admin context.
 */
export function isPlatformContext() {
  const hostname = window.location.hostname;
  const pathname = window.location.pathname || '/';
  return hostname === 'admin.hexalyte.com' || pathname.startsWith('/platform');
}

function detectFromHostname(hostname) {
  const parts = hostname.split('.');

  // *.salon.hexalyte.com → 4 parts
  if (parts.length === 4 && parts[1] === 'salon' && parts[2] === 'hexalyte' && parts[3] === 'com') {
    const slug = parts[0];
    if (!RESERVED_SLUGS.has(slug)) return slug;
  }

  return null;
}

/**
 * Returns the hostname if it is a custom domain (not salon.hexalyte.com, not localhost).
 * Used to send X-Tenant-Host header when the user is on a custom domain.
 */
export function getCustomHostname() {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) return null;
  if (hostname.includes('hexalyte.com')) return null;
  return hostname;
}
