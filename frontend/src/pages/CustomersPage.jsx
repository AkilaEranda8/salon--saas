import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import {
  IconEye, IconEdit, IconTrash, IconPlus, IconUsers,
  StaffAvatar, ActionBtn, StatCard, Drawer, PKModal as Modal,
  FilterBar, SearchBar, DataTable,
} from '../components/ui/PageKit';

const TIER       = pts => pts >= 500 ? 'Gold' : pts >= 200 ? 'Silver' : 'Bronze';
const TIER_COLOR = { Gold: '#D97706', Silver: '#64748B', Bronze: '#92400E' };
const TIER_BG    = { Gold: '#FFFBEB', Silver: '#F8FAFC', Bronze: '#FEF9F0' };
const EMPTY      = { name: '', phone: '', email: '', branch_id: '' };

function LoyaltyBar({ pts }) {
  const tier = TIER(pts);
  const next = tier === 'Bronze' ? 200 : tier === 'Silver' ? 500 : null;
  const prev = tier === 'Bronze' ? 0   : tier === 'Silver' ? 200 : 500;
  const pct  = next ? Math.min(100, ((pts - prev) / (next - prev)) * 100) : 100;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ padding: '2px 8px', borderRadius: 6, background: TIER_BG[tier], color: TIER_COLOR[tier], fontWeight: 700, fontSize: 11 }}>{tier}</span>
        <span style={{ fontSize: 11, color: '#98A2B3' }}>{pts} pts{next ? ` / ${next}` : ''}</span>
      </div>
      <div style={{ height: 5, background: '#F1F5F9', borderRadius: 6 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: TIER_COLOR[tier], borderRadius: 6, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const { user } = useAuth();
  const canEdit      = ['superadmin', 'admin', 'manager', 'staff'].includes(user?.role);
  const isSuperAdmin = user?.role === 'superadmin';

  const [customers, setCustomers]   = useState([]);
  const [branches, setBranches]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filterBranch, setFilterBranch] = useState(isSuperAdmin ? '' : user?.branch_id || '');
  const [search, setSearch]         = useState('');
  const [showForm, setShowForm]     = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [editItem, setEditItem]     = useState(null);
  const [profileItem, setProfileItem] = useState(null);
  const [form, setForm]             = useState(EMPTY);
  const [saving, setSaving]         = useState(false);
  const [formErr, setFormErr]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cuR, brR] = await Promise.all([
        api.get('/customers', { params: { limit: 200, ...(filterBranch ? { branchId: filterBranch } : {}) } }),
        api.get('/branches',  { params: { limit: 100 } }),
      ]);
      setCustomers(Array.isArray(cuR.data) ? cuR.data : (cuR.data?.data ?? []));
      setBranches(Array.isArray(brR.data)  ? brR.data  : (brR.data?.data  ?? []));
    } catch { }
    setLoading(false);
  }, [filterBranch]);
  useEffect(() => { load(); }, [load]);

  const openAdd     = () => { setEditItem(null); setForm({ ...EMPTY, branch_id: user?.branch_id || '' }); setFormErr(''); setShowForm(true); };
  const openEdit    = row => { setEditItem(row); setForm({ name: row.name, phone: row.phone, email: row.email || '', branch_id: row.branch_id || '' }); setFormErr(''); setShowForm(true); };
  const openProfile = row => { setProfileItem(row); setShowProfile(true); };

  const handleSave = async () => {
    if (!form.name || !form.phone) return setFormErr('Name and phone are required');
    setSaving(true);
    try {
      editItem ? await api.put(`/customers/${editItem.id}`, form) : await api.post('/customers', form);
      setShowForm(false); load();
    } catch (e) { setFormErr(e.response?.data?.message || 'Save failed'); }
    setSaving(false);
  };

  const handleDelete = async id => {
    if (!window.confirm('Delete this customer?')) return;
    await api.delete(`/customers/${id}`); load();
  };

  const tierCounts = { Gold: 0, Silver: 0, Bronze: 0 };
  customers.forEach(c => { tierCounts[TIER(c.loyalty_points || 0)]++; });

  const displayed = customers.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q);
  });

  const p = profileItem;

  const columns = [
    {
      id: 'name',
      header: 'Customer',
      accessorFn: row => row.name,
      meta: { width: '22%' },
      cell: ({ row: { original: row } }) => {
        const tier = TIER(row.loyalty_points || 0);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: TIER_COLOR[tier], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
              {row.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#101828', fontSize: 14 }}>{row.name}</div>
              <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 1 }}>{row.phone}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'loyalty',
      header: 'Loyalty',
      accessorFn: row => row.loyalty_points,
      meta: { width: '22%' },
      cell: ({ row: { original: row } }) => <div style={{ minWidth: 120 }}><LoyaltyBar pts={row.loyalty_points || 0} /></div>,
    },
    {
      id: 'visits',
      header: 'Visits',
      accessorFn: row => row.visits,
      meta: { width: '10%', align: 'center' },
      cell: ({ row: { original: row } }) => <span style={{ fontWeight: 700, color: '#101828' }}>{row.visits || 0}</span>,
    },
    {
      id: 'spent',
      header: 'Total Spent',
      accessorFn: row => row.total_spent,
      meta: { width: '15%', align: 'right' },
      cell: ({ row: { original: row } }) => <span style={{ fontWeight: 700, color: '#2563EB' }}>Rs. {Number(row.total_spent || 0).toLocaleString()}</span>,
    },
    {
      id: 'last_visit',
      header: 'Last Visit',
      accessorFn: row => row.last_visit,
      meta: { width: '15%' },
      cell: ({ row: { original: row } }) => <span style={{ fontSize: 12, color: '#98A2B3' }}>{row.last_visit ? new Date(row.last_visit).toLocaleDateString() : 'Never'}</span>,
    },
    {
      id: 'branch',
      header: 'Branch',
      accessorFn: row => row.branch?.name,
      meta: { width: '8%' },
      cell: ({ row: { original: row } }) => <span style={{ fontSize: 13, color: '#475467' }}>{row.branch?.name || ''}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: { width: '8%', align: 'center' },
      cell: ({ row: { original: row } }) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          <ActionBtn onClick={() => openProfile(row)} title="View Profile" color="#2563EB"><IconEye /></ActionBtn>
          {canEdit && <ActionBtn onClick={() => openEdit(row)} title="Edit" color="#D97706"><IconEdit /></ActionBtn>}
          {canEdit && <ActionBtn onClick={() => handleDelete(row.id)} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>}
        </div>
      ),
    },
  ];

  return (
    <PageWrapper title="Customers" subtitle={`${customers.length} customers registered`}
      actions={canEdit && <Button variant="primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconPlus /> Add Customer</Button>}>

      {/* Stat Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Total Customers" value={customers.length} color="#2563EB" icon={<IconUsers />} />
        <StatCard label="Gold Members"   value={tierCounts.Gold}   color="#D97706" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>} />
        <StatCard label="Silver Members" value={tierCounts.Silver} color="#64748B" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>} />
        <StatCard label="Bronze Members" value={tierCounts.Bronze} color="#92400E" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>} />
      </div>

      {/* Filter Bar */}
      <FilterBar>
        <SearchBar value={search} onChange={setSearch} placeholder="Search customers" />
        {isSuperAdmin && (
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 9, border: '1.5px solid #E4E7EC', fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', color: '#344054', background: '#fff' }}>
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </FilterBar>

      {/* Table */}
      <DataTable
        columns={columns}
        data={displayed}
        loading={loading}
        emptyMessage="No customers found"
        emptySub="Try adjusting your search or add a new customer"
      />

      {/* Add / Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editItem ? 'Edit Customer' : 'Add Customer'} size="sm"
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSave}>{editItem ? 'Save' : 'Add Customer'}</Button></>}>
        {formErr && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '9px 13px', borderRadius: 9, marginBottom: 16, fontSize: 13, border: '1px solid #FEE2E2' }}>{formErr}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormGroup label="Full Name" required><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" /></FormGroup>
          <FormGroup label="Phone" required><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="07X XXX XXXX" /></FormGroup>
          <FormGroup label="Email"><Input type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></FormGroup>
          <FormGroup label="Branch">
            <Select value={form.branch_id || ''} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}>
              <option value="">Select branch</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </FormGroup>
        </div>
      </Modal>

      {/* Profile Drawer */}
      <Drawer open={showProfile} onClose={() => setShowProfile(false)} title="Customer Profile"
        footer={canEdit && <Button variant="primary" onClick={() => { setShowProfile(false); openEdit(p); }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconEdit /> Edit Customer</Button>}>
        {p && (
          <div style={{ fontFamily: "'Inter',sans-serif" }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, padding: 16, background: '#F9FAFB', borderRadius: 12 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: TIER_COLOR[TIER(p.loyalty_points || 0)], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 20, flexShrink: 0 }}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#101828' }}>{p.name}</div>
                <div style={{ fontSize: 13, color: '#667085', marginTop: 2 }}>{p.phone}</div>
                {p.email && <div style={{ fontSize: 13, color: '#667085' }}>{p.email}</div>}
              </div>
            </div>
            <LoyaltyBar pts={p.loyalty_points || 0} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
              {[
                { label: 'Visits',      value: p.visits || 0,                                          color: '#2563EB', bg: '#EFF6FF' },
                { label: 'Total Spent', value: `Rs. ${Number(p.total_spent || 0).toLocaleString()}`,   color: '#059669', bg: '#ECFDF5' },
                { label: 'Loyalty Pts', value: p.loyalty_points || 0,                                   color: '#D97706', bg: '#FFFBEB' },
                { label: 'Last Visit',  value: p.last_visit ? new Date(p.last_visit).toLocaleDateString() : 'Never', color: '#64748B', bg: '#F8FAFC' },
              ].map(({ label, value, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: 11, color: '#98A2B3', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            {p.branch?.name && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: '#F9FAFB', borderRadius: 10, fontSize: 13, color: '#475467' }}>
                Branch: <strong>{p.branch.name}</strong>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </PageWrapper>
  );
}
