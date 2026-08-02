/**
 * Split main worker commission with optional helper staff.
 *
 * Rule (percentage OR fixed input — same result):
 *   Main staff rate creates the commission POOL.
 *   That pool is always split equally among (main + all helpers).
 *
 * Example: pool Rs. 1000, 1 helper → main Rs. 500, helper Rs. 500.
 * Client may send percentage_of_main or fixed; the API ignores those values
 * for the split and always uses equal shares.
 */

function parseHelpersInput(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!row) continue;
    const staffId = Number(row.staff_id ?? row.id);
    if (!Number.isInteger(staffId) || staffId <= 0 || seen.has(staffId)) continue;
    seen.add(staffId);
    const type = String(row.commission_type || 'percentage_of_main');
    const commission_type = type === 'fixed' ? 'fixed' : 'percentage_of_main';
    const commission_value = parseFloat(row.commission_value);
    out.push({
      staff_id: staffId,
      commission_type,
      // Keep client value for audit only — split math always uses equal share
      commission_value: Number.isFinite(commission_value) && commission_value > 0
        ? commission_value
        : null,
      staff_name: row.staff_name || null,
    });
  }
  return out;
}

/** Equal share of the pool for each person (main + helpers), as %. */
function equalHelperPercent(helperCount) {
  const n = Math.max(1, Number(helperCount) || 1);
  return Math.round((100 / (n + 1)) * 100) / 100;
}

function computeHelperCommissionSplit(grossMainAmount, helpersInput = []) {
  const grossMain = Math.round((parseFloat(grossMainAmount) || 0) * 100) / 100;
  const helpers = parseHelpersInput(helpersInput);
  if (!helpers.length || !(grossMain > 0)) {
    return {
      grossMain,
      helpersTotal: 0,
      mainNet: grossMain,
      helpers: [],
      error: null,
    };
  }

  const people = helpers.length + 1; // main + helpers
  const sharePct = equalHelperPercent(helpers.length);
  // Distribute cents fairly so amounts sum exactly to grossMain
  const baseCents = Math.floor((grossMain * 100) / people);
  let remainder = Math.round(grossMain * 100) - baseCents * people;
  const amounts = [];
  for (let i = 0; i < people; i += 1) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    amounts.push((baseCents + extra) / 100);
  }
  // amounts[0] = main, amounts[1..] = helpers (same equal share)
  const helperAmounts = amounts.slice(1);
  const mainNet = amounts[0];

  const lines = helpers.map((h, idx) => {
    const amount = helperAmounts[idx];
    return {
      staff_id: h.staff_id,
      staff_name: h.staff_name,
      commission_type: 'percentage_of_main',
      commission_value: sharePct,
      commission_amount: amount,
      rateLabel: `Equal share (${sharePct}% of commission)`,
      // Preserve what client sent (ignored for math)
      requested_type: h.commission_type,
      requested_value: h.commission_value,
    };
  });

  const helpersTotal = Math.round(lines.reduce((s, l) => s + l.commission_amount, 0) * 100) / 100;

  return {
    grossMain,
    helpersTotal,
    mainNet: Math.round(mainNet * 100) / 100,
    helpers: lines,
    error: null,
  };
}

function helperAmountForStaff(helperCommission, staffId) {
  const parsed = typeof helperCommission === 'string'
    ? (() => { try { return JSON.parse(helperCommission); } catch { return null; } })()
    : helperCommission;
  if (!parsed) return 0;
  const list = Array.isArray(parsed) ? parsed : parsed.helpers;
  if (!Array.isArray(list)) return 0;
  const sid = Number(staffId);
  return list
    .filter((h) => Number(h.staff_id) === sid)
    .reduce((s, h) => s + (parseFloat(h.commission_amount) || 0), 0);
}

module.exports = {
  parseHelpersInput,
  equalHelperPercent,
  computeHelperCommissionSplit,
  helperAmountForStaff,
};
