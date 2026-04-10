import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import { useToast } from '../components/ui/Toast';
import {
  IconPlus, IconEdit, IconTrash, IconTag,
  ActionBtn, StatCard, PKModal as Modal,
  FilterBar, SearchBar, DataTable,
} from '../components/ui/PageKit';

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

function getStatus(row) {
  const today = new Date().toISOString().slice(0, 10);
  if (!row.is_active) return 'inactive';
  if (row.starts_at && String(row.starts_at).slice(0, 10) > today) return 'upcoming';
  if (row.ends_at   && String(row.ends_at).slice(0, 10) < today)   return 'expired';
  return 'active';
}

const STATUS_STYLE = {
  active:   { bg: '#ECFDF5', color: '#059669', label: 'Active' },
  inactive: { bg: '#F2F4F7', color: '#667085', label: 'Inactive' },
  upcoming: { bg: '#FFFBEB', color: '#D97706', label: 'Upcoming' },
  expired:  { bg: '#F2F4F7', color: '#98A2B3', label: 'Expired' },
};
const TYPE_STYLE = {
  percent: { bg: '#EFF6FF', color: '#2563EB', label: '% Percent' },
  fixed:   { bg: '#F5F3FF', color: '#7C3AED', label: 'Rs. Fixed' },
};

export default function DiscountsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = ['superadmin', 'admin', 'manager'].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('All');
  const [search, setSearch] = useState('');
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
    setForm({ ...EMPTY, branch_id: user?.branchId ? String(user.branchId) : '' });
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
    if (!form.name.trim() || form.value === '') { setErr('Name and value are required.'); return; }
    setSaving(true); setErr('');
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
      setShowForm(false); load();
    } catch (e) { setErr(e.response?.data?.message || 'Save failed'); }
    setSaving(false);
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.name}"?`)) return;
    try {
      await api.delete(`/discounts/${row.id}`);
      toast('Deleted', 'success'); load();
    } catch (e) { toast(e.response?.data?.message || 'Delete failed', 'error'); }
  };

  const totalActive  = rows.filter(r => getStatus(r) === 'active').length;
  const totalPercent = rows.filter(r => r.discount_type === 'percent').length;
  const totalFixed   = rows.filter(r => r.discount_type === 'fixed').length;
  const totalExpired = rows.filter(r => getStatus(r) === 'expired').length;

  const STATUS_TABS = ['All', 'Active', 'Upcoming', 'Expired', 'Inactive'];
  const displayed = rows.filter(r => {
    const s = getStatus(r);
    if (filterStatus !== 'All' && s !== filterStatus.toLowerCase()) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name?.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q);
  });

  const columns = [
    {
      id: 'name',
      header: 'Discount',
      accessorFn: r => r.name,
      cell: ({ row: { original: r } }) => (
        <div>
          <div style={{ fontWeight: 600, color: '#101828', fontSize: 14 }}>{r.name}</div>
          {r.code && (
            <span style={{ display: 'inline-block', marginTop: 3, padding: '1px 8px', borderRadius: 10, background: '#F2F4F7', color: '#475467', fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>
              {r.code}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      meta: { width: '10%' },
      cell: ({ row: { original: r } }) => {
        const t = TYPE_STYLE[r.discount_type] || TYPE_STYLE.percent;
        return (
          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: t.bg, color: t.color }}>
            {t.label}
          </span>
        );
      },
    },
    {
      id: 'rule',
      header: 'Value',
      meta: { width: '10%' },
      cell: ({ row: { original: r } }) => (
        <span style={{ fontWeight: 700, fontSize: 15, color: r.discount_type === 'fixed' ? '#7C3AED' : '#2563EB' }}>
          {r.discount_type === 'fixed' ? `Rs. ${Number(r.value).toLocaleString()}` : `${r.value}%`}
        </span>
      ),
    },
    {
      id: 'branch',
      header: 'Branch',
      meta: { width: '14%' },
      cell: ({ row: { original: r } }) => (
        <span style={{ fontSize: 13, color: '#475467' }}>
          {r.branch?.name || (r.branch_id == null ? 'All branches' : '—')}
        </span>
      ),
    },
    {
      id: 'validity',
      header: 'Validity',
      meta: { width: '18%' },
      cell: ({ row: { original: r } }) => {
        const a = r.starts_at ? String(r.starts_at).slice(0, 10) : null;
        const b = r.ends_at   ? String(r.ends_at).slice(0, 10)   : null;
        if (!a && !b) return <span style={{ fontSize: 12, color: '#98A2B3' }}>No limit</span>;
        return (
          <div style={{ fontSize: 12, color: '#475467', lineHeight: 1.5 }}>
            {a && <div>From: {a}</div>}
            {b && <div>To: {b}</div>}
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      meta: { width: '11%' },
      cell: ({ row: { original: r } }) => {
        const s = STATUS_STYLE[getStatus(r)];
        return (
          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: s.bg, color: s.color }}>
            {s.label}
          </span>
        );
      },
    },
    ...(canEdit ? [{
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { width: '9%', align: 'center' },
      cell: ({ row: { original: r } }) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          <ActionBtn onClick={() => openEdit(r)} title="Edit" color="#D97706"><IconEdit /></ActionBtn>
          <ActionBtn onClick={() => remove(r)} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>
        </div>
      ),
    }] : []),
  ];

  return (
    <PageWrapper
      title="Discounts"
      subtitle="Manage promo codes and discount rules for payments"
      actions={canEdit && (
        <Button variant="primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconPlus /> Add Discount
        </Button>
      )}
    >
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Total Discounts" value={rows.length} color="#2563EB" icon={<IconTag />} />
        <StatCard label="Active Now" value={totalActive} color="#059669"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>} />
        <StatCard label="Percent Off" value={totalPercent} color="#2563EB"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>} />
        <StatCard label="Fixed Amount" value={totalFixed} color="#7C3AED"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>} />
        {totalExpired > 0 && (
          <StatCard label="Expired" value={totalExpired} color="#98A2B3"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>} />
        )}
      </div>

      <FilterBar>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name or code..." />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUS_TABS.map(tab => {
            const active = filterStatus === tab;
            return (
              <button key={tab} onClick={() => setFilterStatus(tab)}
                style={{ padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${active ? '#2563EB' : '#E4E7EC'}`, background: active ? '#EFF6FF' : '#fff', color: active ? '#2563EB' : '#667085', fontWeight: active ? 700 : 500, fontSize: 12, cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>
                {tab}
              </button>
            );
          })}
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        data={displayed}
        loading={loading}
        emptyMessage="No discounts found"
        emptySub="Create a discount to offer promo deals in the payment screen"
      />

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editId ? 'Edit Discount' : 'Add Discount'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={save}>{editId ? 'Save Changes' : 'Add Discount'}</Button>
          </>
        }
      >
        {err && (
          <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '9px 13px', borderRadius: 9, marginBottom: 16, fontSize: 13, border: '1px solid #FEE2E2' }}>
            {err}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormGroup label="Discount Name" required>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Weekend 10%" />
            </FormGroup>
            <FormGroup label="Promo Code">
              <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="WEEKEND10" />
            </FormGroup>
          </div>
          <FormGroup label="Branch">
            <Select value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}>
              <option value="">All branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </FormGroup>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormGroup label="Type">
              <Select value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))}>
                <option value="percent">Percent (%)</option>
                <option value="fixed">Fixed Amount (Rs.)</option>
              </Select>
            </FormGroup>
            <FormGroup label={form.discount_type === 'fixed' ? 'Amount (Rs.)' : 'Percentage (0-100)'} required>
              <Input type="number" value={form.value} min="0" onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                placeholder={form.discount_type === 'fixed' ? '500' : '10'} />
            </FormGroup>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormGroup label="Min. Bill (Rs.)">
              <Input type="number" value={form.min_bill} min="0" onChange={e => setForm(f => ({ ...f, min_bill: e.target.value }))} placeholder="0" />
            </FormGroup>
            <FormGroup label="Max Cap (Rs.)">
              <Input type="number" value={form.max_discount_amount} min="0" onChange={e => setForm(f => ({ ...f, max_discount_amount: e.target.value }))} placeholder="Optional" />
            </FormGroup>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormGroup label="Start Date">
              <Input type="date" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} />
            </FormGroup>
            <FormGroup label="End Date">
              <Input type="date" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} />
            </FormGroup>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer', padding: '10px 14px', borderRadius: 10, background: form.is_active ? '#ECFDF5' : '#F9FAFB', border: `1.5px solid ${form.is_active ? '#D1FAE5' : '#E4E7EC'}`, userSelect: 'none' }}>
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: '#059669', cursor: 'pointer' }} />
            <span style={{ fontWeight: 600, color: form.is_active ? '#059669' : '#667085' }}>
              {form.is_active ? 'Active - will appear in payment screen' : 'Inactive - hidden from payment screen'}
            </span>
          </label>
        </div>
      </Modal>
    </PageWrapper>
  );
}