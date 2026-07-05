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

/** Active sold package — show in payment / walk-in lists (sessions validated at redeem). */
export function packageIsSelectableForPayment(cp) {
  return !!(cp && cp.status === 'active');
}

/** Package can be redeemed right now (has sessions + services). */
export function packageCanRedeemNow(cp) {
  if (!packageIsSelectableForPayment(cp)) return false;
  const total = Number(cp.sessions_total ?? 0);
  const used = Number(cp.sessions_used || 0);
  if (total > 0 && used >= total) return false;
  return packageIsRedeemable(cp?.package);
}

/** Customer-owned package template has services for redemption. */
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

export function filterSelectableCustomerPackages(list = []) {
  return list.filter((cp) => packageIsSelectableForPayment(cp));
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
  const bundlePrice = getPackageBundlePrice(cp);
  const pricePart = bundlePrice > 0 ? `Rs. ${bundlePrice.toLocaleString()} · ` : '';
  const total = cp.sessions_total;
  const used = cp.sessions_used || 0;
  const remaining = cp.sessions_remaining != null
    ? cp.sessions_remaining
    : (!total || Number(total) === 0 ? null : Math.max(0, Number(total) - Number(used)));
  const sessions = remaining == null ? 'Unlimited' : `${remaining} left`;
  const disc = packageDiscountLabel(cp.package);
  return `${name} — ${pricePart}${sessions}${disc}`;
};

export function calcServiceListTotal(serviceIds = [], allServices = []) {
  return serviceIds.map(Number).filter(Boolean).reduce((sum, sid) => {
    const s = allServices.find((x) => Number(x.id) === Number(sid));
    return sum + Number(s?.price || 0);
  }, 0);
}

export function getPackageBundlePrice(pkgOrCustomerPackage) {
  const pkg = pkgOrCustomerPackage?.package || pkgOrCustomerPackage;
  const fromPkg = Number(pkg?.package_price || 0);
  if (fromPkg > 0) return fromPkg;
  return Number(pkgOrCustomerPackage?.amount_paid || 0);
}

/** User-facing copy when a package covers the visit. */
export function formatPackageAppliedMessage(bundlePrice) {
  const price = Number(bundlePrice || 0);
  if (price > 0) {
    return `Package applied — final amount Rs. ${price.toLocaleString()} (bundle price)`;
  }
  return 'Package applied — bundle price';
}

/** Primary bill line when package is selected — bundle price, not service list total. */
export function formatPackageBillAmount(bundlePrice) {
  const price = Number(bundlePrice || 0);
  return price > 0 ? `Rs. ${price.toLocaleString()}` : 'Rs. 0';
}

export const servicesCoveredByPackage = (serviceIds = [], customerPackage) => {
  const allowed = new Set((customerPackage?.package?.services || []).map(Number));
  const ids = serviceIds.map(Number).filter(Boolean);
  if (!ids.length || !allowed.size) return false;
  return ids.every((id) => allowed.has(id));
};

export const packageCoversAllServices = servicesCoveredByPackage;

/** Service ids on an appointment row (API may attach service_ids). */
export function appointmentServiceIds(appointment) {
  if (Array.isArray(appointment?.service_ids) && appointment.service_ids.length) {
    return appointment.service_ids.map(Number).filter(Boolean);
  }
  const primary = Number(appointment?.service_id || appointment?.service?.id || 0);
  return primary ? [primary] : [];
}

/** Resolve final bill amount: bundle when package, else list total or stored value. */
export function resolvePackageBillSummary({
  usesPackage = false,
  bundlePrice = 0,
  listTotal = 0,
  storedAmount = null,
} = {}) {
  const bundle = Number(bundlePrice || 0);
  const list = Number(listTotal || 0);
  if (usesPackage) {
    const hasStored = storedAmount !== null && storedAmount !== undefined && storedAmount !== '';
    const finalAmount = hasStored ? Number(storedAmount) : bundle;
    return {
      isPackage: true,
      finalAmount,
      primary: formatPackageBillAmount(finalAmount),
      listTotal: list > 0 && list !== finalAmount ? list : null,
    };
  }
  const hasStored = storedAmount !== null && storedAmount !== undefined && storedAmount !== '';
  const finalAmount = hasStored ? Number(storedAmount) : list;
  return {
    isPackage: false,
    finalAmount,
    primary: `Rs. ${finalAmount.toLocaleString()}`,
    listTotal: null,
  };
}

