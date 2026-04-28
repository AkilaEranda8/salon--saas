import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import PageWrapper from '../components/layout/PageWrapper';
import {
  StatCard, FilterBar, DataTable,
  StaffAvatar, IconDollar, IconUsers, IconReceipt, IconPlus,
  ActionBtn, PKModal as Modal,
} from '../components/ui/PageKit';

const Rs     = n => `Rs. ${Number(n || 0).toLocaleString()}`;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const today  = () => new Date().toISOString().slice(0, 10);

const PAYOUT_EMPTY = { amount: '', date: today(), notes: '' };

export default function CommissionPage() {
  const { user } = useAuth();
  const isAdminRole  = ['superadmin','admin','manager','staff'].includes(user?.role);
  const canEmailPdfs = ['superadmin','admin','manager'].includes(user?.role);
  const canPay       = ['superadmin','admin','manager'].includes(user?.role);
  const now = new Date();
  const [month,    setMonth]    = useState(now.getMonth() + 1);
  const [year,     setYear]     = useState(now.getFullYear());
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);
  const [data,     setData]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg,  setEmailMsg]  = useState('');

  // Record Payment modal
  const [payRow,    setPayRow]    = useState(null);
  const [payForm,   setPayForm]   = useState(PAYOUT_EMPTY);
  const [payErr,    setPayErr]    = useState('');
  const [paySaving, setPaySaving] = useState(false);

  useEffect(() => {
    if (isAdminRole) {
      api.get('/branches').then(r => setBranches(Array.isArray(r.data) ? r.data : (r.data?.data ?? []))).catch(() => {});
    }
  }, [isAdminRole]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { month, year };
      if (branchId) params.branchId = branchId;
      const res = await api.get('/staff/commission', { params });
      setData(Array.isArray(res.data) ? res.data : []);
    } catch { setData([]); }
    setLoading(false);
  }, [month, year, branchId]);
  useEffect(() => { load(); }, [load]);

  const totalComm     = data.reduce((s, r) => s + Number(r.totalCommission || 0), 0);
  const totalRev      = data.reduce((s, r) => s + Number(r.totalRevenue    || 0), 0);
  const totalAppts    = data.reduce((s, r) => s + Number(r.appointmentCount || 0), 0);
  const totalAdvances = data.reduce((s, r) => s + Number(r.totalAdvances   || 0), 0);
  const totalPaid     = data.reduce((s, r) => s + Number(r.totalPaid       || 0), 0);
  const totalBalance  = data.reduce((s, r) => s + Number(r.balanceDue      || 0), 0);

  const sendStaffPdfs = async () => {
    if (!window.confirm(`Email PDF earnings reports for ${MONTHS[month - 1]} ${year} to each staff member who has an email?`)) return;
    setEmailBusy(true); setEmailMsg('');
    try {
      const res = await api.post('/notifications/staff-monthly-earnings', { year, month });
      const s = res.data?.summary;
      setEmailMsg(`Sent: ${s?.sent ?? 0}, skipped (no email): ${s?.skipped ?? 0}, failed: ${s?.failed ?? 0}`);
    } catch (e) { setEmailMsg(e.response?.data?.message || 'Request failed'); }
    setEmailBusy(false);
  };

  const openPay = row => {
    setPayRow(row);
    setPayForm({ ...PAYOUT_EMPTY, amount: Number(row.balanceDue || 0).toFixed(0) });
    setPayErr('');
  };

  const handlePay = async () => {
    if (!payForm.amount || Number(payForm.amount) <= 0) return setPayErr('Enter a valid amount.');
    setPaySaving(true);
    try {
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      await api.post('/commission-payouts', {
        staff_id:  payRow.staffId,
        branch_id: payRow.branchId || user?.branch_id,
        amount:    payForm.amount,
        date:      payForm.date,
        month:     ym,
        notes:     payForm.notes || undefined,
      });
      setPayRow(null);
      load();
    } catch (e) { setPayErr(e.response?.data?.message || 'Save failed'); }
    setPaySaving(false);
  };

  const inp = { padding: '8px 12px', borderRadius: 9, border: '1.5px solid #E4E7EC', fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', width: '100%', boxSizing: 'border-box', color: '#344054' };
  const lbl = t => <label style={{ fontSize: 12, fontWeight: 700, color: '#475467', display: 'block', marginBottom: 6 }}>{t}</label>;

  const columns = [
    {
      id: 'staff', header: 'Staff Member', accessorFn: r => r.staffName, meta: { width: '18%' },
      cell: ({ row: { original: r } }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StaffAvatar name={r.staffName} />
          <div>
            <div style={{ fontWeight: 600, color: '#101828', fontSize: 14 }}>{r.staffName}</div>
            <div style={{ fontSize: 11, color: '#98A2B3' }}>{r.role || 'Staff'}</div>
          </div>
        </div>
      ),
    },
    {
      id: 'branch', header: 'Branch', accessorFn: r => r.branchName, meta: { width: '12%' },
      cell: ({ row: { original: r } }) => <span style={{ fontSize: 13, color: '#475467' }}>{r.branchName || ''}</span>,
    },
    {
      id: 'rate', header: 'Rate', accessorFn: r => r.commissionValue, meta: { width: '9%' },
      cell: ({ row: { original: r } }) => r.commissionType === 'percentage'
        ? <span style={{ padding: '3px 8px', borderRadius: 20, background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 700 }}>{r.commissionValue}%</span>
        : <span style={{ padding: '3px 8px', borderRadius: 20, background: '#ECFDF5', color: '#059669', fontSize: 12, fontWeight: 700 }}>Rs.{Number(r.commissionValue||0).toLocaleString()}</span>,
    },
    {
      id: 'services', header: 'Svcs', accessorFn: r => r.appointmentCount, meta: { width: '7%', align: 'center' },
      cell: ({ row: { original: r } }) => <span style={{ fontWeight: 700, color: '#101828' }}>{r.appointmentCount || 0}</span>,
    },
    {
      id: 'commission', header: 'Commission', accessorFn: r => r.totalCommission, meta: { width: '12%', align: 'right' },
      cell: ({ row: { original: r } }) => <span style={{ fontWeight: 700, color: '#D97706', fontFamily: "'Outfit',sans-serif", fontSize: 14 }}>{Rs(r.totalCommission)}</span>,
    },
    {
      id: 'advances', header: 'Advance', accessorFn: r => r.totalAdvances, meta: { width: '11%', align: 'right' },
      cell: ({ row: { original: r } }) => Number(r.totalAdvances || 0) > 0
        ? <span style={{ fontWeight: 700, color: '#DC2626', fontFamily: "'Outfit',sans-serif", fontSize: 13 }}>−{Rs(r.totalAdvances)}</span>
        : <span style={{ color: '#98A2B3', fontSize: 13 }}>—</span>,
    },
    {
      id: 'net', header: 'Net Payable', accessorFn: r => r.netCommission, meta: { width: '12%', align: 'right' },
      cell: ({ row: { original: r } }) => <span style={{ fontWeight: 700, color: '#7C3AED', fontFamily: "'Outfit',sans-serif", fontSize: 14 }}>{Rs(r.netCommission)}</span>,
    },
    {
      id: 'paid', header: 'Paid', accessorFn: r => r.totalPaid, meta: { width: '11%', align: 'right' },
      cell: ({ row: { original: r } }) => Number(r.totalPaid || 0) > 0
        ? <span style={{ fontWeight: 700, color: '#059669', fontFamily: "'Outfit',sans-serif", fontSize: 13 }}>{Rs(r.totalPaid)}</span>
        : <span style={{ color: '#98A2B3', fontSize: 13 }}>—</span>,
    },
    {
      id: 'balance', header: 'Balance Due', accessorFn: r => r.balanceDue, meta: { width: '11%', align: 'right' },
      cell: ({ row: { original: r } }) => {
        const bal = Number(r.balanceDue || 0);
        return bal > 0
          ? <span style={{ fontWeight: 800, color: '#B45309', fontFamily: "'Outfit',sans-serif", fontSize: 14, background: '#FFFBEB', padding: '2px 8px', borderRadius: 8 }}>{Rs(bal)}</span>
          : <span style={{ padding: '2px 8px', borderRadius: 8, background: '#ECFDF5', color: '#059669', fontSize: 12, fontWeight: 700 }}>Paid ✓</span>;
      },
    },
    {
      id: 'actions', header: '', enableSorting: false, meta: { width: '7%', align: 'center' },
      cell: ({ row: { original: r } }) => canPay && Number(r.balanceDue || 0) > 0 ? (
        <ActionBtn onClick={() => openPay(r)} title="Record Payment" color="#059669">
          <IconPlus />
        </ActionBtn>
      ) : null,
    },
  ];

  return (
    <PageWrapper
      title="Commission"
      subtitle="Staff commission summary by period"
      actions={canEmailPdfs && (
        <Button variant="secondary" loading={emailBusy} onClick={sendStaffPdfs} style={{ whiteSpace: 'nowrap' }}>
          Email staff PDF reports
        </Button>
      )}
    >

      {/* Stat Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Total Commission" value={Rs(totalComm)}     color="#D97706" icon={<IconDollar />} />
        <StatCard label="Total Revenue"    value={Rs(totalRev)}      color="#059669" icon={<IconReceipt />} />
        <StatCard label="Advances (Deduct)"value={Rs(totalAdvances)} color="#DC2626" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>} />
        <StatCard label="Total Paid Out"   value={Rs(totalPaid)}     color="#2563EB" icon={<IconReceipt />} />
        <StatCard label="Balance Due"      value={Rs(totalBalance)}  color={totalBalance > 0 ? '#B45309' : '#059669'} icon={<IconDollar />} />
        <StatCard label="Staff Count"      value={data.length}       color="#7C3AED" icon={<IconUsers />} />
      </div>

      {emailMsg && (
        <div style={{ background: '#F0FDF4', color: '#166534', padding: '10px 14px', borderRadius: 9, fontSize: 13, border: '1px solid #BBF7D0' }}>
          {emailMsg}
        </div>
      )}

      {/* Filter Bar */}
      <FilterBar>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          style={{ padding: '7px 12px', borderRadius: 9, border: '1.5px solid #E4E7EC', fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', color: '#344054', background: '#fff' }}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          style={{ padding: '7px 12px', borderRadius: 9, border: '1.5px solid #E4E7EC', fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', color: '#344054', background: '#fff' }}>
          {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {isAdminRole && (
          <select value={branchId} onChange={e => setBranchId(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 9, border: '1.5px solid #E4E7EC', fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', color: '#344054', background: '#fff' }}>
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </FilterBar>

      {/* Table */}
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        emptyMessage="No commission data for this period"
        emptySub="Try selecting a different month or branch"
        footerRows={data.length > 0 ? (
          <tr style={{ background: '#F9FAFB', borderTop: '2px solid #EAECF0' }}>
            <td style={{ padding: '13px 16px' }} colSpan={3}><span style={{ fontWeight: 700, color: '#101828', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Totals</span></td>
            <td style={{ padding: '13px 16px', textAlign: 'center' }}><span style={{ fontWeight: 700, color: '#101828' }}>{totalAppts}</span></td>
            <td style={{ padding: '13px 16px', textAlign: 'right' }}><span style={{ fontWeight: 800, color: '#D97706', fontFamily: "'Outfit',sans-serif" }}>{Rs(totalComm)}</span></td>
            <td style={{ padding: '13px 16px', textAlign: 'right' }}><span style={{ fontWeight: 800, color: '#DC2626', fontFamily: "'Outfit',sans-serif" }}>−{Rs(totalAdvances)}</span></td>
            <td style={{ padding: '13px 16px', textAlign: 'right' }}><span style={{ fontWeight: 800, color: '#7C3AED', fontFamily: "'Outfit',sans-serif" }}>{Rs(data.reduce((s,r)=>s+Number(r.netCommission||0),0))}</span></td>
            <td style={{ padding: '13px 16px', textAlign: 'right' }}><span style={{ fontWeight: 800, color: '#059669', fontFamily: "'Outfit',sans-serif" }}>{Rs(totalPaid)}</span></td>
            <td style={{ padding: '13px 16px', textAlign: 'right' }}><span style={{ fontWeight: 800, color: '#B45309', fontFamily: "'Outfit',sans-serif" }}>{Rs(totalBalance)}</span></td>
            <td />
          </tr>
        ) : null}
      />

      {/* Record Payment Modal */}
      {payRow && (
        <Modal title={`Record Payment — ${payRow.staffName}`} onClose={() => setPayRow(null)}
          footer={<><Button variant="secondary" onClick={() => setPayRow(null)}>Cancel</Button><Button variant="primary" loading={paySaving} onClick={handlePay}>Save Payment</Button></>}>
          <div style={{ background: '#ECFDF5', color: '#065F46', padding: '9px 14px', borderRadius: 9, fontSize: 13, marginBottom: 16, display: 'flex', gap: 16 }}>
            <span>Net Payable: <strong>{Rs(payRow.netCommission)}</strong></span>
            <span>Paid: <strong>{Rs(payRow.totalPaid)}</strong></span>
            <span>Balance Due: <strong>{Rs(payRow.balanceDue)}</strong></span>
          </div>
          {payErr && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '9px 14px', borderRadius: 9, fontSize: 13, marginBottom: 14 }}>{payErr}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              {lbl('Amount (Rs.) *')}
              <input type="number" min="0" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} style={inp} placeholder="0.00" />
            </div>
            <div>
              {lbl('Date')}
              <input type="date" value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))} style={inp} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              {lbl('Notes (optional)')}
              <input type="text" value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} style={inp} placeholder="e.g. Cash payment" />
            </div>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
