import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Input, Select, FormGroup } from '../../components/ui/FormElements';
import { useToast } from '../../components/ui/Toast';
import { ActionBtn, DataTable, FilterBar, IconEdit, IconPlus, IconTrash, PKModal as Modal } from '../../components/ui/PageKit';
import { INV_API, PRODUCT_TYPES, UNITS, fmtQty, loadBranches, typeColor } from './invApi';

const EMPTY = {
  branch_id: '', name: '', sku: '', barcode: '', brand: '', category_id: '', supplier_id: '',
  product_type: 'consumable', unit: 'ml', cost_price: '', sell_price: '',
  opening_stock: 0, min_stock: 0, max_stock: 0, status: 'active', notes: '',
};

export default function InvProductsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = ['superadmin', 'admin', 'manager'].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState(user?.role === 'superadmin' ? '' : (user?.branch_id || ''));
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, b, c, s] = await Promise.all([
        api.get(`${INV_API}/products`, { params: { limit: 200, q: q || undefined, product_type: typeFilter || undefined, branchId: branchFilter || undefined } }),
        loadBranches(),
        api.get(`${INV_API}/categories`),
        api.get(`${INV_API}/suppliers`),
      ]);
      setRows(p.data?.data ?? []);
      setBranches(b);
      setCategories(c.data ?? []);
      setSuppliers(s.data ?? []);
    } catch { toast.error('Failed to load products'); }
    setLoading(false);
  }, [q, typeFilter, branchFilter, toast]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEdit(null);
    setForm({ ...EMPTY, branch_id: user?.branch_id || branchFilter || '' });
    setErr('');
    setShow(true);
  };
  const openEdit = (row) => {
    setEdit(row);
    setForm({
      ...EMPTY,
      ...row,
      category_id: row.category_id || '',
      supplier_id: row.supplier_id || '',
    });
    setErr('');
    setShow(true);
  };

  const save = async () => {
    if (!form.name) return setErr('Name is required');
    if (!edit && !form.branch_id && user?.role === 'superadmin') return setErr('Branch is required');
    setSaving(true);
    try {
      const payload = {
        ...form,
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        cost_price: form.cost_price === '' ? 0 : Number(form.cost_price),
        sell_price: form.sell_price === '' ? 0 : Number(form.sell_price),
        opening_stock: Number(form.opening_stock) || 0,
        min_stock: Number(form.min_stock) || 0,
        max_stock: Number(form.max_stock) || 0,
      };
      if (edit) await api.put(`${INV_API}/products/${edit.id}`, payload);
      else await api.post(`${INV_API}/products`, payload);
      setShow(false);
      toast.success(edit ? 'Product updated' : 'Product created');
      load();
    } catch (e) {
      setErr(e.response?.data?.message || 'Save failed');
    }
    setSaving(false);
  };

  const remove = async (id) => {
    if (!window.confirm('Deactivate this product?')) return;
    await api.delete(`${INV_API}/products/${id}`);
    load();
  };

  const columns = [
    {
      id: 'name', header: 'Product', accessorFn: (r) => r.name,
      cell: ({ row: { original: r } }) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          <div style={{ fontSize: 12, color: '#98A2B3' }}>{[r.sku, r.brand].filter(Boolean).join(' · ')}</div>
        </div>
      ),
    },
    {
      id: 'type', header: 'Type', accessorFn: (r) => r.product_type,
      cell: ({ row: { original: r } }) => (
        <span style={{
          padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
          color: typeColor[r.product_type] || '#475467',
          background: `${typeColor[r.product_type] || '#475467'}18`,
        }}>{r.product_type}</span>
      ),
    },
    { id: 'stock', header: 'Stock', accessorFn: (r) => r.current_stock,
      cell: ({ row: { original: r } }) => {
        const low = Number(r.current_stock) <= Number(r.min_stock);
        return <span style={{ fontWeight: 700, color: low ? '#DC2626' : '#101828' }}>{fmtQty(r.current_stock, r.unit)}{low ? ' ⚠' : ''}</span>;
      },
    },
    { id: 'cost', header: 'Cost', accessorFn: (r) => r.cost_price,
      cell: ({ row: { original: r } }) => `Rs. ${Number(r.cost_price || 0).toLocaleString()}` },
    { id: 'sell', header: 'Sell', accessorFn: (r) => r.sell_price,
      cell: ({ row: { original: r } }) => `Rs. ${Number(r.sell_price || 0).toLocaleString()}` },
    {
      id: 'actions', header: 'Actions', enableSorting: false,
      cell: ({ row: { original: r } }) => canEdit ? (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          <ActionBtn onClick={() => openEdit(r)} title="Edit" color="#D97706"><IconEdit /></ActionBtn>
          <ActionBtn onClick={() => remove(r.id)} title="Deactivate" color="#DC2626"><IconTrash /></ActionBtn>
        </div>
      ) : null,
    },
  ];

  return (
    <div>
      <FilterBar>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / SKU / barcode" style={{ minWidth: 220 }} />
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        {user?.role === 'superadmin' && (
          <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        {canEdit && <Button variant="primary" onClick={openAdd} style={{ marginLeft: 'auto' }}><IconPlus /> Add Product</Button>}
      </FilterBar>

      <DataTable columns={columns} data={rows} loading={loading} emptyMessage="No products yet" emptySub="Add shampoo, color, tools and more" />

      <Modal open={show} onClose={() => setShow(false)} title={edit ? 'Edit Product' : 'Add Product'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Save</Button></>}>
        {err && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: 10, borderRadius: 8, marginBottom: 12 }}>{err}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {!edit && user?.role === 'superadmin' && (
            <FormGroup label="Branch" required>
              <Select value={form.branch_id} onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))}>
                <option value="">Select</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </FormGroup>
          )}
          <FormGroup label="Product Name" required><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></FormGroup>
          <FormGroup label="SKU"><Input value={form.sku || ''} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} /></FormGroup>
          <FormGroup label="Barcode"><Input value={form.barcode || ''} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} /></FormGroup>
          <FormGroup label="Brand"><Input value={form.brand || ''} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} /></FormGroup>
          <FormGroup label="Category">
            <Select value={form.category_id || ''} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
              <option value="">None</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormGroup>
          <FormGroup label="Supplier">
            <Select value={form.supplier_id || ''} onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}>
              <option value="">None</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </FormGroup>
          <FormGroup label="Type">
            <Select value={form.product_type} onChange={(e) => setForm((f) => ({ ...f, product_type: e.target.value }))}>
              {PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </FormGroup>
          <FormGroup label="Unit">
            <Select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </FormGroup>
          <FormGroup label="Cost Price"><Input type="number" value={form.cost_price} onChange={(e) => setForm((f) => ({ ...f, cost_price: e.target.value }))} /></FormGroup>
          <FormGroup label="Selling Price"><Input type="number" value={form.sell_price} onChange={(e) => setForm((f) => ({ ...f, sell_price: e.target.value }))} /></FormGroup>
          {!edit && <FormGroup label="Opening Stock"><Input type="number" value={form.opening_stock} onChange={(e) => setForm((f) => ({ ...f, opening_stock: e.target.value }))} /></FormGroup>}
          <FormGroup label="Min Stock"><Input type="number" value={form.min_stock} onChange={(e) => setForm((f) => ({ ...f, min_stock: e.target.value }))} /></FormGroup>
          <FormGroup label="Max Stock"><Input type="number" value={form.max_stock} onChange={(e) => setForm((f) => ({ ...f, max_stock: e.target.value }))} /></FormGroup>
        </div>
      </Modal>
    </div>
  );
}
