import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

export const INV_API = '/salon-inventory';
export const UNITS = ['ml', 'g', 'kg', 'L', 'pcs'];

/** Only consumables can be used up at Day End; equipment is tracked but never consumed. */
export const PRODUCT_TYPES = [
  { value: 'consumable', label: 'Consumable' },
  { value: 'equipment', label: 'Equipment' },
];

export const typeColor = {
  consumable: '#2563EB',
  equipment: '#D97706',
};

export const MOVEMENT_TYPES = [
  { value: 'opening', label: 'Opening stock' },
  { value: 'purchase', label: 'Goods received' },
  { value: 'consumption', label: 'Day end consumption' },
  { value: 'adjustment', label: 'Adjustment' },
];

export function todayStr() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

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

/**
 * Owners and admins have no branch on their account, which used to leave every
 * inventory form without a branch and rejected by the API. Resolve one branch up
 * front and only show a picker when the salon actually has more than one.
 */
export function useInvBranch() {
  const { user } = useAuth();
  const assigned = user?.branch_id ?? user?.branchId ?? '';
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(assigned ? String(assigned) : '');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadBranches()
      .then((list) => {
        if (!alive) return;
        setBranches(list);
        setBranchId((current) => current || (list[0] ? String(list[0].id) : ''));
      })
      .catch(() => {})
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  return { branches, branchId, setBranchId, multiBranch: branches.length > 1, ready };
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
