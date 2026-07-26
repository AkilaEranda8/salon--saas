import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Input, Select, FormGroup } from '../../components/ui/FormElements';
import { useToast } from '../../components/ui/Toast';
import { DataTable, FilterBar, IconPlus, PKModal as Modal } from '../../components/ui/PageKit';
import { INV_API, loadBranches } from './invApi';

export default function InvPurchaseOrdersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ branch_id: user?.branch_id || '', supplier_id: '', notes: '' });
  const [items, setItems] = useState([{ product_id: '', quantity_ordered: '', unit_cost: '' }]);

  const load = async () => {
    const [po, p, s, b] = await Promise.all([
      api.get(`${INV_API}/purchase-orders`),
      api.get(`${INV_API}/products`, { params: { limit: 200 } }),
      api.get(`${INV_API}/suppliers`),
      loadBranches(),
    ]);
    setRows(po.data ?? []); setProducts(p.data?.data ?? []); setSuppliers(s.data ?? []); setBranches(b);
  };
  useEffect(() => { load().catch(() => toast.error('Load failed')); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`${INV_API}/purchase-orders`, {
        ...form,
        status: 'ordered',
        items: items.filter((i) => i.product_id && i.quantity_ordered).map((i) => ({
          product_id: Number(i.product_id),
          quantity_ordered: Number(i.quantity_ordered),
          unit_cost: Number(i.unit_cost || 0),
        })),
      });
      setShow(false); toast.success('PO created'); load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  return (
    <div>
      <FilterBar style={{ marginBottom: 12 }}>
        <Button variant="primary" onClick={() => setShow(true)} style={{ marginLeft: 'auto' }}>
          <IconPlus /> New Purchase Order
        </Button>
      </FilterBar>
      <DataTable
        columns={[
          { id: 'po', header: 'PO #', accessorFn: (r) => r.po_number },
          { id: 'supplier', header: 'Supplier', accessorFn: (r) => r.supplier?.name || '—' },
          { id: 'date', header: 'Order Date', accessorFn: (r) => r.order_date },
          { id: 'status', header: 'Status', accessorFn: (r) => r.status },
          { id: 'total', header: 'Total', accessorFn: (r) => `Rs. ${Number(r.total_cost || 0).toLocaleString()}` },
          { id: 'items', header: 'Lines', accessorFn: (r) => r.items?.length || 0 },
        ]}
        data={rows}
        emptyMessage="No purchase orders"
        emptySub="Create a PO — stock increases only after Goods Received"
      />
      <Modal open={show} onClose={() => setShow(false)} title="Create Purchase Order" size="lg"
        footer={<><Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Create PO</Button></>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          {user?.role === 'superadmin' && (
            <FormGroup label="Branch"><Select value={form.branch_id} onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))}><option value="">Select</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></FormGroup>
          )}
          <FormGroup label="Supplier"><Select value={form.supplier_id} onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}><option value="">Optional</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FormGroup>
        </div>
        {items.map((it, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <Select value={it.product_id} onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, product_id: e.target.value } : x))}>
              <option value="">Product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Input type="number" placeholder="Qty" value={it.quantity_ordered} onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, quantity_ordered: e.target.value } : x))} />
            <Input type="number" placeholder="Unit cost" value={it.unit_cost} onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, unit_cost: e.target.value } : x))} />
          </div>
        ))}
        <Button variant="secondary" onClick={() => setItems((p) => [...p, { product_id: '', quantity_ordered: '', unit_cost: '' }])}>+ Line</Button>
      </Modal>
    </div>
  );
}
