/**
 * Staff commission for a payment — priority when service_wise_commission is on:
 * 1) staff_specializations custom rate (commission_value set on the link)
 * 2) services.commission_* on the catalogue row
 * 3) staff default rate
 */

const SOURCE_LABELS = {
  staff_override: 'Staff custom rate',
  service_catalog: 'Service catalogue rate',
  staff_default: 'Staff default rate',
};

function catalogueRate(lineId, serviceCommissions, defaultType) {
  const svc = serviceCommissions?.[lineId];
  const catalogueVal = svc?.commission_value != null && svc?.commission_value !== ''
    ? parseFloat(svc.commission_value)
    : null;
  if (catalogueVal != null && catalogueVal > 0) {
    return {
      type: svc.commission_type || defaultType,
      val: catalogueVal,
      source: 'service_catalog',
    };
  }
  return null;
}

function resolveLineCommission(lineId, {
  allowServiceOverrides,
  specByService,
  serviceCommissions,
  defaultType,
  defaultVal,
}) {
  if (!allowServiceOverrides) {
    return { type: defaultType, val: defaultVal, source: 'staff_default' };
  }

  const spec = specByService.get(lineId);
  if (spec?.commission_value != null && spec.commission_value !== '') {
    return {
      type: spec.commission_type || defaultType,
      val: parseFloat(spec.commission_value),
      source: 'staff_override',
    };
  }

  const fromCatalogue = catalogueRate(lineId, serviceCommissions, defaultType);
  if (fromCatalogue) return fromCatalogue;

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
  /**
   * When > 0, each service line is gated on its own net share (lineBase):
   * lineBase ≤ min → Rs. 0 for that line; lineBase ≥ min+1 → normal rates.
   * So 500 + 1000 only earns commission on the 1000 line.
   * Payments with no service lines still gate on the whole bill netTotal.
   */
  minCommissionableAmount = 0,
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
  const minAmt = Math.max(0, parseFloat(minCommissionableAmount) || 0);
  const belowMin = (amount) => minAmt > 0 && amount <= minAmt;

  const specByService = new Map(
    (specializations || []).map((s) => [Number(s.service_id), s]),
  );

  const ids = (serviceIds || []).map(Number).filter((id) => id > 0);
  const breakdownLines = [];

  if (!ids.length) {
    const billBelowMin = belowMin(netTotal);
    const lineCommission = billBelowMin
      ? 0
      : (defaultType === 'percentage' ? (netTotal * defaultVal) / 100 : defaultVal);
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
      skippedUnderMin: billBelowMin || undefined,
    });
    const total = Math.round(lineCommission * 100) / 100;
    return {
      amount: total,
      breakdown: {
        netTotal: Math.round(netTotal * 100) / 100,
        paidAmount: Math.round(paid * 100) / 100,
        loyaltyDiscount: parseFloat(loyalty_discount || 0),
        promoDiscount: parseFloat(promo_discount || 0),
        minCommissionableAmount: minAmt || undefined,
        skippedUnderMin: billBelowMin || undefined,
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
    const lineBelowMin = belowMin(lineBase);
    const lineCommission = lineBelowMin
      ? 0
      : (resolved.type === 'percentage'
        ? (lineBase * resolved.val) / 100
        : resolved.val);
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
      skippedUnderMin: lineBelowMin || undefined,
    });
  }

  const total = Math.round(commission * 100) / 100;
  const allSkipped = breakdownLines.length > 0 && breakdownLines.every((l) => l.skippedUnderMin);
  return {
    amount: total,
    breakdown: {
      netTotal: Math.round(netTotal * 100) / 100,
      paidAmount: Math.round(paid * 100) / 100,
      loyaltyDiscount: parseFloat(loyalty_discount || 0),
      promoDiscount: parseFloat(promo_discount || 0),
      minCommissionableAmount: minAmt || undefined,
      skippedUnderMin: allSkipped || undefined,
      lines: breakdownLines,
      total,
    },
  };
}

