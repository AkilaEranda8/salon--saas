/** Shared package selection helpers for appointments, payments, and walk-in. */

export const PACKAGE_NOTE_PREFIX = 'Package:';

export const stripPackageLine = (notes = '') =>
  String(notes)
    .split('\n')
    .filter((line) => !/^\s*package\s*[:\-]?\s*/i.test(line))
    .join('\n')
    .trim();

export const parsePackageSelection = (notes = '') => {
  const line = String(notes).split('\n').find((l) => /^\s*package\s*[:\-]?\s*/i.test(l));
  if (!line) return { id: null, label: '' };
  const match = line.match(/#(\d+)/);
  return {
    id: match ? Number(match[1]) : null,
    label: line.replace(/^\s*package\s*[:\-]?\s*/i, '').trim(),
  };
};

export const buildPackageNoteLine = (customerPackageId, packageName = 'Package') =>
  `${PACKAGE_NOTE_PREFIX} #${customerPackageId} - ${packageName}`;

/** Resolve active service IDs from a customer package against the salon's service list. */
export const resolvePackageServiceIds = (customerPackage, allServices = []) => {
  const pkgServiceIds = (customerPackage?.package?.services || []).map(Number).filter(Boolean);
  if (!pkgServiceIds.length) return [];
  const activeIds = new Set(
    allServices.filter((s) => s.is_active !== false).map((s) => Number(s.id)),
  );
  return pkgServiceIds.filter((id) => activeIds.has(id));
};

/** True when bundle price is below list price. */
export function packageHasDiscount(pkg) {
  if (!pkg) return false;
  const original = Number(pkg.original_price || 0);
  const price = Number(pkg.package_price || 0);
  const discPct = Number(pkg.discount_percent || 0);
  if (discPct > 0) return true;
  return original > 0 && price < original;
}

/** Active package template with a bundle price and at least one service. */
export function packageIsBookable(pkg) {
  if (!pkg || pkg.is_active === false) return false;
  const price = Number(pkg.package_price || 0);
  if (!(price > 0)) return false;
  const svc = pkg.services || [];
  return Array.isArray(svc) && svc.length > 0;
}

/** Customer-owned package usable at payment / walk-in (already purchased). */
export function packageIsRedeemable(pkg) {
  if (!pkg) return false;
  const svc = pkg.services || [];
  return Array.isArray(svc) && svc.length > 0;
}

export function packageDiscountLabel(pkg) {
  if (!pkg || !packageHasDiscount(pkg)) return '';
  const pct = Number(pkg.discount_percent || 0);
  if (pct > 0) return ` · ${Math.round(pct)}% off`;
  const original = Number(pkg.original_price || 0);
  const price = Number(pkg.package_price || 0);
  if (original > price) return ` · Save Rs. ${Math.round(original - price).toLocaleString()}`;
  return '';
}

export function filterRedeemableCustomerPackages(list = []) {
  return list.filter((cp) => packageIsRedeemable(cp?.package));
}

export function filterBookablePackageTemplates(list = []) {
  return list.filter((p) => packageIsBookable(p));
}

/** @deprecated use filterBookablePackageTemplates */
export const filterDiscountedPackageTemplates = filterBookablePackageTemplates;

export function formatPackageTemplateLabel(pkg) {
  if (!pkg) return 'Package';
  const price = Number(pkg.package_price || 0);
  return `${pkg.name} — Rs. ${price.toLocaleString()}${packageDiscountLabel(pkg)}`;
}

export const formatCustomerPackageLabel = (cp) => {
  if (!cp) return 'Package';
  const name = cp.package?.name || 'Package';
  const total = cp.sessions_total;
  const used = cp.sessions_used || 0;
  const remaining = cp.sessions_remaining != null
    ? cp.sessions_remaining
    : (!total || Number(total) === 0 ? null : Math.max(0, Number(total) - Number(used)));
  const sessions = remaining == null ? 'Unlimited' : `${remaining} left`;
  const disc = packageDiscountLabel(cp.package);
  return `${name} — ${sessions}${disc}`;
};

export const servicesCoveredByPackage = (serviceIds = [], customerPackage) => {
  const allowed = new Set((customerPackage?.package?.services || []).map(Number));
  const ids = serviceIds.map(Number).filter(Boolean);
  if (!ids.length || !allowed.size) return false;
  return ids.every((id) => allowed.has(id));
};

export const packageCoversAllServices = servicesCoveredByPackage;

const normalizePhone = (p) => String(p || '').replace(/\D/g, '');

/** Resolve customer id from explicit id or phone search (appointments / walk-in / payment). */
export async function resolveCustomerId(api, { customerId, phone, branchId } = {}) {
  if (customerId) return Number(customerId);
  const q = String(phone || '').trim();
  if (!q || !api) return null;
  try {
    const params = { limit: 20, search: q };
    if (branchId) params.branchId = branchId;
    const r = await api.get('/customers', { params });
    const list = Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
    const needle = normalizePhone(q);
    if (!needle) return null;
    const match = list.find((c) => {
      const ph = normalizePhone(c.phone || c.phone_number || c.mobile || c.mobile_number);
      return ph && (ph === needle || ph.endsWith(needle) || needle.endsWith(ph));
    });
    return match?.id ? Number(match.id) : null;
  } catch {
    return null;
  }
}

export async function fetchBookablePackageTemplates(api, branchId) {
  if (!api) return [];
  try {
    const params = { activeOnly: true };
    if (branchId) params.branchId = branchId;
    const r = await api.get('/packages', { params });
    const list = Array.isArray(r.data) ? r.data : [];
    return filterBookablePackageTemplates(list);
  } catch {
    return [];
  }
}

/** @deprecated use fetchBookablePackageTemplates */
export const fetchDiscountedPackageTemplates = fetchBookablePackageTemplates;

export function findCustomerPackageForTemplate(customerPackages = [], templateId) {
  if (!templateId) return null;
  return customerPackages.find(
    (cp) => Number(cp.package_id || cp.package?.id) === Number(templateId),
  ) || null;
}

/** Reuse an active customer package or purchase the template for this customer. */
export async function ensureCustomerPackageForTemplate(api, { customerId, templateId, branchId } = {}) {
  if (!api || !customerId || !templateId) return null;
  const active = await fetchActiveCustomerPackages(api, customerId);
  const existing = findCustomerPackageForTemplate(active, templateId);
  if (existing) return existing;
  const r = await api.post('/packages/purchase', {
    customer_id: Number(customerId),
    package_id: Number(templateId),
    branch_id: branchId || undefined,
    payment_method: 'Cash',
  });
  return r.data || null;
}

/** Resolve service IDs from a package template or customer package row. */
export function resolveTemplateServiceIds(pkgOrCustomerPackage, allServices = []) {
  const pkg = pkgOrCustomerPackage?.package || pkgOrCustomerPackage;
  return resolvePackageServiceIds({ package: pkg }, allServices);
}

export async function fetchActiveCustomerPackages(api, customerId) {
  if (!customerId || !api) return [];
  try {
    const r = await api.get(`/packages/customer/${customerId}/active`);
    const list = Array.isArray(r.data) ? r.data : [];
    return filterRedeemableCustomerPackages(list);
  } catch {
    return [];
  }
}

/** Apply package selection to service ids and payment fields (shared by walk-in / appointments). */
export function applyPackageSelection({
  customerPackageId,
  customerPackages,
  allServices,
  onServices,
  onPackageId,
  onMethod,
  onAmount,
}) {
  if (!customerPackageId) {
    onPackageId?.('');
    onMethod?.('Cash');
    return;
  }
  const cp = customerPackages.find((p) => String(p.id) === String(customerPackageId));
  if (!cp) return;
  const nextIds = resolvePackageServiceIds(cp, allServices);
  if (!nextIds.length) return;
  onServices?.(nextIds);
  onPackageId?.(String(customerPackageId));
  onMethod?.('Package');
  onAmount?.('0');
}
