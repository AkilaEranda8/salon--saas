import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Input, Select, FormGroup } from '../../components/ui/FormElements';
import { useToast } from '../../components/ui/Toast';
import { FilterBar, TableShell, Th } from '../../components/ui/PageKit';
import { INV_API, fmtQty, todayStr, useInvBranch } from './invApi';

export default function InvDayEndPage() {
  const { toast } = useToast();
  const { branches, branchId, setBranchId, multiBranch, ready } = useInvBranch();

  const [date, setDate] = useState(todayStr());
  const [items, setItems] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [alreadyClosed, setAlreadyClosed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const r = await api.get(`${INV_API}/day-end/preview`, {
        params: { date, branchId: branchId || undefined },
      });
      setItems(r.data.items || []);
      setPendingCount(r.data.pendingCount || 0);
      setAlreadyClosed(!!r.data.alreadyClosed);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load');
      setItems([]);
      setPendingCount(0);
    }
    setLoading(false);
  }, [ready, date, branchId, toast]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  const confirm = async () => {
    if (!window.confirm(`Close ${date} and deduct this stock? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await api.post(`${INV_API}/day-end/confirm`, { branch_id: branchId || undefined, date });
      toast.success('Day End completed — stock deducted');
      loadPreview();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  const cellStyle = { padding: 12, fontFamily: "'Inter',sans-serif", color: 'var(--app-text-secondary, #344054)' };

  return (
    <div>
      <div style={{
        background: alreadyClosed ? '#ECFDF5' : 'var(--app-accent-soft, #EFF6FF)',
        border: `1px solid ${alreadyClosed ? '#A7F3D0' : '#BFDBFE'}`,
        borderRadius: 14,
        padding: 16,
        marginBottom: 16,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--app-title, #101828)', fontFamily: "'Sora',sans-serif" }}>
          {alreadyClosed ? `Day End for ${date} is already completed` : 'Day End Stock Closing'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--app-text-secondary, #475467)', lineHeight: 1.5, fontFamily: "'Inter',sans-serif" }}>
          {alreadyClosed
            ? 'Stock for this date has been deducted. Any new usage recorded for this date will need a stock adjustment instead.'
            : 'Usage recorded during the day stays pending. Confirming here deducts it from stock in one step and writes every movement to History.'}
        </div>
      </div>

      <FilterBar style={{ marginBottom: 16 }}>
        {multiBranch && (
          <FormGroup label="Branch">
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </FormGroup>
        )}
        <FormGroup label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormGroup>
        <Button variant="secondary" onClick={loadPreview} loading={loading}>Refresh</Button>
      </FilterBar>

      <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--app-text-secondary, #475467)', fontFamily: "'Inter',sans-serif" }}>
        Pending entries: <strong>{pendingCount}</strong> · Products affected: <strong>{items.length}</strong>
      </div>

      <TableShell>
        <thead>
          <tr>
            <Th>Product</Th>
            <Th>Stock Now</Th>
            <Th>Used</Th>
            <Th>Stock After</Th>
          </tr>
        </thead>
        <tbody>
          {!items.length ? (
            <tr>
              <td colSpan={4} style={{ padding: 24, color: 'var(--app-text-muted, #98A2B3)', textAlign: 'center', fontFamily: "'Inter',sans-serif" }}>
                No pending usage for this date
              </td>
            </tr>
          ) : items.map((it, i) => {
            const after = Number(it.product?.current_stock || 0) - Number(it.quantity_used || 0);
            return (
              <tr key={it.product_id} style={{
                borderTop: '1px solid var(--app-border, #F2F4F7)',
                background: i % 2 ? 'var(--app-surface-muted, transparent)' : 'transparent',
              }}>
                <td style={{ ...cellStyle, fontWeight: 600, color: 'var(--app-text, #101828)' }}>
                  {it.product?.name}
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: '#98A2B3' }}>
                    {it.entries} {it.entries === 1 ? 'entry' : 'entries'}
                  </span>
                </td>
                <td style={cellStyle}>{fmtQty(it.product?.current_stock, it.unit)}</td>
                <td style={{ ...cellStyle, fontWeight: 700, color: '#B42318' }}>−{fmtQty(it.quantity_used, it.unit)}</td>
                <td style={{ ...cellStyle, fontWeight: 700, color: after < 0 ? '#DC2626' : '#101828' }}>
                  {fmtQty(after, it.unit)}{after < 0 ? ' ⚠' : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>

      <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
        <Button
          variant="primary"
          loading={saving}
          onClick={confirm}
          disabled={!items.length || alreadyClosed}
        >
          Confirm Day End
        </Button>
      </div>
    </div>
  );
}
