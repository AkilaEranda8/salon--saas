import React, { useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import { Input, Label, Textarea } from '../components/ui/FormElements';
import {
  PKModal as Modal, StatCard, StaffAvatar,
  IconUsers, IconCheck, IconClock, IconCalendar,
} from '../components/ui/PageKit';

/*  Constants  */
const STATUS_BORDER = { waiting: '#f59e0b', serving: '#10b981', completed: '#94a3b8', cancelled: '#ef4444' };
const STATUS_LABELS = { waiting: 'Waiting', serving: 'In Service', completed: 'Completed', cancelled: 'Cancelled' };
const FILTER_PILLS  = ['all', 'waiting', 'serving', 'completed', 'cancelled'];
const EMPTY_FORM    = { customerName: '', phone: '', serviceIds: [], branchId: '', note: '' };
const DARK          = '#101828';
const MUTED         = '#64748B';
const ACTIVE_PILL   = '#1e293b';

/*  Helpers  */
const fmtTime = (t) => { if (!t) return ''; const [h, m] = t.split(':'); const hr = +h % 12 || 12; return `${hr}:${m} ${+h >= 12 ? 'PM' : 'AM'}`; };

function EntryServices({ entry, svc, services, MUTED }) {
  const extraMatch = entry.note?.match(/\[services:([\d,]+)\]/);
  const extraIds   = extraMatch ? extraMatch[1].split(',').map(Number) : [];
  const extraSvcs  = services.filter((s) => extraIds.includes(s.id) && s.id !== svc.id);
  const allSvcs    = svc.name ? [svc, ...extraSvcs] : extraSvcs;
  const cleanNote  = entry.note?.replace(/\[services:[\d,]+\]\s*/g, '').trim();
  const totalMin   = allSvcs.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  return (
    <>
      {allSvcs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
          {allSvcs.map((s) => (
            <span key={s.id} style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 99,
              background: '#EEF2FF', color: '#4338CA', fontWeight: 600,
              border: '1px solid #C7D2FE',
            }}>{s.name}</span>
          ))}
          {totalMin > 0 && (
            <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 99, background: '#F1F5F9', color: MUTED, fontWeight: 600 }}>
              {totalMin} min
            </span>
          )}
        </div>
      )}
      {cleanNote && (
        <div style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic', marginTop: 3 }}>{cleanNote}</div>
      )}
    </>
  );
}

/*  Print CSS injected once  */
const PRINT_CSS = `@media print { body > *:not(#walkin-print-root) { display: none !important; } #walkin-print-root { display: block !important; } }`;

const RESPONSIVE_CSS = `
.wq-card { display:flex; align-items:center; gap:16px; flex-wrap:wrap; padding:14px 16px; }
.wq-customer { flex:1 1 160px; min-width:0; }
.wq-staff { flex:0 0 160px; }
.wq-status { flex-shrink:0; min-width:85px; text-align:center; }
.wq-actions { display:flex; align-items:center; gap:6px; flex-shrink:0; flex-wrap:wrap; }
@media (max-width: 640px) {
  .wq-card { padding:12px 12px; gap:10px; }
  .wq-staff { flex:1 1 100%; order:3; }
  .wq-status { order:2; }
  .wq-actions { order:4; flex:1 1 100%; justify-content:flex-end; }
  .wq-customer { flex:1 1 120px; }
}
`;

