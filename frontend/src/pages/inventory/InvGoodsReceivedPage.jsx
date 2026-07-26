import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Input, Select, FormGroup } from '../../components/ui/FormElements';
import { useToast } from '../../components/ui/Toast';
import { DataTable, IconPlus, PKModal as Modal } from '../../components/ui/PageKit';
import { INV_API, loadBranches } from './invApi';

export default function InvGoodsReceivedPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [pos, setPos] = useState([]);
  const [branches, setBranches] = useState([]);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    branch_id: user?.branch_id || '',
    purchase_order_id: '',
    received_date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [items, setItems] = useState([{ product_id: '', quantity_received: '', unit_cost: '' }]);

  const load = async () => {
    const [g, p, po, b] = await Promise.all([
      api.get(`${INV_API}/goods-receipts`),
      api.get(`${INV_API}/products`, { params: { limit: 200 } }),
      api.get(`${INV_API}/purchase-orders`),
      loadBranches(),
    ]);
    setRows(g.data ?? []); setProducts(p.data?.data ?? []); setPos(po.data ?? []); setBranches(b);
  };
  useEffect(() => { load().catch(() => toast.error('Load failed')); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`${INV_API}/goods-receipts`, {
        ...form,
        confirm: true,
        items: items.filter((i) => i.product_id && i.quantity_received).map((i) => ({
          product_id: Number(i.product_id),
          quantity_received: Number(i.quantity_received),
          unit_cost: Number(i.unit_cost || 0),
        })),
      });
      setShow(false); toast.success('Goods received — stock increased'); load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button variant="primary" onClick={() => setShow(true)}><IconPlus /> Receive Goods</Button>
      </div>
      <DataTable
        columns={[
          { id: 'grn', header: 'GRN #', accessorFn: (r) => r.grn_number },
          { id: 'po', header: 'PO', accessorFn: (r) => r.purchaseOrder?.po_number || '—' },
          { id: 'date', header: 'Received', accessorFn: (r) => r.received_date },
          { id: 'status', header: 'Status', accessorFn: (r) => r.status },
          { id: 'lines', header: 'Lines', accessorFn: (r) => r.items?.length || 0 },
        ]}
        data={rows}
        emptyMessage="No goods receipts"
        emptySub="Only Goods Received increases inventory"
      />
      <Modal open={show} onClose={() => setShow(false)} title="Goods Received Note" size="lg"
        footer={<><Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Confirm & Increase Stock</Button></>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          {user?.role === 'superadmin' && (
            <FormGroup label="Branch"><Select value={form.branch_id} onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))}><option value="">Select</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></FormGroup>
          )}
          <FormGroup label="Linked PO">
            <Select value={form.purchase_order_id} onChange={(e) => setForm((f) => ({ ...f, purchase_order_id: e.target.value }))}>
              <option value="">None</option>
              {pos.map((p) => <option key={p.id} value={p.id}>{p.po_number}</option>)}
            </Select>
          </FormGroup>
          <FormGroup label="Received Date"><Input type="date" value={form.received_date} onChange={(e) => setForm((f) => ({ ...f, received_date: e.target.value }))} /></FormGroup>
        </div>
        {items.map((it, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <Select value={it.product_id} onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, product_id: e.target.value } : x))}>
              <option value="">Product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Input type="number" placeholder="Qty received" value={it.quantity_received} onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, quantity_received: e.target.value } : x))} />
            <Input type="number" placeholder="Unit cost" value={it.unit_cost} onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, unit_cost: e.target.value } : x))} />
          </div>
        ))}
        <Button variant="secondary" onClick={() => setItems((p) => [...p, { product_id: '', quantity_received: '', unit_cost: '' }])}>+ Line</Button>
      </Modal>
    </div>
  );
}
