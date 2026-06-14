import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import PageWrapper from '../components/layout/PageWrapper';
import {
  StatCard, FilterBar, DataTable,
  StaffAvatar, IconDollar, IconUsers, IconReceipt, IconPlus,
  ActionBtn,
} from '../components/ui/PageKit';

const Rs     = n => `Rs. ${Number(n || 0).toLocaleString()}`;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const today  = () => new Date().toISOString().slice(0, 10);

const PAYOUT_EMPTY = { amount: '', date: today(), notes: '' };

const SOURCE_COLORS = {
  staff_override:  ['#EFF6FF', '#1D4ED8'],
  service_catalog: ['#ECFDF5', '#047857'],
  staff_default:   ['#FEF3C7', '#B45309'],
};

function parseBreakdown(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

function breakdownPreview(breakdown) {
  const b = parseBreakdown(breakdown);
  if (!b?.lines?.length) return null;
  const first = b.lines[0];
  const extra = b.lines.length > 1 ? ` +${b.lines.length - 1} more` : '';
  return `${first.serviceName || 'Service'} · ${first.rateLabel || ''}${extra}`;
}

function paymentRowKey(p) {
  return `${p.commission_role || 'worker'}-${p.id}`;
}

function formatPaymentDate(date) {
  if (!date) return '—';
  return new Date(`${String(date).slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function BreakdownLines({ breakdown }) {
  const b = parseBreakdown(breakdown);
  if (!b) return <div style={{ fontSize: 12, color: '#98A2B3' }}>No breakdown saved for this payment.</div>;
  if (!b.lines?.length) {
    return (
      <div style={{ fontSize: 12, color: '#667085', marginTop: 8 }}>
        {b.note && <div style={{ marginBottom: 6, fontStyle: 'italic' }}>{b.note}</div>}
        Commission total: <strong style={{ color: '#D97706' }}>{Rs(b.total)}</strong>
      </div>
    );
  }
  return (
    <>
      {b.note && (
        <div style={{ fontSize: 12, color: '#667085', marginTop: 10, marginBottom: 4, fontStyle: 'italic' }}>
          {b.note}
        </div>
      )}
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
      <thead>
        <tr style={{ background: '#F9FAFB', color: '#667085' }}>
          <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>Service</th>
          <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700 }}>Base</th>
          <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>Rate</th>
          <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>Source</th>
          <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700 }}>Commission</th>
        </tr>
      </thead>
      <tbody>
        {b.lines.map((line, i) => {
          const [bg, fg] = SOURCE_COLORS[line.source] || ['#F2F4F7', '#475467'];
          return (
            <tr key={i} style={{ borderTop: '1px solid #EAECF0' }}>
              <td style={{ padding: '7px 8px', color: '#101828', fontWeight: 600 }}>{line.serviceName}</td>
              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#475467' }}>{Rs(line.lineBase)}</td>
              <td style={{ padding: '7px 8px', color: '#344054' }}>{line.rateLabel}</td>
              <td style={{ padding: '7px 8px' }}>
                <span style={{ padding: '2px 7px', borderRadius: 20, background: bg, color: fg, fontSize: 11, fontWeight: 700 }}>
                  {line.sourceLabel || line.source}
                </span>
              </td>
              <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: '#D97706' }}>{Rs(line.commission)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr style={{ borderTop: '2px solid #EAECF0', background: '#FFFBEB' }}>
          <td colSpan={4} style={{ padding: '8px', fontWeight: 700, color: '#92400E', textAlign: 'right' }}>Payment commission</td>
          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#D97706' }}>{Rs(b.total)}</td>
        </tr>
      </tfoot>
    </table>
    </>
  );
}

export default function CommissionPage() {
  const { user } = useAuth();
  const isAdminRole  = ['superadmin','admin','manager','staff'].includes(user?.role);
  const canEmailPdfs = ['superadmin','admin','manager'].includes(user?.role);
  const canPay       = ['superadmin','admin','manager'].includes(user?.role);
  const now = new Date();
  const [month,    setMonth]    = useState(now.getMonth() + 1);
  const [year,     setYear]     = useState(now.getFullYear());
  const [data,     setData]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg,  setEmailMsg]  = useState('');

  // Record Payment modal
  const [payRow,    setPayRow]    = useState(null);
  const [payForm,   setPayForm]   = useState(PAYOUT_EMPTY);
  const [payErr,    setPayErr]    = useState('');
  const [paySaving, setPaySaving] = useState(false);

  // Payment History modal
  const [histRow,     setHistRow]     = useState(null);
  const [histData,    setHistData]    = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  // Commission calculation breakdown modal
  const [breakRow,     setBreakRow]     = useState(null);
  const [breakData,    setBreakData]    = useState(null);
  const [breakLoading, setBreakLoading] = useState(false);
  const [breakOpenId,  setBreakOpenId]  = useState(null);

  // All payments section
  const [allPayouts,     setAllPayouts]     = useState([]);
  const [allPayLoading,  setAllPayLoading]  = useState(false);
  const [showAllPay,     setShowAllPay]     = useState(true);

  const loadAllPayouts = useCallback(async () => {
    setAllPayLoading(true);
    try {
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      const params = { month: ym };
      const res = await api.get('/commission-payouts', { params });
      setAllPayouts(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch { setAllPayouts([]); }
    setAllPayLoading(false);
  }, [month, year]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { month, year };
      if (user?.role === 'staff') {
        const ym = `${year}-${String(month).padStart(2, '0')}`;
        const res = await api.get('/staff/me/commission', { params: { month: ym } });
        const d = res.data || {};
        const st = d.staff;
        setData(st ? [{
          staffId: st.id,
          staffName: st.name,
          role: '',
          branchName: '',
          salaryType: d.salaryType || 'commission_only',
          baseSalary: d.baseSalary || 0,
          commissionType: 'percentage',
          commissionValue: 0,
          appointmentCount: (d.data || []).length,
          totalRevenue: (d.data || []).reduce((s, p) => s + Number(p.total_amount || 0), 0),
          totalCommission: d.totalCommission || 0,
          grossPayable: d.grossPayable || 0,
          totalAdvances: d.totalAdvances || 0,
          netCommission: d.netCommission || 0,
          totalPaid: d.totalPaid || 0,
          balanceDue: d.balanceDue || 0,
        }] : []);
      } else {
        const res = await api.get('/staff/commission', { params });
        setData(Array.isArray(res.data) ? res.data : []);
      }
    } catch { setData([]); }
    setLoading(false);
    loadAllPayouts();
  }, [month, year, loadAllPayouts, user?.role]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAllPayouts(); }, [loadAllPayouts]);

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

  const openHistory = async row => {
    setHistRow(row); setHistData([]); setHistLoading(true);
    try {
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      const res = await api.get('/commission-payouts', { params: { staffId: row.staffId, month: ym } });
      setHistData(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch { setHistData([]); }
    setHistLoading(false);
  };

  const openBreakdown = async row => {
    setBreakRow(row);
    setBreakData(null);
    setBreakOpenId(null);
    setBreakLoading(true);
    try {
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      const res = await api.get(`/staff/${row.staffId}/commission`, { params: { month: ym } });
      const payload = res.data || null;
      if (payload?.data?.length) {
        payload.data = payload.data.map((p) => ({
          ...p,
          commission_breakdown: parseBreakdown(p.commission_breakdown),
        }));
      }
      setBreakData(payload);
    } catch {
      setBreakData(null);
    }
    setBreakLoading(false);
  };

  const deletePayout = async id => {
    if (!window.confirm('Delete this payment record?')) return;
    try { await api.delete(`/commission-payouts/${id}`); } catch {}
    setHistData(p => p.filter(x => x.id !== id));
    setAllPayouts(p => p.filter(x => x.id !== id));
    load();
  };

  const payoutColumns = useMemo(() => [
    {
      id: 'date',
      header: 'Date',
      accessorKey: 'date',
      cell: ({ row: { original: p } }) => p.date ? new Date(p.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    },
    {
      id: 'staff',
      header: 'Staff',
      accessorFn: row => row.staff?.name,
      cell: ({ row: { original: p } }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StaffAvatar name={p.staff?.name || '?'} size={28} />
          <span style={{ fontWeight: 600 }}>{p.staff?.name || '—'}</span>
        </div>
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      accessorKey: 'amount',
      meta: { align: 'right' },
      cell: ({ row: { original: p } }) => <span style={{ fontWeight: 700, color: '#059669', fontFamily: "'Outfit',sans-serif", fontSize: 14 }}>{Rs(p.amount)}</span>,
    },
    { id: 'notes', header: 'Notes', accessorFn: row => row.notes, cell: ({ row: { original: p } }) => p.notes || '—' },
    { id: 'paidBy', header: 'Paid By', accessorFn: row => row.paidBy?.name },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { width: '48px' },
      cell: ({ row: { original: p } }) => canPay ? (
        <button type="button" onClick={() => deletePayout(p.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F04438', padding: 4, display: 'flex' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      ) : null,
    },
  ], [canPay]);

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
      id: 'salaryType', header: 'Pay Type', accessorFn: r => r.salaryType, meta: { width: '11%' },
      cell: ({ row: { original: r } }) => {
        const colors = { commission_only: ['#EFF6FF','#2563EB'], salary_only: ['#F0FDF4','#059669'], salary_plus_commission: ['#FEF3C7','#D97706'] };
        const [bg, fg] = colors[r.salaryType] || colors.commission_only;
        const labels = { commission_only: 'Comm Only', salary_only: 'Salary', salary_plus_commission: 'Salary+Comm' };
        return <span style={{ padding: '3px 8px', borderRadius: 20, background: bg, color: fg, fontSize: 11, fontWeight: 700 }}>{labels[r.salaryType]||r.salaryType}</span>;
      },
    },
    {
      id: 'baseSalary', header: 'Base Sal.', accessorFn: r => r.baseSalary, meta: { width: '10%', align: 'right' },
      cell: ({ row: { original: r } }) => Number(r.baseSalary||0) > 0
        ? <span style={{ fontWeight: 700, color: '#059669', fontFamily: "'Outfit',sans-serif", fontSize: 13 }}>{Rs(r.baseSalary)}</span>
        : <span style={{ color: '#98A2B3', fontSize: 13 }}>—</span>,
    },
    {
      id: 'rate', header: 'Comm Rate', accessorFn: r => r.commissionValue, meta: { width: '9%' },
      cell: ({ row: { original: r } }) => r.salaryType === 'salary_only'
        ? <span style={{ color: '#98A2B3', fontSize: 13 }}>—</span>
        : r.commissionType === 'percentage'
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
      id: 'gross', header: 'Gross', accessorFn: r => r.grossPayable, meta: { width: '11%', align: 'right' },
      cell: ({ row: { original: r } }) => <span style={{ fontWeight: 700, color: '#475467', fontFamily: "'Outfit',sans-serif", fontSize: 13 }}>{Rs(r.grossPayable)}</span>,
    },
    {
      id: 'net', header: 'Net Payable', accessorFn: r => r.netCommission, meta: { width: '11%', align: 'right' },
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
      id: 'actions', header: '', enableSorting: false, meta: { width: '11%', align: 'center' },
      cell: ({ row: { original: r } }) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {r.salaryType !== 'salary_only' && Number(r.appointmentCount || 0) > 0 && (
            <ActionBtn onClick={() => openBreakdown(r)} title="Calculation breakdown" color="#7C3AED">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>
            </ActionBtn>
          )}
          {canPay && Number(r.balanceDue || 0) > 0 && (
            <ActionBtn onClick={() => openPay(r)} title="Record Payment" color="#059669">
              <IconPlus />
            </ActionBtn>
          )}
          {Number(r.totalPaid || 0) > 0 && (
            <ActionBtn onClick={() => openHistory(r)} title="Payment History" color="#2563EB">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </ActionBtn>
          )}
        </div>
      ),
    },
  ];

  const SALARY_LABELS = { commission_only: 'Commission', salary_only: 'Salary', salary_plus_commission: 'Salary + Comm' };

  return (
    <PageWrapper
      title="Salary & Commission"
      subtitle="Staff salary and commission summary by period"
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
        <StatCard label="Gross Payable"    value={Rs(data.reduce((s,r)=>s+Number(r.grossPayable||0),0))} color="#7C3AED" icon={<IconDollar />} />
        <StatCard label="Advances (Deduct)"value={Rs(totalAdvances)} color="#DC2626" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>} />
        <StatCard label="Total Paid Out"   value={Rs(totalPaid)}     color="#2563EB" icon={<IconReceipt />} />
        <StatCard label="Balance Due"      value={Rs(totalBalance)}  color={totalBalance > 0 ? '#B45309' : '#059669'} icon={<IconDollar />} />
      </div>

      {emailMsg && (
        <div style={{ background: '#F0FDF4', color: '#166534', padding: '10px 14px', borderRadius: 9, fontSize: 13, border: '1px solid #BBF7D0' }}>
          {emailMsg}
        </div>
      )}

      {/* Filter Bar */}
      <FilterBar>
        <select value={month} onChange={e => setMonth(Number(e.target.value))} className="pk-filter-control">
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="pk-filter-control">
          {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </FilterBar>

      {/* Table */}
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        emptyMessage="No staff on this commission list"
        emptySub="Add staff from the Staff page first, then record payments with a staff member selected"
        footerRows={data.length > 0 ? (
          <tr style={{ background: '#F9FAFB', borderTop: '2px solid #EAECF0' }}>
            <td style={{ padding: '13px 16px' }} colSpan={5}><span style={{ fontWeight: 700, color: '#101828', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Totals</span></td>
            <td style={{ padding: '13px 16px', textAlign: 'center' }}><span style={{ fontWeight: 700, color: '#101828' }}>{totalAppts}</span></td>
            <td style={{ padding: '13px 16px', textAlign: 'right' }}><span style={{ fontWeight: 800, color: '#D97706', fontFamily: "'Outfit',sans-serif" }}>{Rs(totalComm)}</span></td>
            <td style={{ padding: '13px 16px', textAlign: 'right' }}><span style={{ fontWeight: 800, color: '#DC2626', fontFamily: "'Outfit',sans-serif" }}>−{Rs(totalAdvances)}</span></td>
            <td style={{ padding: '13px 16px', textAlign: 'right' }}><span style={{ fontWeight: 800, color: '#475467', fontFamily: "'Outfit',sans-serif" }}>{Rs(data.reduce((s,r)=>s+Number(r.grossPayable||0),0))}</span></td>
            <td style={{ padding: '13px 16px', textAlign: 'right' }}><span style={{ fontWeight: 800, color: '#7C3AED', fontFamily: "'Outfit',sans-serif" }}>{Rs(data.reduce((s,r)=>s+Number(r.netCommission||0),0))}</span></td>
            <td style={{ padding: '13px 16px', textAlign: 'right' }}><span style={{ fontWeight: 800, color: '#059669', fontFamily: "'Outfit',sans-serif" }}>{Rs(totalPaid)}</span></td>
            <td style={{ padding: '13px 16px', textAlign: 'right' }}><span style={{ fontWeight: 800, color: '#B45309', fontFamily: "'Outfit',sans-serif" }}>{Rs(totalBalance)}</span></td>
            <td />
          </tr>
        ) : null}
        searchableColumns={[{ id: 'staff', title: 'Staff' }]}
      />

      {/* ── All Payments Section ──────────────────────────────────────── */}
      <div style={{ border: '1.5px solid #E4E7EC', borderRadius: 14, overflow: 'hidden' }}>
        {/* Header */}
        <div
          onClick={() => setShowAllPay(v => !v)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', background: '#F9FAFB', cursor: 'pointer', userSelect: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            <span style={{ fontWeight: 700, color: '#101828', fontSize: 14 }}>Payment History</span>
            {allPayouts.length > 0 && (
              <span style={{ background: '#DBEAFE', color: '#1D4ED8', borderRadius: 20, padding: '1px 9px', fontSize: 12, fontWeight: 700 }}>{allPayouts.length}</span>
            )}
            {allPayouts.length > 0 && (
              <span style={{ fontSize: 13, color: '#059669', fontWeight: 700 }}>
                Total: {Rs(allPayouts.reduce((s,p) => s + Number(p.amount||0), 0))}
              </span>
            )}
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#98A2B3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showAllPay ? 'rotate(180deg)' : 'none', transition: '0.2s' }}><polyline points="6 9 12 15 18 9"/></svg>
        </div>

        {showAllPay && (
          allPayLoading ? (
            <div style={{ textAlign: 'center', padding: 24, color: '#98A2B3', fontSize: 13 }}>Loading…</div>
          ) : (
            <DataTable
              noShell
              compact
              pagination={false}
              showRowNumbers={false}
              enableColumnVisibility={false}
              columns={payoutColumns}
              data={allPayouts}
              loading={allPayLoading}
              emptyMessage="No payments recorded for this period."
              searchableColumns={[{ id: 'staff', title: 'Staff' }]}
            />
          )
        )}
      </div>

      {/* Commission calculation breakdown */}
      <Modal
        open={!!breakRow}
        title={breakRow ? `Calculation Breakdown — ${breakRow.staffName}` : ''}
        onClose={() => { setBreakRow(null); setBreakData(null); setBreakOpenId(null); }}
        size="xl"
      >
        {breakLoading ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#98A2B3' }}>Loading breakdown…</div>
        ) : !breakData?.data?.length ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#98A2B3' }}>No commission payments for this period.</div>
        ) : (
          <>
            <div style={{ background: '#F5F3FF', color: '#5B21B6', padding: '10px 14px', borderRadius: 9, fontSize: 13, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <span>Period: <strong>{MONTHS[month - 1]} {year}</strong></span>
              <span>Total commission: <strong>{Rs(breakData.totalCommission)}</strong></span>
              <span>{breakData.data.length} payment{breakData.data.length !== 1 ? 's' : ''}</span>
            </div>
            <p style={{ fontSize: 12, color: '#667085', margin: '0 0 12px', lineHeight: 1.5 }}>
              Each payment is split across services. The <strong>base</strong> is the service&apos;s share of the net paid amount (after loyalty/promo discounts).
              Worker commission: staff custom rate → service catalogue rate → staff default.
              Manager rows use branch override % of the total service amount.
            </p>
            <div className="commission-breakdown-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {breakData.data.map((p) => {
                const rowKey = paymentRowKey(p);
                const open = breakOpenId === rowKey;
                const bd = parseBreakdown(p.commission_breakdown);
                const cust = p.customer_name || p.appointment?.customer_name || 'Walk-in';
                const svcLabel = p.service?.name
                  || (bd?.lines?.length > 1 ? `${bd.lines.length} services` : bd?.lines?.[0]?.serviceName)
                  || '—';
                const preview = breakdownPreview(bd);
                const fmtDate = formatPaymentDate(p.date);
                const commAmt = Rs(p.display_commission_amount ?? p.commission_amount);
                return (
                  <div
                    key={rowKey}
                    className="commission-breakdown-row"
                    style={{
                      border: '1.5px solid #E4E7EC',
                      borderRadius: 10,
                      background: '#fff',
                      position: 'relative',
                      isolation: 'isolate',
                    }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setBreakOpenId(open ? null : rowKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setBreakOpenId(open ? null : rowKey);
                        }
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '11px 14px',
                        background: open ? '#F9FAFB' : '#fff',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: "'Inter', sans-serif",
                        minHeight: 52,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: '#101828', fontSize: 13, lineHeight: 1.4 }}>
                          {fmtDate} · {cust}
                        </div>
                        <div style={{ fontSize: 12, color: '#475467', marginTop: 3, lineHeight: 1.45 }}>
                          Paid <strong style={{ color: '#059669' }}>{Rs(p.total_amount)}</strong>
                          {' · '}{svcLabel}
                          {p.commission_role === 'manager_oversight' && p.oversight_performer?.name && (
                            <span> · Work by <strong style={{ color: '#344054' }}>{p.oversight_performer.name}</strong></span>
                          )}
                          {(Number(p.loyalty_discount) > 0 || Number(p.promo_discount) > 0) && (
                            <span> · Discounts: {Rs(Number(p.loyalty_discount || 0) + Number(p.promo_discount || 0))}</span>
                          )}
                        </div>
                        {!open && preview && (
                          <div style={{ fontSize: 11, color: '#7C3AED', marginTop: 4 }}>{preview}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        {p.commission_role === 'manager_oversight' && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', background: '#ECFDF5', padding: '2px 7px', borderRadius: 6 }}>Manager</span>
                        )}
                        <span style={{ fontWeight: 800, color: '#D97706', fontFamily: "'Outfit',sans-serif", fontSize: 14 }}>
                          {commAmt}
                        </span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#98A2B3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s', flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
                      </div>
                    </div>
                    {open && (
                      <div style={{ padding: '0 14px 14px', borderTop: '1px solid #EAECF0', background: '#FAFAFA' }}>
                        {bd?.netTotal != null && (
                          <div style={{ fontSize: 12, color: '#667085', marginTop: 10, marginBottom: 4 }}>
                            Net commissionable amount: <strong style={{ color: '#344054' }}>{Rs(bd.netTotal)}</strong>
                          </div>
                        )}
                        <BreakdownLines breakdown={bd} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Modal>

      {/* Payment History Modal */}
      <Modal open={!!histRow} title={histRow ? `Payment History — ${histRow.staffName}` : ''} onClose={() => setHistRow(null)} size="md">
        {histLoading ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#98A2B3' }}>Loading…</div>
        ) : (
          <>
            <div style={{ background: '#ECFDF5', color: '#065F46', padding: '9px 14px', borderRadius: 9, fontSize: 13, marginBottom: 14, display: 'flex', gap: 16 }}>
              <span>Total Paid: <strong>{Rs(histData.reduce((s,p)=>s+Number(p.amount||0),0))}</strong></span>
              <span>{histData.length} payment{histData.length !== 1 ? 's' : ''}</span>
            </div>
            <DataTable
              noShell
              compact
              pagination={false}
              showRowNumbers={false}
              enableColumnVisibility={false}
              columns={payoutColumns.filter(c => c.id !== 'staff')}
              data={histData}
              loading={histLoading}
              emptyMessage="No payments recorded for this period."
            />
          </>
        )}
      </Modal>

      {/* Record Payment Modal */}
      <Modal open={!!payRow} title={payRow ? `Record Payment — ${payRow.staffName}` : ''} onClose={() => setPayRow(null)} size="md"
        footer={<><Button variant="secondary" onClick={() => setPayRow(null)}>Cancel</Button><Button variant="primary" loading={paySaving} onClick={handlePay}>Save Payment</Button></>}>
        {payRow && <>
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
        </>}
      </Modal>
    </PageWrapper>
  );
}
