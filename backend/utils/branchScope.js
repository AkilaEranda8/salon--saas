/**
 * Derive branch id list from JWT payload (camelCase branchId) or DB-shaped user.
 */
function jwtBranchIds(user) {
  if (!user) return [];
  const raw = user.branchId ?? user.branch_id;
  if (raw == null || raw === '') return [];
  const n = Number(raw);
  return Number.isFinite(n) ? [n] : [];
}

/** Coerce branchId from query (handles duplicate keys → array). */
function parseQueryBranchId(raw) {
  if (raw == null || raw === '') return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

module.exports = { jwtBranchIds, parseQueryBranchId };