/** Service ids on a walk-in queue row. */
export function walkInServiceIds(entry) {
  const wiq = entry?.queueServices || entry?.walkInServices;
  if (Array.isArray(wiq) && wiq.length) {
    return [...wiq]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((r) => Number(r.service_id))
      .filter(Boolean);
  }
  const primary = Number(entry?.service_id || entry?.service?.id || 0);
  return primary ? [primary] : [];
}

/** Amount display for walk-in queue cards and token modal. */
export function resolveWalkInAmountDisplay(entry, { services = [], customerPackages = [] } = {}) {
  const pkgSel = parsePackageSelection(entry?.note || '');
  const serviceIds = walkInServiceIds(entry);
  const listTotal = calcServiceListTotal(serviceIds, services);
  if (pkgSel.id) {
    const cp = customerPackages.find((p) => String(p.id) === String(pkgSel.id));
    return {
      ...resolvePackageBillSummary({
        usesPackage: true,
        bundlePrice: getPackageBundlePrice(cp),
        listTotal,
        storedAmount: entry?.total_amount,
      }),
      label: cp?.package?.name || pkgSel.label || 'Package',
    };
  }
  return {
    ...resolvePackageBillSummary({
      usesPackage: false,
      listTotal,
      storedAmount: entry?.total_amount,
    }),
    label: null,
  };
}

/** Amount column / detail for appointments — bundle price when package, not list fallback on 0. */
export function resolveAppointmentAmountDisplay(appointment, { services = [], customerPackages = [] } = {}) {
  const pkgSel = parsePackageSelection(appointment?.notes || '');
  const serviceIds = appointmentServiceIds(appointment);
  const listTotal = calcServiceListTotal(serviceIds, services);

  if (pkgSel.id) {
    const cp = customerPackages.find((p) => String(p.id) === String(pkgSel.id));
    const bill = resolvePackageBillSummary({
      usesPackage: true,
      bundlePrice: getPackageBundlePrice(cp),
      listTotal,
      storedAmount: appointment?.amount,
    });
    return {
      isPackage: true,
      primary: bill.primary,
      listTotal: bill.listTotal,
      dueToday: bill.finalAmount,
      label: cp?.package?.name || pkgSel.label || 'Package',
    };
  }

  const bill = resolvePackageBillSummary({
    usesPackage: false,
    listTotal,
    storedAmount: appointment?.amount ?? appointment?.service?.price,
  });
  return {
    isPackage: false,
    primary: bill.primary,
    listTotal: null,
    dueToday: bill.finalAmount,
    label: null,
  };
}

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

export async function fetchCustomerPackagesForPayment(api, customerId) {
  if (!customerId || !api) return [];
  try {
    const r = await api.get(`/packages/customer/${customerId}`);
    const list = Array.isArray(r.data) ? r.data : [];
    return list.filter((cp) => packageIsSelectableForPayment(cp));
  } catch {
    try {
      const r = await api.get(`/packages/customer/${customerId}/active`);
      const list = Array.isArray(r.data) ? r.data : [];
      return list.filter((cp) => packageIsSelectableForPayment(cp));
    } catch {
      return [];
    }
  }
}

export async function fetchActiveCustomerPackages(api, customerId) {
  return fetchCustomerPackagesForPayment(api, customerId);
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
  const bundle = getPackageBundlePrice(cp);
  onAmount?.(bundle > 0 ? String(bundle) : '0');
}
