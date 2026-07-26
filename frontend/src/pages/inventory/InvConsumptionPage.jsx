import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Input, Select, FormGroup } from '../../components/ui/FormElements';
import { useToast } from '../../components/ui/Toast';
import { DataTable, FilterBar, IconPlus, PKModal as Modal } from '../../components/ui/PageKit';
import { INV_API, fmtQty, loadBranches, loadStaff, loadServices } from './invApi';

export default function InvConsumptionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);
  const [branches, setBranches] = useState([]);
  const [status, setStatus] = useState('pending');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    branch_id: user?.branch_id || '',
    product_id: '', quantity_used: '', unit: 'ml',
    staff_id: '', service_id: '', reason: '',
    consumption_date: new Date().toISOString().slice(0, 10),
  });

  const load = async () => {
    const [c, p, s, sv, b] = await Promise.all([
      api.get(`${INV_API}/consumptions`, { params: { status: status || undefined } }),
      api.get(`${INV_API}/products`, { params: { limit: 200, status: 'active' } }),
      loadStaff(), loadServices(), loadBranches(),
    ]);
    setRows(c.data ?? []);
    setProducts(p.data?.data ?? []);
    setStaff(s); setServices(sv); setBranches(b);
  };
  useEffect(() => { load().catch(() => toast.error('Load failed')); }, [status]);

  const save = async () => {
    if (!form.product_id || !form.quantity_used) return toast.error('Product and quantity required');
    setSaving(true);
    try {
      const product = products.find((p) => String(p.id) === String(form.product_id));
      await api.post(`${INV_API}/consumptions`, {
        ...form,
        unit: form.unit || product?.unit || 'ml',
        quantity_used: Number(form.quantity_used),
      });
      setShow(false);
      toast.success('Consumption saved as pending (stock not reduced yet)');
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  return (
    <div>
      <FilterBar>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="processed">Processed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Button variant="primary" onClick={() => setShow(true)} style={{ marginLeft: 'auto' }}><IconPlus /> Record Usage</Button>
      </FilterBar>
      <DataTable
        columns={[
          { id: 'date', header: 'Date', accessorFn: (r) => r.consumption_date },
          { id: 'product', header: 'Product', accessorFn: (r) => r.product?.name },
          { id: 'qty', header: 'Qty Used', accessorFn: (r) => fmtQty(r.quantity_used, r.unit) },
          { id: 'stylist', header: 'Stylist', accessorFn: (r) => r.staff?.name || '—' },
          { id: 'service', header: 'Service', accessorFn: (r) => r.service?.name || '—' },
          { id: 'status', header: 'Status', accessorFn: (r) => r.status },
          { id: 'reason', header: 'Reason', accessorFn: (r) => r.reason || '—' },
        ]}
        data={rows}
        emptyMessage="No consumption records"
        emptySub="Record shampoo/color usage during appointments — stock deducts at Day End"
      />
      <Modal open={show} onClose={() => setShow(false)} title="Record Stock Consumption"
        footer={<><Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Save Pending</Button></>}>
        <div style={{ display: 'grid', gap: 10 }}>
          {user?.role === 'superadmin' && (
            <FormGroup label="Branch"><Select value={form.branch_id} onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))}><option value="">Select</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></FormGroup>
          )}
          <FormGroup label="Date"><Input type="date" value={form.consumption_date} onChange={(e) => setForm((f) => ({ ...f, consumption_date: e.target.value }))} /></FormGroup>
          <FormGroup label="Product" required>
            <Select value={form.product_id} onChange={(e) => {
              const p = products.find((x) => String(x.id) === e.target.value);
              setForm((f) => ({ ...f, product_id: e.target.value, unit: p?.unit || f.unit }));
            }}>
              <option value="">Select product</option>
              {products.filter((p) => p.product_type !== 'equipment').map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
              ))}
            </Select>
          </FormGroup>
          <FormGroup label="Quantity Used" required><Input type="number" value={form.quantity_used} onChange={(e) => setForm((f) => ({ ...f, quantity_used: e.target.value }))} /></FormGroup>
          <FormGroup label="Stylist"><Select value={form.staff_id} onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))}><option value="">Optional</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FormGroup>
          <FormGroup label="Service"><Select value={form.service_id} onChange={(e) => setForm((f) => ({ ...f, service_id: e.target.value }))}><option value="">Optional</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FormGroup>
          <FormGroup label="Reason"><Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. Hair wash" /></FormGroup>
        </div>
      </Modal>
    </div>
  );
}
