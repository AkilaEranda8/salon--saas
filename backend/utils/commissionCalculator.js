/**
 * Staff commission for a payment — priority when service_wise_commission is on:
 * 1) staff_specializations override
 * 2) services.commission_* on the catalogue row
 * 3) staff default commission_type / commission_value
 */
function resolveLineCommission(lineId, {
  allowServiceOverrides,
  specByService,
  serviceCommissions,
  defaultType,
  defaultVal,
}) {
  if (allowServiceOverrides) {
    const spec = specByService.get(lineId);
    if (spec?.commission_value != null && spec?.commission_value !== '') {
      return {
        type: spec.commission_type || defaultType,
        val: parseFloat(spec.commission_value),
      };
    }
    const svc = serviceCommissions?.[lineId];
    if (svc?.commission_value != null && svc?.commission_value !== '') {
      return {
        type: svc.commission_type || defaultType,
        val: parseFloat(svc.commission_value),
      };
    }
  }
  return { type: defaultType, val: defaultVal };
}

function calculatePaymentCommission({
  staff,
  specializations = [],
  serviceIds = [],
  servicePrices = {},
  serviceCommissions = {},
  total_amount = 0,
  subtotal = 0,
  loyalty_discount = 0,
  promo_discount = 0,
  allowServiceOverrides = true,
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
    const { type, val } = resolveLineCommission(line.id, {
      allowServiceOverrides,
      specByService,
      serviceCommissions,
      defaultType,
      defaultVal,
    });
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
          commission_type: null,
          commission_value: null,
        };
      }
      const service_id = Number(item.service_id);
      if (!service_id) return null;
      const hasOverride = item.commission_value != null && item.commission_value !== '';
      return {
        service_id,
        commission_type: hasOverride ? (item.commission_type || defaultType) : null,
        commission_value: hasOverride ? parseFloat(item.commission_value) : null,
      };
    })
    .filter(Boolean);
}

module.exports = { calculatePaymentCommission, normalizeStaffSpecializations };
