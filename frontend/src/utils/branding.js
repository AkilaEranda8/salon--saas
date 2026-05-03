const DEFAULT_BRAND_NAME = 'Hexa Salon';
const DEFAULT_LOGO_SVG = '/salon-logo.png';

export function normalizeBranding(input = {}) {
  const branding = input || {};

  return {
    name: branding.brand_name ?? branding.name ?? branding.business_name ?? DEFAULT_BRAND_NAME,
    logo: branding.logo ?? branding.logo_url ?? branding.logoUrl ?? branding.brand_logo ?? null,
    headerLogo: branding.logo_header_url ?? branding.headerLogo ?? branding.header_logo ?? null,
    sidebarLogo: branding.logo_sidebar_url ?? branding.sidebarLogo ?? branding.sidebar_logo ?? null,
    loginLogo: branding.logo_login_url ?? branding.loginLogo ?? branding.login_logo ?? null,
    publicLogo: branding.logo_public_url ?? branding.publicLogo ?? branding.public_logo ?? null,
    ...branding,
  };
}

export function resolveBrandName(branding, fallback = DEFAULT_BRAND_NAME) {
  if (!branding) return fallback;

  // Prefer brand_name (custom display name) over name (original business name)
  return (
    branding.brand_name ??
    branding.name ??
    branding.business_name ??
    branding.title ??
    fallback
  );
}

export function resolveBrandLogo(branding, variant = 'default') {
  const candidate =
    (variant === 'header'  ? (branding?.logo_header_url  ?? branding?.headerLogo  ?? branding?.header_logo)  : null) ??
    (variant === 'sidebar' ? (branding?.logo_sidebar_url ?? branding?.sidebarLogo ?? branding?.sidebar_logo) : null) ??
    (variant === 'login'   ? (branding?.logo_login_url   ?? branding?.loginLogo   ?? branding?.login_logo)   : null) ??
    (variant === 'public'  ? (branding?.logo_public_url  ?? branding?.publicLogo  ?? branding?.public_logo)  : null) ??
    branding?.logo ??
    branding?.logo_url ??
    branding?.logoUrl;

  return candidate || null;
}