export default function WalkInPage() {
  const { user }  = useAuth();
  const { toast } = useToast();
  const isAdmin   = ['superadmin', 'admin'].includes(user?.role);
  const defaultBranch = user?.branchId || '';

  /*  State  */
  const [queue,          setQueue]          = useState([]);
  const [stats,          setStats]          = useState({ waiting: 0, serving: 0, completed: 0, cancelled: 0, total: 0 });
  const [selectedBranch, setSelectedBranch] = useState(defaultBranch);
  const [filterStatus,   setFilterStatus]   = useState('all');
  const [showCheckin,    setShowCheckin]    = useState(false);
  const [showToken,      setShowToken]      = useState(null);
  const [form,           setForm]           = useState({ ...EMPTY_FORM, branchId: defaultBranch });
  const [formError,      setFormError]      = useState('');
  const [saving,         setSaving]         = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [clock,          setClock]          = useState(new Date());

  const [custSearch,     setCustSearch]     = useState('');
  const [custResults,    setCustResults]    = useState([]);
  const [custAll,        setCustAll]        = useState([]);
  const [custLoading,    setCustLoading]    = useState(false);
  const [showCustDrop,   setShowCustDrop]   = useState(false);
  const [selectedCust,   setSelectedCust]   = useState(null);
  const custSearchRef = useRef(null);

  /* Payment modal */
  const [payEntry,       setPayEntry]       = useState(null);
  const [payMethod,      setPayMethod]      = useState('Cash');
  const [payAmount,      setPayAmount]      = useState('');
  const [payNote,        setPayNote]        = useState('');
  const [paying,         setPaying]         = useState(false);
  const [payError,       setPayError]       = useState('');

  const [branches,  setBranches]  = useState([]);
  const [services,  setServices]  = useState([]);
  const [staffList, setStaffList] = useState([]);

  const socketRef = useRef(null);

  /*  Clock  */
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /*  Lookup data  */
  useEffect(() => {
    if (isAdmin) api.get('/branches').then((r) => setBranches(r.data.data || r.data || [])).catch(() => {});
    api.get('/services?limit=500').then((r) => setServices(r.data.data || r.data || [])).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedBranch) return;
    api.get(`/staff?branchId=${selectedBranch}&limit=500`).then((r) => setStaffList(r.data.data || r.data || [])).catch(() => {});
  }, [selectedBranch]);

  /*  Fetch queue + stats  */
  const fetchData = useCallback(async () => {
    if (!selectedBranch) return;
    setLoading(true); setError('');
    try {
      const [qRes, sRes] = await Promise.all([
        api.get(`/walkin?branchId=${selectedBranch}`),
        api.get(`/walkin/stats?branchId=${selectedBranch}`),
      ]);
      setQueue(qRes.data || []);
      setStats(sRes.data || { waiting: 0, serving: 0, completed: 0, cancelled: 0, total: 0 });
    } catch (e) {
      setError('Failed to load queue.');
    } finally {
      setLoading(false);
    }
  }, [selectedBranch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /*  Socket.io  */
  useEffect(() => {
    if (!selectedBranch) return;
    const socket = io();
    socketRef.current = socket;
    socket.emit('join', { branchId: selectedBranch });
    socket.on('queue:updated', () => fetchData());
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [selectedBranch, fetchData]);

  /*  Derived  */
  const busyStaffIds  = new Set(queue.filter((e) => e.status === 'serving' && e.staff_id).map((e) => e.staff_id));
  const STATUS_ORDER = { waiting: 0, serving: 1, completed: 2, cancelled: 3 };
  const filteredQueue = (filterStatus === 'all' ? queue : queue.filter((e) => e.status === filterStatus))
    .slice()
    .sort((a, b) => {
      const statusDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      if (statusDiff !== 0) return statusDiff;
      return b.id - a.id; // newest first within same status
    });

  /*  Actions  */
  const changeStatus = async (id, status) => {
    try { await api.patch(`/walkin/${id}/status`, { status }); } catch { /* socket refreshes */ }
  };
  const assignStaff = async (id, staffId) => {
    try { await api.patch(`/walkin/${id}/assign`, { staffId: +staffId }); } catch { /* socket refreshes */ }
  };
  const removeEntry = async (id) => {
    try { await api.delete(`/walkin/${id}`); } catch { /* socket refreshes */ }
  };

  /*  Open payment modal — pre-fill total from service prices  */
  const openPayment = (entry) => {
    const extraMatch = entry.note?.match(/\[services:([\d,]+)\]/);
    const extraIds   = extraMatch ? extraMatch[1].split(',').map(Number) : [];
    const allIds     = [...new Set([entry.service_id, ...extraIds].filter(Boolean))];
    const allSvcs    = services.filter((s) => allIds.includes(s.id));
    const total      = allSvcs.reduce((sum, s) => sum + parseFloat(s.price || 0), 0);
    setPayEntry({ ...entry, _allSvcs: allSvcs });
    setPayAmount(total > 0 ? String(total) : '');
    setPayMethod('Cash');
    setPayNote('');
    setPayError('');
  };

  const submitPayment = async () => {
    if (!payAmount || isNaN(+payAmount) || +payAmount <= 0) {
      setPayError('Valid amount required.'); return;
    }
    setPaying(true); setPayError('');
    try {
      await api.post('/payments', {
        branch_id:     payEntry.branch_id,
        staff_id:      payEntry.staff_id   || undefined,
        customer_name: payEntry.customer_name,
        service_id:    payEntry.service_id || undefined,
        splits:        [{ method: payMethod, amount: +payAmount }],
        loyalty_discount: 0,
        note: payNote || undefined,
      });
      // mark as completed
      if (payEntry.status !== 'completed') {
        await api.patch(`/walkin/${payEntry.id}/status`, { status: 'completed' });
      }
      toast.success('Payment collected!');
      setPayEntry(null);
    } catch (err) {
      setPayError(err.response?.data?.message || err.message || 'Payment failed. Check server logs.');
    } finally { setPaying(false); }
  };

  /*  Check-in submit  */
  const handleCheckin = async () => {
    setSaving(true); setFormError('');
    try {
      const res = await api.post('/walkin/checkin', {
        customerName: form.customerName,
        phone:        form.phone        || undefined,
        branchId:     form.branchId     || selectedBranch,
        serviceIds:   form.serviceIds.map(Number),
        note:         form.note         || undefined,
      });
      setShowCheckin(false);
      setForm({ ...EMPTY_FORM, branchId: selectedBranch });
      setCustSearch(''); setCustResults([]); setCustAll([]); setShowCustDrop(false);
      setShowToken(res.data);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Check-in failed.');
    } finally { setSaving(false); }
  };

  /*  Toggle a service in/out of selected list  */
  const toggleService = (id) => {
    setForm((f) => ({
      ...f,
      serviceIds: f.serviceIds.includes(id)
        ? f.serviceIds.filter((s) => s !== id)
        : [...f.serviceIds, id],
    }));
  };

  /*  Load all customers when modal opens  */
  useEffect(() => {
    if (!showCheckin) return;
    const branchQ = form.branchId || selectedBranch;
    setCustLoading(true);
    api.get(`/customers?limit=100${branchQ ? `&branchId=${branchQ}` : ''}`)
      .then((r) => { setCustAll(r.data.data || []); setCustResults(r.data.data || []); })
      .catch(() => { setCustAll([]); setCustResults([]); })
      .finally(() => setCustLoading(false));
  }, [showCheckin, form.branchId, selectedBranch]);

  /*  Filter customers as user types  */
  useEffect(() => {
    if (!custSearch.trim()) {
      setCustResults(custAll);
      return;
    }
    const q = custSearch.toLowerCase();
    setCustResults(
      custAll.filter((c) =>
        c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
      )
    );
  }, [custSearch, custAll]);

  const selectCustomer = (c) => {
    setSelectedCust(c);
    setForm((f) => ({ ...f, customerName: c.name, phone: c.phone || f.phone }));
    setCustSearch('');
    setShowCustDrop(false);
  };

  const clearSelectedCust = () => {
    setSelectedCust(null);
    setForm((f) => ({ ...f, customerName: '', phone: '' }));
    setCustSearch('');
    setShowCustDrop(false);
  };

  /*  Estimated wait preview  */
  const selectedServices = services.filter((s) => form.serviceIds.includes(String(s.id)) || form.serviceIds.includes(s.id));
  const totalDuration    = selectedServices.reduce((sum, s) => sum + (s.duration_minutes || 30), 0);
  const waitPreview      = selectedServices.length > 0 ? stats.waiting * totalDuration : null;

  /*  Page actions  */
  const pageActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: DARK, letterSpacing: 1 }}>
        {clock.toLocaleTimeString()}
      </span>
      <Button variant="ghost" size="sm" onClick={() => window.open(`/token-display?branchId=${selectedBranch}`, '_blank')}>
        Token Display
      </Button>
      <Button size="sm" onClick={() => { setFormError(''); setForm({ ...EMPTY_FORM, branchId: selectedBranch }); setCustSearch(''); setCustResults([]); setCustAll([]); setSelectedCust(null); setShowCustDrop(false); setShowCheckin(true); }}>
        + New Walk-in
      </Button>
    </div>
  );

  /* 
     RENDER
      */
  return (
    <PageWrapper title="Walk-In Queue" subtitle="Real-time queue management" actions={pageActions}>
      <style>{PRINT_CSS}{RESPONSIVE_CSS}</style>

      {/*  No branch selected  */}
      {!selectedBranch && isAdmin && (
        <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '14px 20px', color: '#92400E', fontSize: 14, fontWeight: 600 }}>
          Please select a branch to view the walk-in queue.
        </div>
      )}

      {/*  Branch selector (admin)  */}
      {isAdmin && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E4E7EC', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: DARK }}>Branch:</span>
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #D0D5DD', fontSize: 13, fontFamily: 'inherit', width: 200, background: '#fff', color: DARK }}>
            <option value="">Select branch</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      {/*  STATS ROW  */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        <StatCard label="Waiting"     value={stats.waiting}   color="#f59e0b" icon={<IconClock />} />
        <StatCard label="In Service"  value={stats.serving}   color="#10b981" icon={<IconUsers />} />
        <StatCard label="Completed"   value={stats.completed} color="#94a3b8" icon={<IconCheck />} />
        <StatCard label="Total Today" value={stats.total}     color="#6366f1" icon={<IconCalendar />} />
      </div>

      {/*  STAFF AVAILABILITY  */}
      {staffList.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E4E7EC', padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: DARK, marginBottom: 12 }}>Staff Availability</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {staffList.filter((s) => s.is_active !== false).map((s) => {
              const busy = busyStaffIds.has(s.id);
              return (
                <div key={s.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '6px 14px 6px 6px', borderRadius: 999,
                  background: busy ? '#FFF7ED' : '#F0FDF4',
                  border: `1.5px solid ${busy ? '#FED7AA' : '#BBF7D0'}`,
                }}>
                  <StaffAvatar name={s.name} size={28} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: DARK, lineHeight: 1.2 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: busy ? '#C2410C' : '#15803D', fontWeight: 600 }}>{busy ? 'Busy' : 'Available'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/*  FILTER BAR  */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FILTER_PILLS.map((f) => {
          const active = filterStatus === f;
          return (
            <button key={f} onClick={() => setFilterStatus(f)} style={{
              padding: '7px 18px', borderRadius: 999,
              border: `1.5px solid ${active ? ACTIVE_PILL : '#D0D5DD'}`,
              background: active ? ACTIVE_PILL : '#fff',
              color: active ? '#fff' : DARK,
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}>
              {f === 'all' ? 'All' : STATUS_LABELS[f] || f}
              {f !== 'all' && stats[f] != null && (
                <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.75 }}>({stats[f]})</span>
              )}
            </button>
          );
        })}
      </div>

      {/*  QUEUE LIST  */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: MUTED, fontSize: 14 }}>Loading queue…</div>
      ) : error ? (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 18px', color: '#B91C1C', fontSize: 14 }}>{error}</div>
      ) : filteredQueue.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 16px', color: '#94A3B8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🪑</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: MUTED }}>Queue is empty</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>No walk-in entries for the selected filter</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredQueue.map((entry) => {
            const svc = entry.service || {};
            const stf = entry.staff;
            return (
              <div key={entry.id} className="wq-card" style={{
                background: '#fff', borderRadius: 14,
                boxShadow: '0 1px 4px rgba(16,24,40,0.06)',
                border: '1px solid #EAECF0',
                borderLeft: `5px solid ${STATUS_BORDER[entry.status] || '#E4E7EC'}`,
              }}>

                {/* TOKEN */}
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 10,
                    background: '#1e293b', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15, fontWeight: 900, fontFamily: 'monospace', letterSpacing: 1,
                  }}>{entry.token}</div>
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 3 }}>{fmtTime(entry.check_in_time)}</div>
                </div>

                {/* CUSTOMER + SERVICE */}
                <div className="wq-customer">
                  <div style={{ fontSize: 14, fontWeight: 700, color: DARK }}>{entry.customer_name || 'Walk-in'}</div>
                  {entry.phone && <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>{entry.phone}</div>}
                  <EntryServices entry={entry} svc={svc} services={services} MUTED={MUTED} />
                </div>

                {/* STAFF */}
                <div className="wq-staff">
                  {stf ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StaffAvatar name={stf.name} size={30} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{stf.name}</div>
                        {stf.role_title && <div style={{ fontSize: 11, color: MUTED }}>{stf.role_title}</div>}
                      </div>
                    </div>
                  ) : (
                    <select
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #D0D5DD', fontSize: 13, fontFamily: 'inherit', background: '#fff', color: DARK }}
                      value="" onChange={(e) => assignStaff(entry.id, e.target.value)}
                    >
                      <option value="" disabled>Assign staff…</option>
                      {staffList.filter((s) => s.is_active !== false).map((s) => (
                        <option key={s.id} value={s.id} disabled={busyStaffIds.has(s.id)}>
                          {s.name}{busyStaffIds.has(s.id) ? ' (Busy)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* STATUS + WAIT */}
                <div className="wq-status">
                  <Badge variant={entry.status} dot>{STATUS_LABELS[entry.status] || entry.status}</Badge>
                  {entry.status === 'waiting' && entry.estimated_wait != null && (
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>~{entry.estimated_wait} min</div>
                  )}
                </div>

                {/* ACTIONS */}
                <div className="wq-actions">
                  {entry.status === 'completed' ? (
                    <button disabled style={{
                      padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                      background: '#FEE2E2', color: '#B91C1C', border: '1.5px solid #FECACA',
                      cursor: 'not-allowed', fontFamily: 'inherit',
                    }}>✓ Paid</button>
                  ) : (entry.status === 'serving' || entry.status === 'waiting') && (
                    <Button
                      size="sm"
                      style={{ background: '#10b981', color: '#fff', border: 'none', fontWeight: 700 }}
                      onClick={() => openPayment(entry)}
                    >
                      Pay
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setShowToken(entry)}>Token</Button>
                  {(entry.status === 'waiting' || entry.status === 'serving') && (
                    <Button size="sm" variant="danger" onClick={() => changeStatus(entry.id, 'cancelled')}>Cancel</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/*  CHECK-IN MODAL  */}
      <Modal open={showCheckin} onClose={() => { setShowCheckin(false); setCustSearch(''); setCustResults([]); setCustAll([]); setSelectedCust(null); setShowCustDrop(false); }} title="New Walk-in Check-in" size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formError && (
            <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#B91C1C', fontSize: 13 }}>{formError}</div>
          )}

          {isAdmin && (
            <div>
              <Label>Branch</Label>
              <select style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #D0D5DD', fontSize: 14, fontFamily: 'inherit', background: '#fff', color: DARK }}
                value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">Select branch</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          {/* ── CUSTOMER SELECTION ── */}
          {selectedCust ? (
            /* SELECTED CUSTOMER CARD */
            <div style={{
              background: '#F0FDF4', border: '1.5px solid #86EFAC',
              borderRadius: 12, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                background: '#DCFCE7', color: '#16A34A',
                fontWeight: 800, fontSize: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid #86EFAC',
              }}>
                {selectedCust.name?.charAt(0)?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#14532D' }}>{selectedCust.name}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                  {selectedCust.phone && (
                    <span style={{ fontSize: 12, color: '#166534' }}>📞 {selectedCust.phone}</span>
                  )}
                  {selectedCust.loyalty_points > 0 && (
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99, background: '#FEF9C3', color: '#854D0E', fontWeight: 700 }}>
                      ★ {selectedCust.loyalty_points} pts
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={clearSelectedCust}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: '1.5px solid #86EFAC',
                  background: '#fff', color: '#16A34A', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                Change
              </button>
            </div>
          ) : (
            /* SEARCH BOX */
            <div style={{ position: 'relative' }} ref={custSearchRef}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Label style={{ margin: 0 }}>Customer Name *</Label>
                {custLoading && <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>Loading…</span>}
                {!custLoading && custAll.length > 0 && (
                  <span style={{ fontSize: 11, color: MUTED }}>{custAll.length} customers</span>
                )}
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder={custLoading ? 'Loading customers…' : 'Customer name or search existing…'}
                  value={custSearch}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustSearch(v);
                    setForm((f) => ({ ...f, customerName: v }));
                    setShowCustDrop(true);
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#6366f1'; setShowCustDrop(true); }}
                  onBlur={(e) => { e.target.style.borderColor = '#D0D5DD'; setTimeout(() => setShowCustDrop(false), 200); }}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 10,
                    border: '1.5px solid #D0D5DD', fontSize: 14, fontFamily: 'inherit',
                    background: '#FAFAFA', color: DARK, outline: 'none', boxSizing: 'border-box',
                  }}
                />
                {custLoading && (
                  <span style={{
                    position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 15, color: '#94A3B8', pointerEvents: 'none',
                  }}>⏳</span>
                )}
              </div>

              {/* DROPDOWN */}
              {showCustDrop && !custLoading && (custResults.length > 0 || custSearch.trim()) && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
                  background: '#fff', border: '1.5px solid #E4E7EC', borderRadius: 10,
                  boxShadow: '0 8px 28px rgba(16,24,40,0.14)', marginTop: 4,
                  maxHeight: 240, overflowY: 'auto',
                }}>
                  {custResults.length === 0 ? (
                    <div style={{ padding: '14px', fontSize: 13, color: '#94A3B8', textAlign: 'center' }}>
                      No customers found for "<strong>{custSearch}</strong>"
                    </div>
                  ) : (
                    <>
                      {custSearch.trim() && (
                        <div style={{ padding: '6px 14px', fontSize: 11, color: MUTED, background: '#F9FAFB', borderBottom: '1px solid #F2F4F7', fontWeight: 600 }}>
                          {custResults.length} result{custResults.length !== 1 ? 's' : ''} found
                        </div>
                      )}
                      {custResults.slice(0, 50).map((c) => (
                        <div key={c.id}
                          onMouseDown={() => selectCustomer(c)}
                          style={{
                            padding: '9px 14px', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', gap: 10, borderBottom: '1px solid #F2F4F7',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#F5F8FF')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                        >
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', background: '#EFF6FF',
                            color: '#2563EB', fontWeight: 700, fontSize: 13, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {c.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{c.name}</div>
                            {c.phone && <div style={{ fontSize: 11, color: MUTED }}>{c.phone}</div>}
                          </div>
                          {c.loyalty_points > 0 && (
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: '#FEF9C3', color: '#854D0E', fontWeight: 700 }}>
                              ★ {c.loyalty_points}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700, flexShrink: 0 }}>Select →</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* Loading skeleton */}
              {showCustDrop && custLoading && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
                  background: '#fff', border: '1.5px solid #E4E7EC', borderRadius: 10,
                  boxShadow: '0 8px 28px rgba(16,24,40,0.14)', marginTop: 4, padding: '12px 14px',
                }}>
                  {[1,2,3].map((i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#F2F4F7' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 12, borderRadius: 6, background: '#F2F4F7', width: '60%', marginBottom: 5 }} />
                        <div style={{ height: 10, borderRadius: 6, background: '#F2F4F7', width: '40%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* Phone — always visible */}
          <div>
            <Label>Phone <span style={{ color: MUTED, fontWeight: 400 }}>(optional)</span></Label>
            <Input
              placeholder="Phone number"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Label style={{ margin: 0 }}>Services * <span style={{ color: MUTED, fontWeight: 500 }}>(select one or more)</span></Label>
              {form.serviceIds.length > 0 && (
                <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700 }}>
                  {form.serviceIds.length} selected · {totalDuration} min total
                </span>
              )}
            </div>

            {/* Selected chips */}
            {form.serviceIds.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {selectedServices.map((s) => (
                  <span key={s.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 99,
                    background: '#EEF2FF', border: '1.5px solid #C7D2FE',
                    fontSize: 12, fontWeight: 600, color: '#4338CA',
                  }}>
                    {s.name}
                    <button
                      type="button"
                      onClick={() => toggleService(s.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }}
                    >×</button>
                  </span>
                ))}
              </div>
            )}

            {/* Service list */}
            <div style={{
              border: '1.5px solid #D0D5DD', borderRadius: 10,
              maxHeight: 180, overflowY: 'auto', background: '#FAFAFA',
            }}>
              {services.filter((s) => s.is_active !== false).map((s, idx, arr) => {
                const selected = form.serviceIds.includes(s.id) || form.serviceIds.includes(String(s.id));
                return (
                  <div
                    key={s.id}
                    onClick={() => toggleService(s.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', cursor: 'pointer',
                      background: selected ? '#EEF2FF' : 'transparent',
                      borderBottom: idx < arr.length - 1 ? '1px solid #F2F4F7' : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = '#F8F9FF'; }}
                    onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: `2px solid ${selected ? '#6366f1' : '#D0D5DD'}`,
                      background: selected ? '#6366f1' : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: selected ? 700 : 500, color: selected ? '#4338CA' : DARK }}>{s.name}</span>
                    </div>
                    <span style={{ fontSize: 11, color: MUTED, flexShrink: 0 }}>{s.duration_minutes} min</span>
                    {s.price && <span style={{ fontSize: 11, fontWeight: 600, color: '#059669', flexShrink: 0 }}>Rs. {Number(s.price).toLocaleString()}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {waitPreview != null && (
            <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#15803D', fontWeight: 600 }}>
              ⏳ Estimated wait: ~{waitPreview} min · {totalDuration} min service · {stats.waiting} ahead
            </div>
          )}

          <div>
            <Label>Notes</Label>
            <Textarea placeholder="Optional notes" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <Button variant="secondary" onClick={() => setShowCheckin(false)}>Cancel</Button>
          <Button onClick={handleCheckin} loading={saving} disabled={saving || (!selectedCust && !custSearch.trim()) || form.serviceIds.length === 0}>
            Check In
          </Button>
        </div>
      </Modal>

      {/*  TOKEN MODAL  */}
      {showToken && (
        <Modal open={!!showToken} onClose={() => setShowToken(null)} title="Queue Token" size="sm">
          <div id="walkin-print-root" style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 12, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
              Zane Salon · Walk-in Token
            </div>
            <div style={{
              width: 110, height: 110, borderRadius: 20, margin: '0 auto 16px',
              background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 46, fontWeight: 900, fontFamily: 'monospace', color: '#fff', letterSpacing: 2 }}>
                {showToken.token}
              </span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: DARK, marginBottom: 4 }}>{showToken.customer_name}</div>
            {showToken.service?.name && <div style={{ fontSize: 13, color: MUTED, marginBottom: 2 }}>{showToken.service.name}</div>}
            <div style={{ fontSize: 12, color: '#94A3B8' }}>{fmtTime(showToken.check_in_time)}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
            <Button variant="secondary" onClick={() => setShowToken(null)}>Close</Button>
            <Button onClick={() => window.print()}>Print</Button>
          </div>
        </Modal>
      )}

      {/*  PAYMENT MODAL  */}
      {payEntry && (
        <Modal open={!!payEntry} onClose={() => setPayEntry(null)} title="Collect Payment" size="sm">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Customer + Token info */}
            <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, background: '#1e293b', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 900, fontFamily: 'monospace', flexShrink: 0,
              }}>{payEntry.token}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: DARK }}>{payEntry.customer_name}</div>
                {payEntry.phone && <div style={{ fontSize: 12, color: MUTED }}>📞 {payEntry.phone}</div>}
              </div>
            </div>

            {/* Services breakdown */}
            {payEntry._allSvcs?.length > 0 && (
              <div style={{ border: '1px solid #E4E7EC', borderRadius: 10, overflow: 'hidden' }}>
                {payEntry._allSvcs.map((s, i) => (
                  <div key={s.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '9px 14px', borderBottom: i < payEntry._allSvcs.length - 1 ? '1px solid #F2F4F7' : 'none',
                  }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{s.name}</span>
                      <span style={{ fontSize: 11, color: MUTED, marginLeft: 8 }}>{s.duration_minutes} min</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>
                      {s.price ? `Rs. ${Number(s.price).toLocaleString()}` : '—'}
                    </span>
                  </div>
                ))}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', padding: '10px 14px',
                  background: '#F9FAFB', borderTop: '1.5px solid #E4E7EC',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: DARK }}>Total</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#059669' }}>
                    Rs. {Number(payAmount || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            {/* Payment method */}
            <div>
              <Label>Payment Method</Label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['Cash', 'Card', 'Online Transfer'].map((m) => (
                  <button key={m} type="button" onClick={() => setPayMethod(m)} style={{
                    padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                    border: `1.5px solid ${payMethod === m ? '#10b981' : '#D0D5DD'}`,
                    background: payMethod === m ? '#F0FDF4' : '#fff',
                    color: payMethod === m ? '#065F46' : DARK,
                  }}>{m}</button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div>
              <Label>Amount (Rs.) *</Label>
              <input
                type="number"
                min="0"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 10,
                  border: '1.5px solid #D0D5DD', fontSize: 14, fontFamily: 'inherit',
                  background: '#fff', color: DARK, outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#10b981')}
                onBlur={(e)  => (e.target.style.borderColor = '#D0D5DD')}
              />
            </div>

            {/* Note */}
            <div>
              <Label>Note <span style={{ color: MUTED, fontWeight: 400 }}>(optional)</span></Label>
              <input
                type="text"
                placeholder="e.g. discount applied…"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 10,
                  border: '1.5px solid #D0D5DD', fontSize: 14, fontFamily: 'inherit',
                  background: '#fff', color: DARK, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {payError && (
              <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 14px', color: '#B91C1C', fontSize: 13 }}>
                {payError}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setPayEntry(null)}>Cancel</Button>
            <Button
              loading={paying}
              disabled={paying || !payAmount}
              style={{ background: '#10b981', border: 'none' }}
              onClick={submitPayment}
            >
              Collect Rs. {Number(payAmount || 0).toLocaleString()}
            </Button>
          </div>
        </Modal>
      )}

    </PageWrapper>
  );
}
