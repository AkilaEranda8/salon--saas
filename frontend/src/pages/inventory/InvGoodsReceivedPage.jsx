import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Input, Select, FormGroup } from '../../components/ui/FormElements';
import { useToast } from '../../components/ui/Toast';
import { DataTable, FilterBar, IconPlus, PKModal as Modal } from '../../components/ui/PageKit';
import { INV_API, todayStr, useInvBranch } from './invApi';

const EMPTY_LINE = { product_id: '', quantity_received: '', unit_cost: '' };

export default function InvGoodsReceivedPage() {
  const { toast } = useToast();
  const { branches, branchId, setBranchId, multiBranch, ready } = useInvBranch();

  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receivedDate, setReceivedDate] = useState(todayStr());
  const [items, setItems] = useState([{ ...EMPTY_LINE }]);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const [g, p] = await Promise.all([
        api.get(`${INV_API}/goods-receipts`, { params: { branchId: branchId || undefined } }),
        api.get(`${INV_API}/products`, { params: { limit: 200, status: 'active', branchId: branchId || undefined } }),
      ]);
      setRows(g.data ?? []);
      setProducts(p.data?.data ?? []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load goods receipts');
    }
    setLoading(false);
  }, [ready, branchId, toast]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setReceivedDate(todayStr());
    setItems([{ ...EMPTY_LINE }]);
    setShow(true);
  };

  const save = async () => {
    const lines = items
      .filter((i) => i.product_id && Number(i.quantity_received) > 0)
      .map((i) => ({
        product_id: Number(i.product_id),
        quantity_received: Number(i.quantity_received),
        unit_cost: Number(i.unit_cost || 0),
      }));
    if (!lines.length) return toast.error('Add at least one product with a quantity');

    setSaving(true);
    try {
      await api.post(`${INV_API}/goods-receipts`, {
        branch_id: branchId || undefined,
        received_date: receivedDate,
        items: lines,
      });
      setShow(false);
      toast.success('Goods received — stock increased');
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  const setLine = (idx, patch) =>
    setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  return (
    <div>
      <FilterBar style={{ marginBottom: 12 }}>
        {multiBranch && (
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <Button variant="primary" onClick={openAdd} style={{ marginLeft: 'auto' }}>
          <IconPlus /> Receive Goods
        </Button>
      </FilterBar>

      <DataTable
        columns={[
          { id: 'grn', header: 'GRN #', accessorFn: (r) => r.grn_number },
          { id: 'date', header: 'Received', accessorFn: (r) => r.received_date },
          {
            id: 'products', header: 'Products',
            accessorFn: (r) => (r.items || []).map((i) => i.product?.name).filter(Boolean).join(', ') || '—',
          },
          {
            id: 'qty', header: 'Total Qty',
            accessorFn: (r) => (r.items || []).reduce((s, i) => s + Number(i.quantity_received || 0), 0),
          },
        ]}
        data={rows}
        loading={loading}
        emptyMessage="No goods receipts yet"
        emptySub="Receiving goods is how stock increases after the opening balance"
      />

      <Modal
        open={show}
        onClose={() => setShow(false)}
        title="Receive Goods"
        size="lg"
        footer={<><Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Confirm & Increase Stock</Button></>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {multiBranch && (
            <FormGroup label="Branch">
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </FormGroup>
          )}
          <FormGroup label="Received Date">
            <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          </FormGroup>
        </div>

        {items.map((it, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <Select value={it.product_id} onChange={(e) => setLine(idx, { product_id: e.target.value })}>
              <option value="">Select product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
            </Select>
            <Input type="number" placeholder="Qty" value={it.quantity_received} onChange={(e) => setLine(idx, { quantity_received: e.target.value })} />
            <Input type="number" placeholder="Unit cost" value={it.unit_cost} onChange={(e) => setLine(idx, { unit_cost: e.target.value })} />
          </div>
        ))}
        <Button variant="secondary" onClick={() => setItems((p) => [...p, { ...EMPTY_LINE }])}>+ Add line</Button>

        {!products.length && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#DC2626' }}>
            No products in this branch yet — add one on the Products tab first.
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--app-text-muted, #98A2B3)' }}>
          Stock increases immediately and the unit cost updates the product cost price.
        </div>
      </Modal>
    </div>
  );
}
