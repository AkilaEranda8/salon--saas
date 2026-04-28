import { useState, useEffect, useCallback } from 'react';
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

  // Payment History modal
  const [histRow,     setHistRow]     = useState(null);
  const [histData,    setHistData]    = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  // All payments section
  const [allPayouts,     setAllPayouts]     = useState([]);
  const [allPayLoading,  setAllPayLoading]  = useState(false);
  const [showAllPay,     setShowAllPay]     = useState(true);

  useEffect(() => {
    if (isAdminRole) {
      api.get('/branches').then(r => setBranches(Array.isArray(r.data) ? r.data : (r.data?.data ?? []))).catch(() => {});
    }
  }, [isAdminRole]);

  const loadAllPayouts = useCallback(async () => {
    setAllPayLoading(true);
    try {
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      const params = { month: ym };
      if (branchId) params.branchId = branchId;
      const res = await api.get('/commission-payouts', { params });
      setAllPayouts(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch { setAllPayouts([]); }
    setAllPayLoading(false);
  }, [month, year, branchId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { month, year };
      if (branchId) params.branchId = branchId;
      const res = await api.get('/staff/commission', { params });
      setData(Array.isArray(res.data) ? res.data : []);
    } catch { setData([]); }
    setLoading(false);
    loadAllPayouts();
  }, [month, year, branchId, loadAllPayouts]);
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

  const deletePayout = async id => {
    if (!window.confirm('Delete this payment record?')) return;
    try { await api.delete(`/commission-payouts/${id}`); } catch {}
    setHistData(p => p.filter(x => x.id !== id));
    setAllPayouts(p => p.filter(x => x.id !== id));
    load();
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
      id: 'actions', header: '', enableSorting: false, meta: { width: '11%', align: 'center' },
      cell: ({ row: { original: r } }) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
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
          ) : allPayouts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: '#98A2B3', fontSize: 13 }}>No payments recorded for this period.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderTop: '1px solid #EAECF0' }}>
                  {['Date','Staff','Amount','Notes','Paid By',''].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: h === 'Amount' ? 'right' : 'left', fontWeight: 700, color: '#475467', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #EAECF0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allPayouts.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #F2F4F7' }}>
                    <td style={{ padding: '10px 14px', color: '#344054', whiteSpace: 'nowrap' }}>
                      {p.date ? new Date(p.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <StaffAvatar name={p.staff?.name || '?'} size={28} />
                        <span style={{ fontWeight: 600, color: '#101828' }}>{p.staff?.name || '—'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#059669', fontFamily: "'Outfit',sans-serif", fontSize: 14 }}>{Rs(p.amount)}</td>
                    <td style={{ padding: '10px 14px', color: '#667085' }}>{p.notes || '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#667085' }}>{p.paidBy?.name || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {canPay && (
                        <button onClick={() => deletePayout(p.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F04438', padding: 4, borderRadius: 6, display: 'flex' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* Payment History Modal */}
      <Modal open={!!histRow} title={histRow ? `Payment History — ${histRow.staffName}` : ''} onClose={() => setHistRow(null)} size="md">
        {histLoading ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#98A2B3' }}>Loading…</div>
        ) : histData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#98A2B3', fontSize: 13 }}>No payments recorded for this period.</div>
        ) : (
          <>
            <div style={{ background: '#ECFDF5', color: '#065F46', padding: '9px 14px', borderRadius: 9, fontSize: 13, marginBottom: 14, display: 'flex', gap: 16 }}>
              <span>Total Paid: <strong>{Rs(histData.reduce((s,p)=>s+Number(p.amount||0),0))}</strong></span>
              <span>{histData.length} payment{histData.length !== 1 ? 's' : ''}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  {['Date','Amount','Notes','Paid By',''].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Amount' ? 'right' : 'left', fontWeight: 700, color: '#475467', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #EAECF0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {histData.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #F2F4F7' }}>
                    <td style={{ padding: '10px 12px', color: '#344054' }}>{p.date ? new Date(p.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#059669', fontFamily: "'Outfit',sans-serif" }}>{Rs(p.amount)}</td>
                    <td style={{ padding: '10px 12px', color: '#667085' }}>{p.notes || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#667085' }}>{p.paidBy?.name || '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {canPay && (
                        <button onClick={() => deletePayout(p.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F04438', padding: 4 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
