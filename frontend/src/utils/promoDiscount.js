/**
 * Promo discount amount from a catalog row (same rules as Payments page / mobile).
 * @param {object|null} d Discount row from GET /discounts/payment
 * @param {number} gross Subtotal before loyalty/promo
 */
export function computePromoFromDiscount(d, gross) {
  if (!d || gross <= 0) return 0;
  const g = gross;
  const minBill = Number(d.min_bill || 0);
  if (g < minBill) return 0;
  if (d.discount_type === 'fixed') {
    return Math.min(Number(d.value), g);
  }
  const pct = Math.min(100, Math.max(0, Number(d.value)));
  let off = (g * pct) / 100;
  if (d.max_discount_amount != null && d.max_discount_amount !== '') {
    off = Math.min(off, Number(d.max_discount_amount));
  }
  return Math.round(off * 100) / 100;
}
