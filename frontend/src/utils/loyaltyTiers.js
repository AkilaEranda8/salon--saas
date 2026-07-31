/** Shared loyalty tier thresholds — keep Customers + Loyalty pages in sync. */
export const LOYALTY_TIERS = [
  { name: 'Bronze',   min: 0,    color: '#CD7F32', bg: '#FDF6EC', gradient: 'linear-gradient(135deg, #92400E 0%, #CD7F32 100%)' },
  { name: 'Silver',   min: 500,  color: '#94A3B8', bg: '#F8FAFC', gradient: 'linear-gradient(135deg, #475569 0%, #94A3B8 100%)' },
  { name: 'Gold',     min: 1500, color: '#D97706', bg: '#FFFBEB', gradient: 'linear-gradient(135deg, #92400E 0%, #F59E0B 100%)' },
  { name: 'Platinum', min: 5000, color: '#7C3AED', bg: '#FAF5FF', gradient: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 100%)' },
];

export function getTier(pts = 0) {
  const points = Number(pts) || 0;
  return [...LOYALTY_TIERS].reverse().find((t) => points >= t.min) || LOYALTY_TIERS[0];
}

/** Next tier for progress UI, or null when already Platinum. */
export function getNextTier(pts = 0) {
  const current = getTier(pts);
  const idx = LOYALTY_TIERS.findIndex((t) => t.name === current.name);
  return idx >= 0 && idx < LOYALTY_TIERS.length - 1 ? LOYALTY_TIERS[idx + 1] : null;
}

export function loyaltyTierCounts(customers = []) {
  const counts = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 };
  customers.forEach((c) => {
    counts[getTier(c.loyalty_points || 0).name]++;
  });
  return counts;
}
