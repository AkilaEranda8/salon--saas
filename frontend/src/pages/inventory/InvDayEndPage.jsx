import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Input, Select, FormGroup } from '../../components/ui/FormElements';
import { useToast } from '../../components/ui/Toast';
import { FilterBar, TableShell, Th } from '../../components/ui/PageKit';
import { INV_API, fmtQty, loadBranches } from './invApi';

export default function InvDayEndPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(user?.branch_id || '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadBranches().then(setBranches).catch(() => {}); }, []);

  const loadPreview = async () => {
    if (!branchId && user?.role === 'superadmin') return toast.error('Select a branch');
    setLoading(true);
    try {
      const r = await api.get(`${INV_API}/day-end/preview`, {
        params: { date, branchId: branchId || undefined },
      });
      setItems((r.data.items || []).map((it) => ({
        ...it,
        quantity_used: Number(it.quantity_used || 0),
      })));
      setPendingCount(r.data.pendingCount || 0);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to load'); }
    setLoading(false);
  };

  useEffect(() => {
    if (branchId || user?.role !== 'superadmin') loadPreview();
  }, [date]);

  const saveDraft = async () => {
    setSaving(true);
    try {
      await api.post(`${INV_API}/day-end/draft`, {
        branch_id: branchId || user?.branch_id,
        date,
        items: items.map((i) => ({
          product_id: i.product_id,
          quantity_used: i.quantity_used,
          unit: i.unit,
          consumption_ids: i.consumption_ids,
        })),
      });
      toast.success('Draft saved');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  const confirm = async () => {
    if (!window.confirm('Confirm deduction? This will reduce inventory and mark pending usage as processed.')) return;
    setSaving(true);
    try {
      await api.post(`${INV_API}/day-end/confirm`, {
        branch_id: branchId || user?.branch_id,
        date,
        items: items.map((i) => ({
          product_id: i.product_id,
          quantity_used: i.quantity_used,
          unit: i.unit,
          consumption_ids: i.consumption_ids,
        })),
      });
      toast.success('Stock deducted successfully');
      loadPreview();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  return (
    <div>
      <div style={{
        background: 'var(--app-accent-soft, #EFF6FF)',
        border: '1px solid #BFDBFE',
        borderRadius: 14,
        padding: 16,
        marginBottom: 16,
      }}>
        <div style={{
          fontWeight: 700,
          marginBottom: 6,
          color: 'var(--app-title, #101828)',
          fontFamily: "'Sora',sans-serif",
        }}>
          Day End Stock Consumption
        </div>
        <div style={{
          fontSize: 13,
          color: 'var(--app-text-secondary, #475467)',
          lineHeight: 1.5,
          fontFamily: "'Inter',sans-serif",
        }}>
          Appointments during the day record usage as <strong>Pending</strong>. Stock does not change until you confirm deduction here.
        </div>
      </div>

      <FilterBar style={{ marginBottom: 16 }}>
        {user?.role === 'superadmin' && (
          <FormGroup label="Branch">
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Select</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </FormGroup>
        )}
        <FormGroup label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormGroup>
        <Button variant="secondary" onClick={loadPreview} loading={loading}>Refresh Preview</Button>
      </FilterBar>

      <div style={{
        marginBottom: 12,
        fontSize: 13,
        color: 'var(--app-text-secondary, #475467)',
        fontFamily: "'Inter',sans-serif",
      }}>
        Pending usage records: <strong>{pendingCount}</strong> · Grouped products: <strong>{items.length}</strong>
      </div>

      <TableShell>
        <thead>
          <tr>
            <Th>Product</Th>
            <Th>Current Stock</Th>
            <Th>Used Today</Th>
            <Th>Unit</Th>
          </tr>
        </thead>
        <tbody>
          {!items.length ? (
            <tr>
              <td
                colSpan={4}
                style={{
                  padding: 24,
                  color: 'var(--app-text-muted, #98A2B3)',
                  textAlign: 'center',
                  fontFamily: "'Inter',sans-serif",
                }}
              >
                No pending consumption for this date
              </td>
            </tr>
          ) : items.map((it, i) => (
            <tr
              key={it.product_id}
              style={{
                borderTop: '1px solid var(--app-border, #F2F4F7)',
                background: i % 2 ? 'var(--app-surface-muted, transparent)' : 'transparent',
              }}
            >
              <td style={{ padding: 12, fontWeight: 600, color: 'var(--app-text, #101828)', fontFamily: "'Inter',sans-serif" }}>
                {it.product?.name}
              </td>
              <td style={{ padding: 12, fontFamily: "'Inter',sans-serif", color: 'var(--app-text-secondary, #344054)' }}>
                {fmtQty(it.product?.current_stock, it.unit)}
              </td>
              <td style={{ padding: 12 }}>
                <Input
                  type="number"
                  value={it.quantity_used}
                  onChange={(e) => setItems((prev) => prev.map((x) => (
                    x.product_id === it.product_id ? { ...x, quantity_used: Number(e.target.value) } : x
                  )))}
                  style={{ width: 120 }}
                />
              </td>
              <td style={{ padding: 12, fontFamily: "'Inter',sans-serif", color: 'var(--app-text-muted, #667085)' }}>
                {it.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>

      <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={() => { setItems([]); toast.success('Cleared preview'); }}>Cancel</Button>
        <Button variant="secondary" loading={saving} onClick={saveDraft} disabled={!items.length}>Save Draft</Button>
        <Button variant="primary" loading={saving} onClick={confirm} disabled={!items.length}>Confirm Deduction</Button>
      </div>
    </div>
  );
}
