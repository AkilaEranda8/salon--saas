import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import {
  IconTrash, IconPlus, IconDollar, IconCalendar,
  ActionBtn, StatCard,
  FilterBar, DataTable, StaffAvatar,
} from '../components/ui/PageKit';

const Rs    = n => `Rs. ${Number(n || 0).toLocaleString()}`;
const today = () => new Date().toISOString().slice(0, 10);
const curMo = () => new Date().toISOString().slice(0, 7);

const EMPTY_FORM = {
  staff_id: '', branch_id: '', amount: '', date: today(),
  month: curMo(), reason: '', status: 'pending',
};

export default function AdvancesPage() {
  const { user }   = useAuth();
  const canAdd     = ['superadmin', 'admin', 'manager'].includes(user?.role);
  const canDeduct  = ['superadmin', 'admin', 'manager'].includes(user?.role);
  const canDelete  = ['superadmin', 'admin'].includes(user?.role);

  const [items,    setItems]    = useState([]);
  const [staff,    setStaff]    = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filterMonth,  setFilterMonth]  = useState(curMo());
  const [filterBranch, setFilterBranch] = useState('');
  const [filterStaff,  setFilterStaff]  = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);
  const [formErr,  setFormErr]  = useState('');

  useEffect(() => {
    api.get('/staff',    { params: { limit: 200 } }).then(r => setStaff(Array.isArray(r.data) ? r.data : (r.data?.data ?? []))).catch(() => {});
    api.get('/branches', { params: { limit: 100 } }).then(r => setBranches(Array.isArray(r.data) ? r.data : (r.data?.data ?? []))).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterMonth)  params.month    = filterMonth;
      if (filterBranch) params.branchId = filterBranch;
      if (filterStaff)  params.staffId  = filterStaff;
      const res = await api.get('/advances', { params });
      const raw = res.data?.data ?? res.data ?? [];
      setItems(Array.isArray(raw) ? raw : []);
    } catch { setItems([]); }
    setLoading(false);
  }, [filterMonth, filterBranch, filterStaff]);
  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, branch_id: user?.branch_id || '' });
    setFormErr('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.staff_id || !form.amount || !form.date || !form.month) {
      return setFormErr('Staff, amount, date and month are required.');
    }
    setSaving(true);
    try {
      await api.post('/advances', form);
      setShowForm(false);
      load();
    } catch (e) { setFormErr(e.response?.data?.message || 'Save failed'); }
    setSaving(false);
  };

  const handleDeduct = async id => {
    if (!window.confirm('Mark this advance as deducted from commission?')) return;
    try { await api.patch(`/advances/${id}/deduct`); load(); } catch {}
  };

  const handleDelete = async id => {
    if (!window.confirm('Delete this advance record?')) return;
    try { await api.delete(`/advances/${id}`); load(); } catch {}
  };

  const totalPending  = items.filter(i => i.status === 'pending').reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalDeducted = items.filter(i => i.status === 'deducted').reduce((s, i) => s + Number(i.amount || 0), 0);

  const columns = [
    {
      id: 'date', header: 'Date', accessorFn: r => r.date, meta: { width: '11%' },
      cell: ({ row: { original: r } }) => <span style={{ fontSize: 13, color: '#475467' }}>{r.date ? new Date(r.date).toLocaleDateString() : ''}</span>,
    },
    {
      id: 'staff', header: 'Staff', accessorFn: r => r.staff?.name, meta: { width: '22%' },
      cell: ({ row: { original: r } }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StaffAvatar name={r.staff?.name || ''} />
          <div>
            <div style={{ fontWeight: 600, color: '#101828', fontSize: 14 }}>{r.staff?.name || '—'}</div>
            <div style={{ fontSize: 11, color: '#98A2B3' }}>{r.branch?.name || ''}</div>
          </div>
        </div>
      ),
    },
    {
      id: 'month', header: 'For Month', accessorFn: r => r.month, meta: { width: '13%' },
      cell: ({ row: { original: r } }) => {
        const [y, m] = (r.month || '').split('-');
        const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return <span style={{ fontSize: 13, color: '#475467' }}>{m ? `${mo[+m-1]} ${y}` : r.month}</span>;
      },
    },
    {
      id: 'amount', header: 'Amount', accessorFn: r => r.amount, meta: { width: '14%', align: 'right' },
      cell: ({ row: { original: r } }) => <span style={{ fontWeight: 700, color: '#D97706', fontFamily: "'Outfit',sans-serif", fontSize: 14 }}>{Rs(r.amount)}</span>,
    },
    {
      id: 'reason', header: 'Reason', accessorFn: r => r.reason, meta: { width: '22%' },
      cell: ({ row: { original: r } }) => <span style={{ fontSize: 13, color: '#475467' }}>{r.reason || '—'}</span>,
    },
    {
      id: 'status', header: 'Status', accessorFn: r => r.status, meta: { width: '10%' },
      cell: ({ row: { original: r } }) => r.status === 'deducted'
        ? <span style={{ padding: '3px 10px', borderRadius: 20, background: '#ECFDF5', color: '#059669', fontSize: 12, fontWeight: 700 }}>Deducted</span>
        : <span style={{ padding: '3px 10px', borderRadius: 20, background: '#FFFBEB', color: '#D97706', fontSize: 12, fontWeight: 700 }}>Pending</span>,
    },
    {
      id: 'actions', header: '', enableSorting: false, meta: { width: '8%', align: 'center' },
      cell: ({ row: { original: r } }) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          {canDeduct && r.status === 'pending' && (
            <ActionBtn onClick={() => handleDeduct(r.id)} title="Mark Deducted" color="#059669">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </ActionBtn>
          )}
          {canDelete && (
            <ActionBtn onClick={() => handleDelete(r.id)} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>
          )}
        </div>
      ),
    },
  ];

  const f = v => (e) => setForm(p => ({ ...p, [v]: e.target.value }));
  const inp = { padding: '8px 12px', borderRadius: 9, border: '1.5px solid #E4E7EC', fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', width: '100%', boxSizing: 'border-box', color: '#344054' };

  return (
    <PageWrapper title="Staff Advances" subtitle="Commission advance salary records"
      actions={canAdd && (
        <Button variant="primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconPlus /> Add Advance
        </Button>
      )}>

      {/* Stat Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Pending Advances"  value={Rs(totalPending)}  color="#D97706" icon={<IconDollar />} />
        <StatCard label="Deducted"          value={Rs(totalDeducted)} color="#059669" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>} />
        <StatCard label="Total Records"     value={items.length}      color="#2563EB" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>} />
      </div>

      {/* Filters */}
      <FilterBar>
        <span style={{ color: '#98A2B3', display: 'flex' }}><IconCalendar /></span>
        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 9, border: '1.5px solid #E4E7EC', fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', color: '#344054' }}
          onFocus={e => e.target.style.borderColor = '#2563EB'} onBlur={e => e.target.style.borderColor = '#E4E7EC'} />
        <select value={filterStaff} onChange={e => setFilterStaff(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 9, border: '1.5px solid #E4E7EC', fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', color: '#344054', background: '#fff' }}>
          <option value="">All Staff</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {['superadmin', 'admin'].includes(user?.role) && (
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 9, border: '1.5px solid #E4E7EC', fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', color: '#344054', background: '#fff' }}>
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </FilterBar>

      <DataTable columns={columns} data={items} loading={loading}
        emptyMessage="No advances for this period"
        emptySub="Add an advance using the button above"
        footerRows={items.length > 0 ? (
          <tr style={{ background: '#F9FAFB', borderTop: '2px solid #EAECF0' }}>
            <td colSpan={3} style={{ padding: '13px 16px' }}><span style={{ fontWeight: 700, color: '#101828', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Totals</span></td>
            <td style={{ padding: '13px 16px', textAlign: 'right' }}><span style={{ fontWeight: 800, color: '#D97706', fontFamily: "'Outfit',sans-serif" }}>{Rs(totalPending + totalDeducted)}</span></td>
            <td colSpan={3} />
          </tr>
        ) : null}
      />

      {/* Add Advance Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Staff Advance" size="md"
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSave}>Save Advance</Button></>}>
        {formErr && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '9px 14px', borderRadius: 9, fontSize: 13, marginBottom: 14, border: '1px solid #FEE2E2' }}>{formErr}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormGroup label="Staff Member" required>
            <Select value={form.staff_id} onChange={e => setForm(p => ({ ...p, staff_id: e.target.value }))}>
              <option value="">Select staff</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </FormGroup>
          {['superadmin', 'admin'].includes(user?.role) && (
            <FormGroup label="Branch">
              <Select value={form.branch_id} onChange={e => setForm(p => ({ ...p, branch_id: e.target.value }))}>
                <option value="">Select branch</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </FormGroup>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormGroup label="Amount (Rs.)" required>
              <Input type="number" min="0" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
            </FormGroup>
            <FormGroup label="Date" required>
              <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            </FormGroup>
          </div>
          <FormGroup label="Deduction Month" required>
            <Input type="month" value={form.month} onChange={e => setForm(p => ({ ...p, month: e.target.value }))} />
            <span style={{ fontSize: 11, color: '#98A2B3', marginTop: 4, display: 'block' }}>Commission month this advance will be deducted from</span>
          </FormGroup>
          <FormGroup label="Reason">
            <Input value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="e.g. Emergency advance" />
          </FormGroup>
        </div>
      </Modal>
    </PageWrapper>
  );
}