function calculatePaymentCommission(input) {
  return computeCommissionDetails(input).amount;
}

/**
 * Commission split when each service line has its own staff (multi-booking).
 * Returns null when a single staff covers all lines — caller uses computeCommissionDetails.
 */
function computeMultiStaffCommissionDetails({
  staffById = new Map(),
  serviceAssignments = [],
  fallbackStaffId = null,
  serviceIds = [],
  servicePrices = {},
  serviceCommissions = {},
  serviceNames = {},
  total_amount = 0,
  subtotal = 0,
  loyalty_discount = 0,
  promo_discount = 0,
  allowServiceOverrides = true,
  minCommissionableAmount = 0,
}) {
  const assignMap = new Map(
    (serviceAssignments || []).map((a) => [Number(a.service_id), Number(a.staff_id)]),
  );
  const ids = (serviceIds || []).map(Number).filter((id) => id > 0);
  if (!ids.length) return null;

  const groups = new Map();
  for (const svcId of ids) {
    const fromLine = assignMap.get(svcId);
    const staffId = (Number.isInteger(fromLine) && fromLine > 0)
      ? fromLine
      : (Number(fallbackStaffId) > 0 ? Number(fallbackStaffId) : null);
    if (!staffId) continue;
    if (!groups.has(staffId)) groups.set(staffId, []);
    groups.get(staffId).push(svcId);
  }

  if (groups.size <= 1) return null;

  const fullGross = ids.reduce((sum, id) => sum + (parseFloat(servicePrices[id]) || 0), 0);
  const shareRatio = (partGross) => (fullGross > 0 ? partGross / fullGross : 1 / groups.size);

  const paid = parseFloat(total_amount || 0);
  const gross = parseFloat(subtotal || 0) || fullGross;
  const netTotal = gross > paid
    ? paid
    : Math.max(0, paid - parseFloat(loyalty_discount || 0) - parseFloat(promo_discount || 0));

  const perStaff = [];
  const allLines = [];
  let totalCommission = 0;

  for (const [staffId, svcIds] of groups) {
    const staffMember = staffById.get(staffId);
    if (!staffMember || staffMember.salary_type === 'salary_only') continue;

    const groupGross = svcIds.reduce((sum, id) => sum + (parseFloat(servicePrices[id]) || 0), 0);
    const r = shareRatio(groupGross);

    const computed = computeCommissionDetails({
      staff: staffMember,
      specializations: staffMember.specializations || [],
      serviceIds: svcIds,
      servicePrices,
      serviceCommissions,
      serviceNames,
      total_amount: paid * r,
      subtotal: gross * r,
      loyalty_discount: parseFloat(loyalty_discount || 0) * r,
      promo_discount: parseFloat(promo_discount || 0) * r,
      allowServiceOverrides,
      minCommissionableAmount,
    });

    const rounded = Math.round(computed.amount * 100) / 100;
    totalCommission += rounded;
    perStaff.push({
      staff_id: staffId,
      staff_name: staffMember.name || null,
      amount: rounded,
      breakdown: computed.breakdown,
      serviceAmount: Math.round(netTotal * r * 100) / 100,
      service_ids: svcIds,
    });
    for (const line of computed.breakdown.lines || []) {
      allLines.push({
        ...line,
        staffId,
        staffName: staffMember.name || null,
      });
    }
  }

  const total = Math.round(totalCommission * 100) / 100;
  return {
    amount: total,
    perStaff,
    breakdown: {
      multiStaff: true,
      perStaff,
      lines: allLines,
      total,
      netTotal: Math.round(netTotal * 100) / 100,
      paidAmount: Math.round(paid * 100) / 100,
      loyaltyDiscount: parseFloat(loyalty_discount || 0),
      promoDiscount: parseFloat(promo_discount || 0),
      minCommissionableAmount: minCommissionableAmount > 0 ? minCommissionableAmount : undefined,
    },
  };
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
  computeMultiStaffCommissionDetails,
  normalizeStaffSpecializations,
  SOURCE_LABELS,
};
