import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import { useToast } from '../components/ui/Toast';
import { PKModal as Modal, DataTable, ActionBtn } from '../components/ui/PageKit';

const EMPTY = {
  branch_id: '',
  name: '',
  code: '',
  discount_type: 'percent',
  value: '',
  min_bill: '0',
  max_discount_amount: '',
  starts_at: '',
  ends_at: '',
  is_active: true,
};

export default function DiscountsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = ['superadmin', 'admin', 'manager'].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dR, bR] = await Promise.allSettled([
        api.get('/discounts', { params: { limit: 200 } }),
        api.get('/branches', { params: { limit: 100 } }),
      ]);
      if (dR.status === 'fulfilled') {
        const body = dR.value.data;
        setRows(Array.isArray(body?.data) ? body.data : []);
      }
      if (bR.status === 'fulfilled') {
        const body = bR.value.data;
        setBranches(Array.isArray(body?.data) ? body.data : (Array.isArray(body) ? body : []));
      }
    } catch (_) { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditId(null);
    setForm({
      ...EMPTY,
      branch_id: user?.branchId ? String(user.branchId) : '',
    });
    setErr('');
    setShowForm(true);
  };

  const openEdit = (row) => {
    setEditId(row.id);
    setForm({
      branch_id: row.branch_id != null ? String(row.branch_id) : '',
      name: row.name || '',
      code: row.code || '',
      discount_type: row.discount_type || 'percent',
      value: String(row.value ?? ''),
      min_bill: String(row.min_bill ?? '0'),
      max_discount_amount: row.max_discount_amount != null ? String(row.max_discount_amount) : '',
      starts_at: row.starts_at ? String(row.starts_at).slice(0, 10) : '',
      ends_at: row.ends_at ? String(row.ends_at).slice(0, 10) : '',
      is_active: row.is_active !== false,
    });
    setErr('');
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim() || form.value === '') {
      setErr('Name and value are required.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const payload = {
        branch_id: form.branch_id || null,
        name: form.name.trim(),
        code: form.code.trim() || null,
        discount_type: form.discount_type,
        value: Number(form.value),
        min_bill: Number(form.min_bill || 0),
        max_discount_amount: form.max_discount_amount === '' ? null : Number(form.max_discount_amount),
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        is_active: form.is_active,
      };
      if (editId) {
        await api.put(`/discounts/${editId}`, payload);
        toast('Discount updated', 'success');
      } else {
        await api.post('/discounts', payload);
        toast('Discount created', 'success');
      }
      setShowForm(false);
      load();
    } catch (e) {
      setErr(e.response?.data?.message || 'Save failed');
    }
    setSaving(false);
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete “${row.name}”?`)) return;
    try {
      await api.delete(`/discounts/${row.id}`);
      toast('Deleted', 'success');
      load();
    } catch (e) {
      toast(e.response?.data?.message || 'Delete failed', 'error');
    }
  };

  return (
    <PageWrapper title="Discounts" subtitle="Promo rules for payments (percent or fixed LKR). Leave branch empty for all branches.">
      {canEdit && (
        <div style={{ marginBottom: 16 }}>
          <Button variant="primary" onClick={openNew}>Add discount</Button>
        </div>
      )}

      <DataTable
        loading={loading}
        data={rows}
        emptyMessage="No discounts yet"
        emptySub="Create one to show in Record Payment on web and staff app."
        columns={[
          { accessorKey: 'name', header: 'Name' },
          { id: 'branch', header: 'Branch', cell: ({ row }) => (
            <span style={{ fontSize: 13, color: '#475467' }}>
              {row.original.branch?.name || (row.original.branch_id == null ? 'All branches' : '—')}
            </span>
          ) },
          { id: 'rule', header: 'Rule', cell: ({ row }) => {
            const r = row.original;
            return (
              <span style={{ fontWeight: 600, fontSize: 13 }}>
                {r.discount_type === 'fixed' ? `Rs. ${Number(r.value).toLocaleString()}` : `${r.value}% off`}
              </span>
            );
          } },
          { id: 'dates', header: 'Valid', cell: ({ row }) => {
            const r = row.original;
            const a = r.starts_at ? String(r.starts_at).slice(0, 10) : '—';
            const b = r.ends_at ? String(r.ends_at).slice(0, 10) : '—';
            return <span style={{ fontSize: 12, color: '#667085' }}>{a} → {b}</span>;
          } },
          { id: 'active', header: 'Active', cell: ({ row }) => (
            <span style={{ fontSize: 12, fontWeight: 600, color: row.original.is_active ? '#059669' : '#98A2B3' }}>
              {row.original.is_active ? 'Yes' : 'No'}
            </span>
          ) },
          ...(canEdit ? [{
            id: 'act',
            header: '',
            meta: { align: 'right' },
            cell: ({ row }) => (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <ActionBtn onClick={() => openEdit(row.original)} color="#2563EB">Edit</ActionBtn>
                <ActionBtn onClick={() => remove(row.original)} color="#DC2626">Delete</ActionBtn>
              </div>
            ),
          }] : []),
        ]}
      />

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? 'Edit discount' : 'New discount'} size="md"
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={save}>Save</Button>
          </div>
        }>
        {err && (
          <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
            {err}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FormGroup label="Branch (empty = all branches)">
            <Select value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}>
              <option value="">All branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </FormGroup>
          <FormGroup label="Name" required>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Weekend 10%" />
          </FormGroup>
          <FormGroup label="Code (optional)">
            <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="WEEKEND10" />
          </FormGroup>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormGroup label="Type">
              <Select value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))}>
                <option value="percent">Percent</option>
                <option value="fixed">Fixed (LKR)</option>
              </Select>
            </FormGroup>
            <FormGroup label={form.discount_type === 'fixed' ? 'Amount (Rs.)' : 'Percent (0–100)'} required>
              <Input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
            </FormGroup>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormGroup label="Min. bill (Rs.)">
              <Input type="number" value={form.min_bill} onChange={e => setForm(f => ({ ...f, min_bill: e.target.value }))} />
            </FormGroup>
            <FormGroup label="Max cap (Rs., percent only)">
              <Input type="number" value={form.max_discount_amount} onChange={e => setForm(f => ({ ...f, max_discount_amount: e.target.value }))} placeholder="Optional" />
            </FormGroup>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormGroup label="Starts">
              <Input type="date" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} />
            </FormGroup>
            <FormGroup label="Ends">
              <Input type="date" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} />
            </FormGroup>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            Active
          </label>
        </div>
      </Modal>
    </PageWrapper>
  );
}
