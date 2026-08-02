/**
 * Split main worker commission with optional helper staff.
 * Helper types:
 *  - percentage_of_main: % of the main commission POOL (not of the service total)
 *  - fixed: fixed Rs taken from the pool
 *
 * Example: main rate makes a Rs. 1000 pool; one helper at 50% → main Rs. 500, helper Rs. 500.
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
    if (!(commission_value > 0)) continue;
    out.push({
      staff_id: staffId,
      commission_type,
      commission_value,
      staff_name: row.staff_name || null,
    });
  }
  return out;
}

/** Equal share of the pool for each person (main + helpers), as helper %. */
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

  const lines = helpers.map((h) => {
    let amount = h.commission_type === 'fixed'
      ? h.commission_value
      : (grossMain * h.commission_value) / 100;
    amount = Math.round(amount * 100) / 100;
    return {
      staff_id: h.staff_id,
      staff_name: h.staff_name,
      commission_type: h.commission_type,
      commission_value: h.commission_value,
      commission_amount: amount,
      rateLabel: h.commission_type === 'fixed'
        ? `Rs. ${h.commission_value}`
        : `${h.commission_value}% of commission`,
    };
  });

  const helpersTotal = Math.round(lines.reduce((s, l) => s + l.commission_amount, 0) * 100) / 100;
  if (helpersTotal > grossMain + 0.001) {
    return {
      grossMain,
      helpersTotal,
      mainNet: 0,
      helpers: lines,
      error: `Helper commission (Rs. ${helpersTotal.toFixed(2)}) exceeds main commission pool (Rs. ${grossMain.toFixed(2)}).`,
    };
  }

  return {
    grossMain,
    helpersTotal,
    mainNet: Math.round((grossMain - helpersTotal) * 100) / 100,
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
