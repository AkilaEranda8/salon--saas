/**
 * Total commission on a payment (main + helpers, or multi-staff perStaff rows).
 */
function parseJsonField(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function helperCommissionTotal(helperCommission, breakdown) {
  const hc = parseJsonField(helperCommission);
  const bd = parseJsonField(breakdown);
  const helpers = hc?.helpers || bd?.helpers || [];
  return helpers.reduce((sum, h) => sum + (parseFloat(h.commission_amount) || 0), 0);
}

function paymentCommissionLines(payment) {
  return staffCommissionShares(payment).map((row) => ({
    staff_id: row.staff_id,
    staff_name: row.staff_name || null,
    amount: row.amount,
  }));
}

/**
 * Per-staff commission on one payment.
 * Multi-staff bookings store shares in commission_breakdown.perStaff — do not
 * give the header staff_id the combined commission_amount.
 */
function staffCommissionShares(payment) {
  const json = payment?.toJSON ? payment.toJSON() : payment;
  const breakdown = parseJsonField(json.commission_breakdown);
  const hc = parseJsonField(json.helper_commission);
  const shares = [];

  if (breakdown?.perStaff?.length) {
    for (const row of breakdown.perStaff) {
      const staffId = Number(row.staff_id);
      const amount = parseFloat(row.amount) || 0;
      if (!Number.isInteger(staffId) || staffId <= 0 || !(amount > 0)) continue;
      const ownLines = (breakdown.lines || []).filter(
        (l) => Number(l.staffId ?? l.staff_id) === staffId,
      );
      shares.push({
        staff_id: staffId,
        staff_name: row.staff_name || null,
        amount,
        revenue: parseFloat(row.serviceAmount) || 0,
        role: 'worker',
        breakdown: row.breakdown || {
          ...breakdown,
          perStaff: undefined,
          multiStaff: true,
          lines: ownLines.length ? ownLines : (row.breakdown?.lines || []),
          total: amount,
        },
      });
    }
    return shares;
  }

  const mainId = Number(json.staff_id);
  const mainAmt = parseFloat(json.commission_amount) || 0;
  if (Number.isInteger(mainId) && mainId > 0 && mainAmt > 0) {
    shares.push({
      staff_id: mainId,
      staff_name: json.staff?.name || null,
      amount: mainAmt,
      revenue: parseFloat(json.total_amount) || 0,
      role: 'worker',
      breakdown,
    });
  }

  for (const h of (hc?.helpers || breakdown?.helpers || [])) {
    const hid = Number(h.staff_id);
    const amt = parseFloat(h.commission_amount) || 0;
    if (!Number.isInteger(hid) || hid <= 0 || !(amt > 0)) continue;
    shares.push({
      staff_id: hid,
      staff_name: h.staff_name || null,
      amount: amt,
      revenue: 0,
      role: 'helper',
      helper: h,
    });
  }
  return shares;
}

function shareForStaff(payment, staffId) {
  const sid = Number(staffId);
  return staffCommissionShares(payment).find((s) => Number(s.staff_id) === sid) || null;
}

function paymentTotalCommission(payment) {
  const lines = paymentCommissionLines(payment);
  if (lines.length) {
    return Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
  }
  return parseFloat(payment?.commission_amount ?? payment?.toJSON?.()?.commission_amount) || 0;
}

function attachPaymentCommissionTotals(json) {
  const lines = paymentCommissionLines(json);
  const total = lines.length
    ? Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100
    : (parseFloat(json.commission_amount) || 0);
  return {
    ...json,
    total_commission_amount: total,
    commission_per_staff: lines,
  };
}

module.exports = {
  parseJsonField,
  helperCommissionTotal,
  paymentCommissionLines,
  paymentTotalCommission,
  attachPaymentCommissionTotals,
  staffCommissionShares,
  shareForStaff,
};
