/**
 * Staff commission for a payment — priority when service_wise_commission is on:
 * 1) staff_specializations custom rate (commission_value set on the link)
 * 2) staff default — when the staff is linked to the service but has no custom rate
 * 3) services.commission_* on the catalogue row — only when staff is not linked to that service
 * 4) staff default — fallback when no link and no catalogue rate
 */

const SOURCE_LABELS = {
  staff_override: 'Staff custom rate',
  service_catalog: 'Service catalogue rate',
  staff_default: 'Staff default rate',
};

function resolveLineCommission(lineId, {
  allowServiceOverrides,
  specByService,
  serviceCommissions,
  defaultType,
  defaultVal,
}) {
  if (allowServiceOverrides) {
    const spec = specByService.get(lineId);
    if (spec) {
      if (spec.commission_value != null && spec.commission_value !== '') {
        return {
          type: spec.commission_type || defaultType,
          val: parseFloat(spec.commission_value),
          source: 'staff_override',
        };
      }
      // Linked to this service with no custom rate → staff default only (skip catalogue).
      return { type: defaultType, val: defaultVal, source: 'staff_default' };
    }
    const svc = serviceCommissions?.[lineId];
    if (svc?.commission_value != null && svc?.commission_value !== '') {
      return {
        type: svc.commission_type || defaultType,
        val: parseFloat(svc.commission_value),
        source: 'service_catalog',
      };
    }
  }
  return { type: defaultType, val: defaultVal, source: 'staff_default' };
}

function formatRate(type, val) {
  return type === 'percentage' ? `${val}%` : `Rs. ${Number(val).toLocaleString('en-LK')}`;
}

function computeCommissionDetails({
  staff,
  specializations = [],
  serviceIds = [],
  servicePrices = {},
  serviceCommissions = {},
  serviceNames = {},
  total_amount = 0,
  subtotal = 0,
  loyalty_discount = 0,
  promo_discount = 0,
  allowServiceOverrides = true,
}) {
  if (!staff || staff.salary_type === 'salary_only') {
    return { amount: 0, breakdown: { netTotal: 0, lines: [], total: 0 } };
  }

  const paid = parseFloat(total_amount || 0);
  const gross = parseFloat(subtotal || 0);
  const netTotal = gross > paid
    ? paid
    : Math.max(0, paid - parseFloat(loyalty_discount || 0) - parseFloat(promo_discount || 0));
  const defaultType = staff.commission_type || 'percentage';
  const defaultVal = parseFloat(staff.commission_value) || 0;

  const specByService = new Map(
    (specializations || []).map((s) => [Number(s.service_id), s]),
  );

  const ids = (serviceIds || []).map(Number).filter((id) => id > 0);
  const breakdownLines = [];

  if (!ids.length) {
    const lineCommission = defaultType === 'percentage'
      ? (netTotal * defaultVal) / 100
      : defaultVal;
    breakdownLines.push({
      serviceId: null,
      serviceName: 'Payment total',
      lineBase: Math.round(netTotal * 100) / 100,
      rateType: defaultType,
      rateValue: defaultVal,
      rateLabel: formatRate(defaultType, defaultVal),
      source: 'staff_default',
      sourceLabel: SOURCE_LABELS.staff_default,
      commission: Math.round(lineCommission * 100) / 100,
    });
    const total = Math.round(lineCommission * 100) / 100;
    return {
      amount: total,
      breakdown: {
        netTotal: Math.round(netTotal * 100) / 100,
        paidAmount: Math.round(paid * 100) / 100,
        loyaltyDiscount: parseFloat(loyalty_discount || 0),
        promoDiscount: parseFloat(promo_discount || 0),
        lines: breakdownLines,
        total,
      },
    };
  }

  const lines = ids.map((id) => ({
    id,
    price: parseFloat(servicePrices[id]) || 0,
  }));
  const grossSum = lines.reduce((sum, l) => sum + l.price, 0);

  let commission = 0;
  for (const line of lines) {
    const resolved = resolveLineCommission(line.id, {
      allowServiceOverrides,
      specByService,
      serviceCommissions,
      defaultType,
      defaultVal,
    });
    const lineBase = grossSum > 0 ? (line.price / grossSum) * netTotal : netTotal / lines.length;
    const lineCommission = resolved.type === 'percentage'
      ? (lineBase * resolved.val) / 100
      : resolved.val;
    const roundedLine = Math.round(lineCommission * 100) / 100;
    commission += lineCommission;
    breakdownLines.push({
      serviceId: line.id,
      serviceName: serviceNames[line.id] || `Service #${line.id}`,
      lineBase: Math.round(lineBase * 100) / 100,
      rateType: resolved.type,
      rateValue: resolved.val,
      rateLabel: formatRate(resolved.type, resolved.val),
      source: resolved.source,
      sourceLabel: SOURCE_LABELS[resolved.source] || resolved.source,
      commission: roundedLine,
    });
  }

  const total = Math.round(commission * 100) / 100;
  return {
    amount: total,
    breakdown: {
      netTotal: Math.round(netTotal * 100) / 100,
      paidAmount: Math.round(paid * 100) / 100,
      loyaltyDiscount: parseFloat(loyalty_discount || 0),
      promoDiscount: parseFloat(promo_discount || 0),
      lines: breakdownLines,
      total,
    },
  };
}

function calculatePaymentCommission(input) {
  return computeCommissionDetails(input).amount;
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

module.exports = {
  calculatePaymentCommission,
  computeCommissionDetails,
  normalizeStaffSpecializations,
  SOURCE_LABELS,
};
