import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Input, Select, FormGroup } from '../../components/ui/FormElements';
import { useToast } from '../../components/ui/Toast';
import { DataTable, FilterBar, IconPlus, PKModal as Modal } from '../../components/ui/PageKit';
import { INV_API, fmtQty, useInvBranch } from './invApi';

const EMPTY = { product_id: '', direction: 'add', quantity: '', reason: '' };

export default function InvAdjustmentsPage() {
  const { toast } = useToast();
  const { branches, branchId, setBranchId, multiBranch, ready } = useInvBranch();

  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const [a, p] = await Promise.all([
        api.get(`${INV_API}/adjustments`, { params: { branchId: branchId || undefined } }),
        api.get(`${INV_API}/products`, { params: { limit: 200, status: 'active', branchId: branchId || undefined } }),
      ]);
      setRows(a.data ?? []);
      setProducts(p.data?.data ?? []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load adjustments');
    }
    setLoading(false);
  }, [ready, branchId, toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.product_id || !form.quantity || !form.reason.trim()) {
      return toast.error('Product, quantity and reason are required');
    }
    setSaving(true);
    try {
      await api.post(`${INV_API}/adjustments`, {
        branch_id: branchId || undefined,
        product_id: Number(form.product_id),
        direction: form.direction,
        quantity: Number(form.quantity),
        reason: form.reason.trim(),
      });
      setShow(false);
      toast.success('Stock adjusted');
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  return (
    <div>
      <FilterBar style={{ marginBottom: 12 }}>
        {multiBranch && (
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <Button variant="primary" onClick={() => { setForm(EMPTY); setShow(true); }} style={{ marginLeft: 'auto' }}>
          <IconPlus /> New Adjustment
        </Button>
      </FilterBar>

      <DataTable
        columns={[
          { id: 'when', header: 'Date', accessorFn: (r) => new Date(r.createdAt).toLocaleDateString() },
          { id: 'product', header: 'Product', accessorFn: (r) => r.product?.name },
          {
            id: 'qty', header: 'Change', accessorFn: (r) => Number(r.quantity),
            cell: ({ row: { original: r } }) => (
              <span style={{ fontWeight: 700, color: r.direction === 'add' ? '#047857' : '#B42318' }}>
                {r.direction === 'add' ? '+' : '−'}{fmtQty(r.quantity, r.product?.unit)}
              </span>
            ),
          },
          { id: 'reason', header: 'Reason', accessorFn: (r) => r.reason },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No adjustments"
        emptySub="Use adjustments to correct stock after damage, expiry or a miscount"
      />

      <Modal
        open={show}
        onClose={() => setShow(false)}
        title="Stock Adjustment"
        footer={<><Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Apply</Button></>}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {multiBranch && (
            <FormGroup label="Branch">
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </FormGroup>
          )}
          <FormGroup label="Product" required>
            <Select value={form.product_id} onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}>
              <option value="">Select product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {fmtQty(p.current_stock, p.unit)} in stock</option>
              ))}
            </Select>
          </FormGroup>
          <FormGroup label="Direction">
            <Select value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}>
              <option value="add">Add stock (+)</option>
              <option value="remove">Remove stock (−)</option>
            </Select>
          </FormGroup>
          <FormGroup label="Quantity" required>
            <Input type="number" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
          </FormGroup>
          <FormGroup label="Reason" required>
            <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Damaged / expired / found stock…" />
          </FormGroup>
          <div style={{ fontSize: 12, color: 'var(--app-text-muted, #98A2B3)' }}>
            Adjustments apply straight away — no approval needed.
          </div>
        </div>
      </Modal>
    </div>
  );
}
