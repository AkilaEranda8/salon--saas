/**
 * Tenant slug detection utility.
 *
 * The tenant slug is the subdomain of zanesalon.com.
 * e.g. https://zane.zanesalon.com  →  slug = "zane"
 *
 * For local development, the slug can be provided via:
 *   1. VITE_TENANT_SLUG env var  (e.g. VITE_TENANT_SLUG=zane npm run dev)
 *   2. ?tenant=xxx query param   (e.g. http://localhost:5173/?tenant=zane)
 */

const RESERVED_SLUGS = new Set([
  'www', 'api', 'pma', 'main', 'app', 'admin', 'platform', 'status',
]);

/**
 * Returns the tenant slug for the current page, or null if not in a tenant context
 * (e.g. marketing site, platform admin dashboard).
 */
export function getTenantSlug() {
  // 1. Build/env var (for local dev or tests)
  if (import.meta.env.VITE_TENANT_SLUG) {
    return import.meta.env.VITE_TENANT_SLUG;
  }

  // 2. Query parameter fallback for local dev without subdomains
  const urlParam = new URLSearchParams(window.location.search).get('tenant');
  if (urlParam) return urlParam;

  // 3. Parse from hostname: expected format {slug}.zanesalon.com
  return detectFromHostname(window.location.hostname);
}

/**
 * Returns whether the current page is a platform admin context.
 */
export function isPlatformContext() {
  const hostname = window.location.hostname;
  return hostname === 'platform.zanesalon.com' || hostname === 'localhost';
}

function detectFromHostname(hostname) {
  const parts = hostname.split('.');

  // *.zanesalon.com → 3 parts
  if (parts.length === 3 && parts[1] === 'zanesalon' && parts[2] === 'com') {
    const slug = parts[0];
    if (!RESERVED_SLUGS.has(slug)) return slug;
  }

  return null;
}
