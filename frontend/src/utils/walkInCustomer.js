/** Shared system guest used when no named customer is selected. */
export const WALK_IN_CUSTOMER_NAME = 'Walk-in Customer';

export function isWalkInCustomer(c) {
  return String(c?.name || '').trim().toLowerCase() === WALK_IN_CUSTOMER_NAME.toLowerCase();
}

/** Keep Walk-in Customer at the top of picker lists. */
export function pinWalkInFirst(list = []) {
  if (!Array.isArray(list) || list.length < 2) return list;
  const walkIns = [];
  const rest = [];
  for (const c of list) {
    if (isWalkInCustomer(c)) walkIns.push(c);
    else rest.push(c);
  }
  return walkIns.length ? [...walkIns, ...rest] : list;
}
