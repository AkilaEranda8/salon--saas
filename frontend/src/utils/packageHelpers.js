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
