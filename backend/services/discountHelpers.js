const { Op } = require('sequelize');

function computePromoAmount(discount, gross) {
  const g = Math.max(0, parseFloat(gross) || 0);
  const minBill = parseFloat(discount.min_bill || 0);
  if (g < minBill) return 0;
  if (discount.discount_type === 'fixed') {
    return Math.min(Math.max(0, parseFloat(discount.value)), g);
  }
  const pct = Math.min(100, Math.max(0, parseFloat(discount.value)));
  let off = (g * pct) / 100;
  if (discount.max_discount_amount != null && discount.max_discount_amount !== '') {
    off = Math.min(off, parseFloat(discount.max_discount_amount));
  }
  return Math.round(off * 100) / 100;
}

/** Date-only compare in local YYYY-MM-DD */
function isDiscountActive(discount, branchId, asOfDate = new Date()) {
  if (!discount || !discount.is_active) return false;
  if (discount.branch_id != null && Number(discount.branch_id) !== Number(branchId)) return false;
  const y = asOfDate.getFullYear();
  const m = String(asOfDate.getMonth() + 1).padStart(2, '0');
  const d = String(asOfDate.getDate()).padStart(2, '0');
  const today = `${y}-${m}-${d}`;
  if (discount.starts_at && String(discount.starts_at) > today) return false;
  if (discount.ends_at && String(discount.ends_at) < today) return false;
  return true;
}

function activeDiscountWhere(branchId) {
  const y = new Date().getFullYear();
  const m = String(new Date().getMonth() + 1).padStart(2, '0');
  const d = String(new Date().getDate()).padStart(2, '0');
  const today = `${y}-${m}-${d}`;
  return {
    is_active: true,
    [Op.or]: [{ branch_id: null }, { branch_id: Number(branchId) }],
    [Op.and]: [
      { [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: today } }] },
      { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gte]: today } }] },
    ],
  };
}

module.exports = { computePromoAmount, isDiscountActive, activeDiscountWhere };
