const DEFAULT_BRAND_NAME = 'Salon V1';
const DEFAULT_LOGO_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="22" fill="#111827"/>
      <circle cx="48" cy="38" r="18" fill="#c9a96e"/>
      <path d="M22 76c7-10 17-15 26-15s19 5 26 15" fill="none" stroke="#c9a96e" stroke-width="7" stroke-linecap="round"/>
    </svg>
  `);

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

  return candidate || DEFAULT_LOGO_SVG;
}
