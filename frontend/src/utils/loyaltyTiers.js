/** Shared loyalty tier thresholds — keep Customers + Loyalty + Offer SMS in sync. */
export const LOYALTY_TIERS = [
  { name: 'Entry',    min: 0,    max: 49,   color: '#64748B', bg: '#F1F5F9', gradient: 'linear-gradient(135deg, #334155 0%, #64748B 100%)', range: '0–49 pts' },
  { name: 'Bronze',   min: 50,   max: 499,  color: '#CD7F32', bg: '#FDF6EC', gradient: 'linear-gradient(135deg, #92400E 0%, #CD7F32 100%)', range: '50+ pts' },
  { name: 'Silver',   min: 500,  max: 1499, color: '#94A3B8', bg: '#F8FAFC', gradient: 'linear-gradient(135deg, #475569 0%, #94A3B8 100%)', range: '500+ pts' },
  { name: 'Gold',     min: 1500, max: 4999, color: '#D97706', bg: '#FFFBEB', gradient: 'linear-gradient(135deg, #92400E 0%, #F59E0B 100%)', range: '1500+ pts' },
  { name: 'Platinum', min: 5000, max: null, color: '#7C3AED', bg: '#FAF5FF', gradient: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 100%)', range: '5000+ pts' },
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
  const counts = Object.fromEntries(LOYALTY_TIERS.map((t) => [t.name, 0]));
  customers.forEach((c) => {
    counts[getTier(c.loyalty_points || 0).name]++;
  });
  return counts;
}
