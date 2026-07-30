import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Input, Select, FormGroup } from '../../components/ui/FormElements';
import { useToast } from '../../components/ui/Toast';
import { ActionBtn, DataTable, FilterBar, IconPlus, IconTrash, PKModal as Modal } from '../../components/ui/PageKit';
import { INV_API, fmtQty, loadStaff, todayStr, useInvBranch } from './invApi';

export default function InvConsumptionPage() {
  const { toast } = useToast();
  const { branches, branchId, setBranchId, multiBranch, ready } = useInvBranch();

  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    product_id: '', quantity_used: '', staff_id: '', reason: '',
    consumption_date: todayStr(),
  });

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const [c, p, s] = await Promise.all([
        api.get(`${INV_API}/consumptions`, { params: { status: status || undefined, branchId: branchId || undefined } }),
        api.get(`${INV_API}/products`, { params: { limit: 200, status: 'active', product_type: 'consumable', branchId: branchId || undefined } }),
        loadStaff().catch(() => []),
      ]);
      setRows(c.data ?? []);
      setProducts(p.data?.data ?? []);
      setStaff(s);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load usage records');
    }
    setLoading(false);
  }, [ready, status, branchId, toast]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm({ product_id: '', quantity_used: '', staff_id: '', reason: '', consumption_date: todayStr() });
    setShow(true);
  };

  const save = async () => {
    if (!form.product_id || !form.quantity_used) return toast.error('Product and quantity are required');
    setSaving(true);
    try {
      const product = products.find((p) => String(p.id) === String(form.product_id));
      await api.post(`${INV_API}/consumptions`, {
        branch_id: branchId || undefined,
        product_id: Number(form.product_id),
        quantity_used: Number(form.quantity_used),
        unit: product?.unit,
        staff_id: form.staff_id || null,
        reason: form.reason || null,
        consumption_date: form.consumption_date,
      });
      setShow(false);
      toast.success('Usage recorded — stock reduces at Day End Closing');
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  const cancel = async (row) => {
    if (!window.confirm(`Remove pending usage of ${row.product?.name}?`)) return;
    try {
      await api.post(`${INV_API}/consumptions/${row.id}/cancel`);
      toast.success('Removed');
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  return (
    <div>
      <FilterBar>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="processed">Deducted</option>
          <option value="cancelled">Cancelled</option>
          <option value="">All</option>
        </Select>
        {multiBranch && (
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <Button variant="primary" onClick={openAdd} style={{ marginLeft: 'auto' }}><IconPlus /> Record Usage</Button>
      </FilterBar>

      <DataTable
        columns={[
          { id: 'date', header: 'Date', accessorFn: (r) => r.consumption_date },
          { id: 'product', header: 'Product', accessorFn: (r) => r.product?.name },
          { id: 'qty', header: 'Qty Used', accessorFn: (r) => fmtQty(r.quantity_used, r.unit) },
          { id: 'stylist', header: 'Stylist', accessorFn: (r) => r.staff?.name || '—' },
          { id: 'reason', header: 'Reason', accessorFn: (r) => r.reason || '—' },
          {
            id: 'status', header: 'Status', accessorFn: (r) => r.status,
            cell: ({ row: { original: r } }) => (
              <span style={{ textTransform: 'capitalize' }}>
                {r.status === 'processed' ? 'Deducted' : r.status}
              </span>
            ),
          },
          {
            id: 'actions', header: '', enableSorting: false,
            cell: ({ row: { original: r } }) => r.status === 'pending' ? (
              <ActionBtn onClick={() => cancel(r)} title="Remove" color="#DC2626"><IconTrash /></ActionBtn>
            ) : null,
          },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No usage recorded"
        emptySub="Record what staff used today — stock only drops at Day End Closing"
      />

      <Modal
        open={show}
        onClose={() => setShow(false)}
        title="Record Product Usage"
        footer={<><Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Save</Button></>}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {multiBranch && (
            <FormGroup label="Branch">
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </FormGroup>
          )}
          <FormGroup label="Date">
            <Input type="date" value={form.consumption_date} onChange={(e) => setForm((f) => ({ ...f, consumption_date: e.target.value }))} />
          </FormGroup>
          <FormGroup label="Product" required>
            <Select value={form.product_id} onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}>
              <option value="">Select product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {fmtQty(p.current_stock, p.unit)} left</option>
              ))}
            </Select>
          </FormGroup>
          <FormGroup label="Quantity Used" required>
            <Input type="number" value={form.quantity_used} onChange={(e) => setForm((f) => ({ ...f, quantity_used: e.target.value }))} />
          </FormGroup>
          <FormGroup label="Stylist">
            <Select value={form.staff_id} onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))}>
              <option value="">Optional</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </FormGroup>
          <FormGroup label="Reason">
            <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. Hair wash" />
          </FormGroup>
          {!products.length && (
            <div style={{ fontSize: 12, color: '#DC2626' }}>
              No consumable products in this branch — add one on the Products tab first.
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--app-text-muted, #98A2B3)' }}>
            Appointments and payments never change stock. Only Day End Closing deducts what is recorded here.
          </div>
        </div>
      </Modal>
    </div>
  );
}
