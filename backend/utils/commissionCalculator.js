/**
 * Staff commission for a payment — per-service rates from staff_specializations,
 * falling back to staff.commission_type / commission_value.
 */
function calculatePaymentCommission({
  staff,
  specializations = [],
  serviceIds = [],
  servicePrices = {},
  total_amount = 0,
  subtotal = 0,
  loyalty_discount = 0,
  promo_discount = 0,
}) {
  if (!staff || staff.salary_type === 'salary_only') return 0;

  const paid = parseFloat(total_amount || 0);
  const gross = parseFloat(subtotal || 0);
  // Splits are usually net after discounts; when subtotal > paid, do not subtract discounts again.
  const netTotal = gross > paid
    ? paid
    : Math.max(0, paid - parseFloat(loyalty_discount || 0) - parseFloat(promo_discount || 0));
  const defaultType = staff.commission_type || 'percentage';
  const defaultVal = parseFloat(staff.commission_value) || 0;

  const specByService = new Map(
    (specializations || []).map((s) => [Number(s.service_id), s]),
  );

  const ids = (serviceIds || []).map(Number).filter((id) => id > 0);
  if (!ids.length) {
    return defaultType === 'percentage' ? (netTotal * defaultVal) / 100 : defaultVal;
  }

  const lines = ids.map((id) => ({
    id,
    price: parseFloat(servicePrices[id]) || 0,
  }));
  const grossSum = lines.reduce((sum, l) => sum + l.price, 0);

  let commission = 0;
  for (const line of lines) {
    const spec = specByService.get(line.id);
    const type = spec?.commission_type || defaultType;
    const val = spec?.commission_value != null && spec?.commission_value !== ''
      ? parseFloat(spec.commission_value)
      : defaultVal;
    const lineBase = grossSum > 0 ? (line.price / grossSum) * netTotal : netTotal / lines.length;
    commission += type === 'percentage' ? (lineBase * val) / 100 : val;
  }

  return Math.round(commission * 100) / 100;
}

function normalizeStaffSpecializations(raw, staffDefaults = {}) {
  if (!Array.isArray(raw)) return [];
  const defaultType = staffDefaults.commission_type || 'percentage';
  const defaultVal = staffDefaults.commission_value != null && staffDefaults.commission_value !== ''
    ? parseFloat(staffDefaults.commission_value)
    : null;

  return raw
    .map((item) => {
      if (item == null) return null;
      if (typeof item === 'number' || typeof item === 'string') {
        const service_id = Number(item);
        if (!service_id) return null;
        return {
          service_id,
          commission_type: defaultType,
          commission_value: defaultVal,
        };
      }
      const service_id = Number(item.service_id);
      if (!service_id) return null;
      return {
        service_id,
        commission_type: item.commission_type || defaultType,
        commission_value: item.commission_value != null && item.commission_value !== ''
          ? parseFloat(item.commission_value)
          : defaultVal,
      };
    })
    .filter(Boolean);
}

module.exports = { calculatePaymentCommission, normalizeStaffSpecializations };
