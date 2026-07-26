import api from '../../api/axios';

export const INV_API = '/salon-inventory';
export const UNITS = ['ml', 'g', 'kg', 'L', 'pcs'];
export const PRODUCT_TYPES = [
  { value: 'consumable', label: 'Consumable' },
  { value: 'retail', label: 'Retail Product' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'chemical', label: 'Chemical' },
  { value: 'accessories', label: 'Accessories' },
];

export const typeColor = {
  consumable: '#2563EB',
  retail: '#059669',
  equipment: '#D97706',
  chemical: '#7C3AED',
  accessories: '#0284C7',
};

export async function loadBranches() {
  const r = await api.get('/branches', { params: { limit: 100 } });
  return Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
}

export async function loadStaff() {
  const r = await api.get('/staff', { params: { limit: 200 } });
  return Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
}

export async function loadServices() {
  const r = await api.get('/services', { params: { limit: 200 } });
  return Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
}

export function fmtQty(n, unit = '') {
  const v = Number(n || 0);
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
  return unit ? `${s} ${unit}` : s;
}

export function exportCsv(filename, rows, columns) {
  const header = columns.map((c) => c.header).join(',');
  const body = rows.map((row) => columns.map((c) => {
    const val = typeof c.accessor === 'function' ? c.accessor(row) : row[c.accessor];
    const s = String(val ?? '').replace(/"/g, '""');
    return `"${s}"`;
  }).join(',')).join('\n');
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
