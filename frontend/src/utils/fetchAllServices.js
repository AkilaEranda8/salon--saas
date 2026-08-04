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

export function filterServicesByQuery(services = [], query = '') {
  const q = String(query || '').trim().toLowerCase();
  const active = services.filter((s) => s && s.is_active !== false);
  if (!q) return active;
  return active.filter((s) => {
    const hay = `${s.name || ''} ${s.category || ''} ${s.subcategory || ''} ${s.description || ''}`.toLowerCase();
    return hay.includes(q);
  });
}
