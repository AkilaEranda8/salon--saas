'use strict';

const { Tenant } = require('../models');

const FORBIDDEN_SLUGS = new Set([
  'www', 'api', 'pma', 'main', 'app', 'admin', 'platform',
  'status', 'mail', 'smtp', 'ftp', 'vpn', 'dev', 'staging',
]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

function slugifyBase(input) {
  const raw = String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  const cleaned = raw.slice(0, 63).replace(/-+$/g, '');
  if (cleaned.length >= 3) return cleaned;
  return 'salon';
}

function isSlugAllowed(slug) {
  return SLUG_RE.test(slug) && !FORBIDDEN_SLUGS.has(slug);
}

async function findUniqueSlug(preferred, transaction) {
  const base = slugifyBase(preferred);

  // Try base first
  if (isSlugAllowed(base)) {
    const exists = await Tenant.findOne({ where: { slug: base }, transaction });
    if (!exists) return base;
  }

  // Then append numeric suffixes: base-2, base-3...
  for (let i = 2; i <= 9999; i++) {
    const suffix = `-${i}`;
    const candidate = `${base.slice(0, 63 - suffix.length)}${suffix}`;
    if (!isSlugAllowed(candidate)) continue;

    const exists = await Tenant.findOne({ where: { slug: candidate }, transaction });
    if (!exists) return candidate;
  }

  throw new Error('Could not allocate a unique slug.');
}

function buildTenantAppUrl(slug, req) {
  const template = String(process.env.FRONTEND_BASE_URL || '').trim();
  if (template && template.includes('{slug}')) {
    return template.replace('{slug}', slug);
  }

  const baseDomain = String(process.env.TENANT_BASE_DOMAIN || process.env.PUBLIC_BASE_DOMAIN || '').trim();
  if (baseDomain) {
    return `https://${slug}.${baseDomain.replace(/^https?:\/\//, '').replace(/^\.+/, '')}`;
  }

  const host = String(req?.get?.('host') || '').toLowerCase();
  if (host.includes('localhost') || host.startsWith('127.0.0.1')) {
    // Local dev typically routes via proxy at :8080
    return `http://localhost:8080`;
  }

  return `https://${slug}.hexalyte.com`;
}

module.exports = {
  FORBIDDEN_SLUGS,
  SLUG_RE,
  isSlugAllowed,
  slugifyBase,
  findUniqueSlug,
  buildTenantAppUrl,
};
