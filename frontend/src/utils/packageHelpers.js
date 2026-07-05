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

export const formatCustomerPackageLabel = (cp) => {
  if (!cp) return 'Package';
  const name = cp.package?.name || 'Package';
  const sessions =
    cp.sessions_remaining == null
      ? 'Unlimited'
      : `${cp.sessions_remaining} left`;
  const price = cp.package?.package_price != null
    ? ` · Rs.${Number(cp.package.package_price).toLocaleString()}`
    : '';
  return `${name} — ${sessions}${price}`;
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

export async function fetchActiveCustomerPackages(api, customerId) {
  if (!customerId || !api) return [];
  try {
    const r = await api.get(`/packages/customer/${customerId}/active`);
    return Array.isArray(r.data) ? r.data : [];
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
