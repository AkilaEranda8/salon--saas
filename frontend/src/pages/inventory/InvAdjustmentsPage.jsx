import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Input, Select, FormGroup } from '../../components/ui/FormElements';
import { useToast } from '../../components/ui/Toast';
import { DataTable, IconPlus, PKModal as Modal } from '../../components/ui/PageKit';
import { INV_API, fmtQty, loadBranches } from './invApi';

export default function InvAdjustmentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    branch_id: user?.branch_id || '', product_id: '', direction: 'add', quantity: '', reason: '',
  });

  const load = async () => {
    const [a, p, b] = await Promise.all([
      api.get(`${INV_API}/adjustments`),
      api.get(`${INV_API}/products`, { params: { limit: 200 } }),
      loadBranches(),
    ]);
    setRows(a.data ?? []); setProducts(p.data?.data ?? []); setBranches(b);
  };
  useEffect(() => { load().catch(() => toast.error('Load failed')); }, []);

  const save = async () => {
    if (!form.product_id || !form.quantity || !form.reason) return toast.error('All fields required');
    setSaving(true);
    try {
      await api.post(`${INV_API}/adjustments`, { ...form, quantity: Number(form.quantity) });
      setShow(false); toast.success('Adjustment applied'); load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  const approve = async (id) => {
    try {
      await api.post(`${INV_API}/adjustments/${id}/approve`);
      toast.success('Approved'); load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button variant="primary" onClick={() => setShow(true)}><IconPlus /> New Adjustment</Button>
      </div>
      <DataTable
        columns={[
          { id: 'product', header: 'Product', accessorFn: (r) => r.product?.name },
          { id: 'dir', header: 'Type', accessorFn: (r) => r.direction },
          { id: 'qty', header: 'Qty', accessorFn: (r) => fmtQty(r.quantity, r.product?.unit) },
          { id: 'reason', header: 'Reason', accessorFn: (r) => r.reason },
          { id: 'status', header: 'Status', accessorFn: (r) => r.status },
          { id: 'actions', header: '', enableSorting: false, cell: ({ row: { original: r } }) => (
            r.status === 'pending' ? <Button variant="secondary" onClick={() => approve(r.id)}>Approve</Button> : null
          ) },
        ]}
        data={rows}
        emptyMessage="No adjustments"
      />
      <Modal open={show} onClose={() => setShow(false)} title="Stock Adjustment"
        footer={<><Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Apply</Button></>}>
        <div style={{ display: 'grid', gap: 10 }}>
          {user?.role === 'superadmin' && (
            <FormGroup label="Branch"><Select value={form.branch_id} onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))}><option value="">Select</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></FormGroup>
          )}
          <FormGroup label="Product" required><Select value={form.product_id} onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}><option value="">Select</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></FormGroup>
          <FormGroup label="Direction">
            <Select value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}>
              <option value="add">Add Stock</option>
              <option value="remove">Remove Stock</option>
            </Select>
          </FormGroup>
          <FormGroup label="Quantity" required><Input type="number" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} /></FormGroup>
          <FormGroup label="Reason" required><Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Damage / expired / found stock…" /></FormGroup>
        </div>
      </Modal>
    </div>
  );
}
