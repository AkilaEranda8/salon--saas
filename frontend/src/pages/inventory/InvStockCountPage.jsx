import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Select, FormGroup, Input } from '../../components/ui/FormElements';
import { useToast } from '../../components/ui/Toast';
import { DataTable, FilterBar, IconPlus, TableShell, Th } from '../../components/ui/PageKit';
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
      <FilterBar style={{ marginBottom: 12 }}>
        {user?.role === 'superadmin' && (
          <FormGroup label="Branch">
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Select</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </FormGroup>
        )}
        <Button variant="primary" loading={saving} onClick={create} style={{ marginLeft: 'auto' }}>
          <IconPlus /> Start Stock Count
        </Button>
      </FilterBar>

      {active && active.status === 'draft' && (
        <div style={{
          background: 'var(--app-panel, #fff)',
          border: '1px solid var(--app-border, #EAECF0)',
          borderRadius: 14,
          padding: 16,
          marginBottom: 16,
          boxShadow: 'var(--app-shadow, 0 2px 8px rgba(16,24,40,0.06))',
        }}>
          <div style={{
            fontWeight: 700,
            marginBottom: 12,
            color: 'var(--app-title, #101828)',
            fontFamily: "'Sora',sans-serif",
          }}>
            Physical Count — {active.count_date}
          </div>
          <TableShell>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Expected</Th>
                <Th>Actual</Th>
                <Th>Variance</Th>
              </tr>
            </thead>
            <tbody>
              {(active.items || []).map((it) => (
                <tr key={it.id} style={{ borderTop: '1px solid var(--app-border, #F2F4F7)' }}>
                  <td style={{ padding: 10, fontFamily: "'Inter',sans-serif", color: 'var(--app-text, #101828)' }}>
                    {it.product?.name}
                  </td>
                  <td style={{ padding: 10, fontFamily: "'Inter',sans-serif" }}>
                    {fmtQty(it.expected_qty, it.product?.unit)}
                  </td>
                  <td style={{ padding: 10 }}>
                    <Input
                      type="number"
                      value={it.actual_qty}
                      onChange={(e) => setActive((prev) => ({
                        ...prev,
                        items: prev.items.map((x) => x.id === it.id
                          ? { ...x, actual_qty: e.target.value, variance: Number(e.target.value) - Number(x.expected_qty) }
                          : x),
                      }))}
                      style={{ width: 110 }}
                    />
                  </td>
                  <td style={{
                    padding: 10,
                    color: Number(it.variance) === 0 ? '#059669' : '#DC2626',
                    fontWeight: 600,
                    fontFamily: "'Inter',sans-serif",
                  }}>
                    {fmtQty(it.variance, it.product?.unit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
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
