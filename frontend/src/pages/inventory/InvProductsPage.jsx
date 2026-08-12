import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { Input, Select, FormGroup } from '../../components/ui/FormElements';
import { useToast } from '../../components/ui/Toast';
import { ActionBtn, DataTable, FilterBar, IconEdit, IconPlus, IconTrash, PKModal as Modal } from '../../components/ui/PageKit';
import { INV_API, PRODUCT_TYPES, UNITS, fmtQty, typeColor, useInvBranch } from './invApi';

const EMPTY = {
  name: '', sku: '', brand: '',
  product_type: 'consumable', unit: 'ml', cost_price: '',
  opening_stock: 0, min_stock: 0, status: 'active',
};

export default function InvProductsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = ['superadmin', 'admin', 'manager'].includes(user?.role);
  const { branches, branchId, setBranchId, multiBranch, ready } = useInvBranch();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const r = await api.get(`${INV_API}/products`, {
        params: {
          limit: 200,
          q: q || undefined,
          product_type: typeFilter || undefined,
          branchId: branchId || undefined,
          lowStock: lowOnly ? 'true' : undefined,
        },
      });
      setRows(r.data?.data ?? []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load products');
    }
    setLoading(false);
  }, [ready, q, typeFilter, branchId, lowOnly, toast]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEdit(null);
    setForm(EMPTY);
    setErr('');
    setShow(true);
  };

  const openEdit = (row) => {
    setEdit(row);
    setForm({ ...EMPTY, ...row });
    setErr('');
    setShow(true);
  };

  const save = async () => {
    if (!form.name.trim()) return setErr('Product name is required');
    setSaving(true);
    try {
      const payload = {
        branch_id: branchId || undefined,
        name: form.name.trim(),
        sku: form.sku || null,
        brand: form.brand || null,
        product_type: form.product_type,
        unit: form.unit,
        cost_price: form.cost_price === '' ? 0 : Number(form.cost_price),
        min_stock: Number(form.min_stock) || 0,
        status: form.status,
      };
      if (edit) {
        await api.put(`${INV_API}/products/${edit.id}`, payload);
      } else {
        await api.post(`${INV_API}/products`, { ...payload, opening_stock: Number(form.opening_stock) || 0 });
      }
      setShow(false);
      toast.success(edit ? 'Product updated' : 'Product added with opening stock');
      load();
    } catch (e) {
      setErr(e.response?.data?.message || 'Save failed');
    }
    setSaving(false);
  };

  const remove = async (id) => {
    if (!window.confirm('Deactivate this product?')) return;
    try {
      await api.delete(`${INV_API}/products/${id}`);
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
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
          padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
          color: typeColor[r.product_type] || '#475467',
          background: `${typeColor[r.product_type] || '#475467'}18`,
        }}>{r.product_type}</span>
      ),
    },
    {
      id: 'stock', header: 'In Stock', accessorFn: (r) => Number(r.current_stock),
      cell: ({ row: { original: r } }) => {
        const low = Number(r.current_stock) <= Number(r.min_stock);
        return (
          <span style={{ fontWeight: 700, color: low ? '#DC2626' : '#101828' }}>
            {fmtQty(r.current_stock, r.unit)}{low ? ' ⚠' : ''}
          </span>
        );
      },
    },
    { id: 'min', header: 'Min', accessorFn: (r) => fmtQty(r.min_stock, r.unit) },
    {
      id: 'cost', header: 'Cost', accessorFn: (r) => Number(r.cost_price || 0),
      cell: ({ row: { original: r } }) => `Rs. ${Number(r.cost_price || 0).toLocaleString()}`,
    },
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
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / SKU" style={{ minWidth: 220 }} />
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        {multiBranch && (
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <Button variant={lowOnly ? 'primary' : 'secondary'} onClick={() => setLowOnly((v) => !v)}>
          Low stock only
        </Button>
        {canEdit && <Button variant="primary" onClick={openAdd} style={{ marginLeft: 'auto' }}><IconPlus /> Add Product</Button>}
      </FilterBar>

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        emptyMessage={lowOnly ? 'Nothing is running low' : 'No products yet'}
        emptySub={lowOnly ? 'Every product is above its minimum level' : 'Add a product with its opening stock to start tracking'}
      />

      <Modal
        open={show}
        onClose={() => setShow(false)}
        title={edit ? 'Edit Product' : 'Add Product'}
        footer={<><Button variant="secondary" onClick={() => setShow(false)}>Cancel</Button><Button variant="primary" loading={saving} disabled={!form.name?.trim()} onClick={save}>Save</Button></>}
      >
        {err && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: 10, borderRadius: 8, marginBottom: 12 }}>{err}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormGroup label="Product Name" required>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Shampoo 1L" />
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
          <FormGroup label="Cost Price">
            <Input type="number" value={form.cost_price} onChange={(e) => setForm((f) => ({ ...f, cost_price: e.target.value }))} />
          </FormGroup>
          {!edit && (
            <FormGroup label="Opening Stock">
              <Input type="number" value={form.opening_stock} onChange={(e) => setForm((f) => ({ ...f, opening_stock: e.target.value }))} />
            </FormGroup>
          )}
          <FormGroup label="Low Stock Alert At">
            <Input type="number" value={form.min_stock} onChange={(e) => setForm((f) => ({ ...f, min_stock: e.target.value }))} />
          </FormGroup>
          <FormGroup label="SKU">
            <Input value={form.sku || ''} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
          </FormGroup>
          <FormGroup label="Brand">
            <Input value={form.brand || ''} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} />
          </FormGroup>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--app-text-muted, #98A2B3)' }}>
          Only Consumable products can be recorded as usage. Equipment is tracked for stock but never consumed.
        </div>
      </Modal>
    </div>
  );
}
