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
  const json = payment?.toJSON ? payment.toJSON() : payment;
  const breakdown = parseJsonField(json.commission_breakdown);
  const hc = parseJsonField(json.helper_commission);

  if (breakdown?.perStaff?.length) {
    return breakdown.perStaff
      .map((row) => ({
        staff_id: row.staff_id,
        staff_name: row.staff_name || null,
        amount: parseFloat(row.amount) || 0,
      }))
      .filter((row) => row.amount > 0);
  }

  const lines = [];
  const mainAmt = parseFloat(json.commission_amount) || 0;
  if (mainAmt > 0) {
    lines.push({
      staff_id: json.staff_id,
      staff_name: json.staff?.name || null,
      amount: mainAmt,
    });
  }
  for (const h of (hc?.helpers || breakdown?.helpers || [])) {
    const amt = parseFloat(h.commission_amount) || 0;
    if (amt > 0) {
      lines.push({
        staff_id: h.staff_id,
        staff_name: h.staff_name || null,
        amount: amt,
      });
    }
  }
  return lines;
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
};
