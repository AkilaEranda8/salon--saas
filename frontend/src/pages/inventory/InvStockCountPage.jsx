import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Select, FormGroup, Input } from '../../components/ui/FormElements';
import { useToast } from '../../components/ui/Toast';
import { DataTable, IconPlus } from '../../components/ui/PageKit';
import { INV_API, fmtQty, loadBranches } from './invApi';

export default function InvStockCountPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [active, setActive] = useState(null);
  const [branchId, setBranchId] = useState(user?.branch_id || '');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [c, b] = await Promise.all([api.get(`${INV_API}/stock-counts`), loadBranches()]);
    setRows(c.data ?? []); setBranches(b);
  };
  useEffect(() => { load().catch(() => toast.error('Load failed')); }, []);

  const create = async () => {
    setSaving(true);
    try {
      const r = await api.post(`${INV_API}/stock-counts`, { branch_id: branchId || user?.branch_id });
      setActive(r.data);
      toast.success('Stock count started');
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  const saveItems = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const r = await api.put(`${INV_API}/stock-counts/${active.id}`, {
        items: (active.items || []).map((i) => ({ product_id: i.product_id, actual_qty: i.actual_qty })),
      });
      setActive(r.data);
      toast.success('Saved');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  const complete = async () => {
    if (!active || !window.confirm('Generate adjustments from variances and complete count?')) return;
    setSaving(true);
    try {
      await api.put(`${INV_API}/stock-counts/${active.id}`, {
        items: (active.items || []).map((i) => ({ product_id: i.product_id, actual_qty: i.actual_qty })),
      });
      await api.post(`${INV_API}/stock-counts/${active.id}/complete`);
      toast.success('Stock count completed');
      setActive(null);
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'end' }}>
        {user?.role === 'superadmin' && (
          <FormGroup label="Branch"><Select value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">Select</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></FormGroup>
        )}
        <Button variant="primary" loading={saving} onClick={create}><IconPlus /> Start Stock Count</Button>
      </div>

      {active && active.status === 'draft' && (
        <div style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Physical Count — {active.count_date}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', background: '#F8FAFC' }}>
                <th style={{ padding: 8 }}>Product</th>
                <th style={{ padding: 8 }}>Expected</th>
                <th style={{ padding: 8 }}>Actual</th>
                <th style={{ padding: 8 }}>Variance</th>
              </tr>
            </thead>
            <tbody>
              {(active.items || []).map((it) => (
                <tr key={it.id} style={{ borderTop: '1px solid #F2F4F7' }}>
                  <td style={{ padding: 8 }}>{it.product?.name}</td>
                  <td style={{ padding: 8 }}>{fmtQty(it.expected_qty, it.product?.unit)}</td>
                  <td style={{ padding: 8 }}>
                    <Input type="number" value={it.actual_qty} onChange={(e) => setActive((prev) => ({
                      ...prev,
                      items: prev.items.map((x) => x.id === it.id
                        ? { ...x, actual_qty: e.target.value, variance: Number(e.target.value) - Number(x.expected_qty) }
                        : x),
                    }))} style={{ width: 110 }} />
                  </td>
                  <td style={{ padding: 8, color: Number(it.variance) === 0 ? '#059669' : '#DC2626', fontWeight: 600 }}>
                    {fmtQty(it.variance, it.product?.unit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <Button variant="secondary" loading={saving} onClick={saveItems}>Save</Button>
            <Button variant="primary" loading={saving} onClick={complete}>Generate Adjustment & Complete</Button>
          </div>
        </div>
      )}

      <DataTable
        columns={[
          { id: 'date', header: 'Date', accessorFn: (r) => r.count_date },
          { id: 'branch', header: 'Branch', accessorFn: (r) => r.branch?.name },
          { id: 'status', header: 'Status', accessorFn: (r) => r.status },
          { id: 'lines', header: 'Items', accessorFn: (r) => r.items?.length || 0 },
          { id: 'actions', header: '', enableSorting: false, cell: ({ row: { original: r } }) => (
            r.status === 'draft' ? <Button variant="secondary" onClick={() => setActive(r)}>Continue</Button> : null
          ) },
        ]}
        data={rows}
        emptyMessage="No stock counts"
      />
    </div>
  );
}
