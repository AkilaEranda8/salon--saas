import api from '../api/axios';

/**
 * Load every service for the tenant (paginated until complete).
 * Backend allows up to 2000 per page; we still loop for safety.
 */
export async function fetchAllServices(apiClient = api, params = {}) {
  const pageLimit = Math.min(Number(params.limit) || 1000, 2000);
  let page = 1;
  let all = [];
  let total = Infinity;

  while (all.length < total) {
    const { data } = await apiClient.get('/services', {
      params: { ...params, limit: pageLimit, page },
    });
    const rows = Array.isArray(data) ? data : (data?.data ?? []);
    total = typeof data?.total === 'number' ? data.total : rows.length;
    all = all.concat(rows);
    if (!rows.length || rows.length < pageLimit) break;
    page += 1;
    if (page > 20) break;
  }
  return all;
}

/** Paid services first, then name — keeps Rs.0 / junk catalogue noise out of the way. */
function sortServicesForPicker(list = []) {
  return [...list].sort((a, b) => {
    const ap = Number(a?.price) > 0 ? 0 : 1;
    const bp = Number(b?.price) > 0 ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
  });
}

export function filterServicesByQuery(services = [], query = '') {
  const q = String(query || '').trim().toLowerCase();
  const active = services.filter((s) => s && s.is_active !== false);
  const matched = !q
    ? active
    : active.filter((s) => {
      const hay = `${s.name || ''} ${s.category || ''} ${s.subcategory || ''} ${s.description || ''}`.toLowerCase();
      return hay.includes(q);
    });
  return sortServicesForPicker(matched);
}
