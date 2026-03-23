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

  /* Package selection */
  const [custPackages,  setCustPackages]  = useState([]);
  const [selectedPkg,   setSelectedPkg]   = useState(null);
  const [pkgLoading,    setPkgLoading]    = useState(false);

  /* Sell Package modal */
  const [showSellPkg,       setShowSellPkg]       = useState(false);
  const [sellPkgStep,       setSellPkgStep]       = useState(1);
  const [sellPkgCustomers,  setSellPkgCustomers]  = useState([]);
  const [sellPkgPackages,   setSellPkgPackages]   = useState([]);
  const [sellPkgCustSearch, setSellPkgCustSearch] = useState('');
  const [sellPkgForm,       setSellPkgForm]       = useState({ customer_id:'', package_id:'', payment_method:'Cash', notes:'' });
  const [sellPkgSaving,     setSellPkgSaving]     = useState(false);
  const [sellPkgError,      setSellPkgError]      = useState('');
  const [sellPkgOk,         setSellPkgOk]         = useState(false);

  /* Payment modal */
  const [payEntry,       setPayEntry]       = useState(null);
  const [payMethod,      setPayMethod]      = useState('Cash');
  const [payAmount,      setPayAmount]      = useState('');
  const [payNote,        setPayNote]        = useState('');
  const [paying,         setPaying]         = useState(false);
  const [payError,       setPayError]       = useState('');

  /* Edit modal */
  const [editEntry,      setEditEntry]      = useState(null);
  const [editForm,       setEditForm]       = useState({});
  const [editSaving,     setEditSaving]     = useState(false);
  const [editError,      setEditError]      = useState('');

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

  /*  Edit walk-in  */
  const openEdit = (entry) => {
    const extraMatch = entry.note?.match(/\[services:([\d,]+)\]/);
    const extraIds   = extraMatch ? extraMatch[1].split(',').map(Number) : [];
    const allIds     = [...new Set([entry.service_id, ...extraIds].filter(Boolean))];
    const cleanNote  = (entry.note || '').replace(/\[services:[\d,]+\]\s*/g, '').trim();
    setEditEntry(entry);
    setEditForm({
      customerName: entry.customer_name || '',
      phone:        entry.phone || '',
      serviceIds:   allIds.map(String),
      staffId:      entry.staff_id ? String(entry.staff_id) : '',
      note:         cleanNote,
    });
    setEditError('');
  };

  const submitEdit = async () => {
    if (!editForm.customerName.trim()) { setEditError('Customer name is required.'); return; }
    if (!editForm.serviceIds.length)   { setEditError('At least one service is required.'); return; }
    setEditSaving(true); setEditError('');
    try {
      await api.put(`/walkin/${editEntry.id}`, {
        customerName: editForm.customerName,
        phone:        editForm.phone || undefined,
        serviceIds:   editForm.serviceIds.map(Number),
        staffId:      editForm.staffId ? Number(editForm.staffId) : null,
        note:         editForm.note || undefined,
      });
      toast.success('Walk-in updated!');
      setEditEntry(null);
    } catch (err) {
      setEditError(err.response?.data?.message || 'Update failed.');
    } finally { setEditSaving(false); }
  };

  const toggleEditService = (id) => {
    const sid = String(id);
    setEditForm((f) => ({
      ...f,
      serviceIds: f.serviceIds.includes(sid)
        ? f.serviceIds.filter((s) => s !== sid)
        : [...f.serviceIds, sid],
    }));
  };

  /*  Sell Package  */
  const openSellPkg = (prefillCust = null) => {
    setSellPkgStep(prefillCust?.id ? 2 : 1);
    setSellPkgError(''); setSellPkgOk(false); setSellPkgCustSearch('');
    setSellPkgForm({ customer_id: prefillCust?.id ? String(prefillCust.id) : '', package_id:'', payment_method:'Cash', notes:'' });
    setSellPkgPackages([]); setSellPkgCustomers([]);
    setShowSellPkg(true);
    Promise.all([
      api.get('/packages'),
      api.get('/customers?limit=500'),
    ]).then(([pkgRes, custRes]) => {
      setSellPkgPackages((Array.isArray(pkgRes.data) ? pkgRes.data : (pkgRes.data?.data || [])).filter(p => p.is_active));
      setSellPkgCustomers(custRes.data?.data || custRes.data || []);
    }).catch(() => {});
  };

  const handleSellPkg = async () => {
    if (!sellPkgForm.customer_id) { setSellPkgError('Please select a customer.'); return; }
    if (!sellPkgForm.package_id)  { setSellPkgError('Please select a package.'); return; }
    const brId = selectedBranch || user?.branch_id;
    if (!brId) { setSellPkgError('Branch not available.'); return; }
    setSellPkgSaving(true); setSellPkgError('');
    try {
      await api.post('/packages/purchase', {
        customer_id:    Number(sellPkgForm.customer_id),
        package_id:     Number(sellPkgForm.package_id),
        branch_id:      Number(brId),
        payment_method: sellPkgForm.payment_method,
        notes:          sellPkgForm.notes || undefined,
      });
      setSellPkgOk(true);
      setTimeout(() => { setShowSellPkg(false); setSellPkgOk(false); }, 1600);
    } catch (err) { setSellPkgError(err.response?.data?.message || 'Purchase failed.'); }
    setSellPkgSaving(false);
  };

  const sellPkgFilteredCusts = sellPkgCustSearch.trim()
    ? sellPkgCustomers.filter(c => c.name?.toLowerCase().includes(sellPkgCustSearch.toLowerCase()) || c.phone?.includes(sellPkgCustSearch))
    : sellPkgCustomers;
  const sellPkgSelPkg  = sellPkgPackages.find(p  => String(p.id) === String(sellPkgForm.package_id));
  const sellPkgSelCust = sellPkgCustomers.find(c => String(c.id) === String(sellPkgForm.customer_id));

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
      // Redeem package session if one was selected
      if (selectedPkg && form.serviceIds.length > 0) {
        try {
          await api.post('/packages/redeem', {
            customerPackageId: selectedPkg.id,
            serviceId:         Number(form.serviceIds[0]),
            notes:             `Walk-in #${res.data?.tokenNumber || res.data?.id || ''}`,
          });
        } catch { /* non-fatal */ }
      }
      setShowCheckin(false);
      setForm({ ...EMPTY_FORM, branchId: selectedBranch });
      setCustSearch(''); setCustResults([]); setCustAll([]); setShowCustDrop(false);
      setSelectedCust(null); setSelectedPkg(null); setCustPackages([]);
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
    // Load active packages for this customer
    setCustPackages([]); setSelectedPkg(null); setPkgLoading(true);
    api.get(`/packages/customer/${c.id}/active`)
      .then((r) => setCustPackages(r.data || []))
      .catch(() => setCustPackages([]))
      .finally(() => setPkgLoading(false));
  };

  const clearSelectedCust = () => {
    setSelectedCust(null);
    setSelectedPkg(null);
    setCustPackages([]);
    setPkgLoading(false);
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
      <Button size="sm" style={{ background:'#7C3AED', color:'#fff', border:'none', fontWeight:700, display:'flex', alignItems:'center', gap:6 }}
        onClick={() => openSellPkg()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
        Sell Package
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
                  ) : entry.status === 'serving' && (
                    <Button
                      size="sm"
                      style={{ background: '#10b981', color: '#fff', border: 'none', fontWeight: 700 }}
                      onClick={() => openPayment(entry)}
                    >
                      Pay
                    </Button>
                  )}
                  {(entry.status === 'waiting' || entry.status === 'serving') && (
                    <Button size="sm" variant="ghost" onClick={() => openEdit(entry)}>Edit</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setShowToken(entry)}>Token</Button>
                  <Button size="sm"
                    style={{ background:'#F5F3FF', color:'#7C3AED', border:'1.5px solid #DDD6FE', fontWeight:700 }}
                    onClick={() => openSellPkg(entry.customer_id ? { id: entry.customer_id, name: entry.customer_name } : null)}
                    title="Sell Package">
                    PKG
                  </Button>
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
      <Modal open={showCheckin} onClose={() => { setShowCheckin(false); setCustSearch(''); setCustResults([]); setCustAll([]); setSelectedCust(null); setShowCustDrop(false); setSelectedPkg(null); setCustPackages([]); }} title="New Walk-in Check-in" size="md">
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

          {/* ── PACKAGES (shown when loading or has packages) ── */}
          {selectedCust && (pkgLoading || custPackages.length > 0) && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#98A2B3', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Packages
                {pkgLoading
                  ? <span style={{ fontSize: 11, fontWeight: 400, color: '#C4CAD4', textTransform: 'none', marginLeft: 6 }}>— loading…</span>
                  : <span style={{ fontSize: 11, fontWeight: 400, color: '#C4CAD4', textTransform: 'none', marginLeft: 6 }}>— click to use a session</span>
                }
              </div>
              {pkgLoading ? (
                <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#98A2B3', textAlign: 'center' }}>
                  Loading packages…
                </div>
              ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {custPackages.map((cp) => {
                  const isSel = selectedPkg?.id === cp.id;
                  const pkgSvcIds = cp.package?.services || [];
                  const sessLeft  = (cp.sessions_total || 0) - (cp.sessions_used || 0);
                  return (
                    <div key={cp.id} onClick={() => {
                      const next = isSel ? null : cp;
                      setSelectedPkg(next);
                      if (!isSel && pkgSvcIds.length > 0) {
                        const validIds = pkgSvcIds.map(String).filter((sid) =>
                          services.some((s) => String(s.id) === sid)
                        );
                        setForm((f) => ({ ...f, serviceIds: validIds }));
                      }
                    }} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                      border: `1.5px solid ${isSel ? '#7C3AED' : '#E4E7EC'}`,
                      background: isSel ? '#F5F3FF' : '#FAFAFA',
                      transition: 'all 0.15s',
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                        background: isSel ? '#7C3AED' : '#E9D5FF',
                        color: isSel ? '#fff' : '#6D28D9',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 800,
                      }}>PKG</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: isSel ? '#5B21B6' : DARK }}>{cp.package?.name || 'Package'}</div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>
                          {sessLeft} session{sessLeft !== 1 ? 's' : ''} left · expires {cp.expiry_date}
                        </div>
                      </div>
                      {isSel && <span style={{ fontSize: 12, color: '#7C3AED', fontWeight: 700, flexShrink: 0 }}>✓ Using</span>}
                    </div>
                  );
                })}
                {selectedPkg && (
                  <div style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600, marginTop: 2 }}>
                    Package session will be redeemed on check-in
                  </div>
                )}
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
                {selectedServices.map((s) => {
                  const pkgSvcIds    = (selectedPkg?.package?.services || []).map(Number);
                  const coveredByPkg = pkgSvcIds.includes(Number(s.id));
                  return (
                    <span key={s.id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 99,
                      background: coveredByPkg ? '#EDE9FE' : '#EEF2FF',
                      border: `1.5px solid ${coveredByPkg ? '#C4B5FD' : '#C7D2FE'}`,
                      fontSize: 12, fontWeight: 600, color: coveredByPkg ? '#5B21B6' : '#4338CA',
                    }}>
                      {s.name}{coveredByPkg && <span style={{ fontSize: 10, marginLeft: 3, opacity: 0.8 }}>(FREE)</span>}
                      <button
                        type="button"
                        onClick={() => toggleService(s.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: coveredByPkg ? '#7C3AED' : '#6366f1', fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }}
                      >×</button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Service list */}
            <div style={{
              border: '1.5px solid #D0D5DD', borderRadius: 10,
              maxHeight: 180, overflowY: 'auto', background: '#FAFAFA',
            }}>
              {services.filter((s) => s.is_active !== false).map((s, idx, arr) => {
                const selected      = form.serviceIds.includes(s.id) || form.serviceIds.includes(String(s.id));
                const pkgSvcIds     = (selectedPkg?.package?.services || []).map(Number);
                const coveredByPkg  = pkgSvcIds.includes(Number(s.id));
                return (
                  <div
                    key={s.id}
                    onClick={() => toggleService(s.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', cursor: 'pointer',
                      background: selected ? (coveredByPkg ? '#F5F3FF' : '#EEF2FF') : 'transparent',
                      borderBottom: idx < arr.length - 1 ? '1px solid #F2F4F7' : 'none',
                      border: coveredByPkg ? '1px solid #DDD6FE' : 'none',
                      borderRadius: coveredByPkg ? 8 : 0,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = '#F8F9FF'; }}
                    onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: `2px solid ${selected ? (coveredByPkg ? '#7C3AED' : '#6366f1') : '#D0D5DD'}`,
                      background: selected ? (coveredByPkg ? '#7C3AED' : '#6366f1') : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: selected ? 700 : 500, color: selected ? (coveredByPkg ? '#5B21B6' : '#4338CA') : DARK }}>{s.name}</span>
                      {coveredByPkg && <span style={{ fontSize: 10, color: '#7C3AED', fontWeight: 800, background: '#EDE9FE', padding: '1px 6px', borderRadius: 4 }}>PKG</span>}
                    </div>
                    <span style={{ fontSize: 11, color: MUTED, flexShrink: 0 }}>{s.duration_minutes} min</span>
                    {coveredByPkg ? (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {s.price && <span style={{ fontSize: 10, color: '#94A3B8', textDecoration: 'line-through', display: 'block' }}>Rs.{Number(s.price).toLocaleString()}</span>}
                        <span style={{ fontSize: 11, color: '#7C3AED', fontWeight: 800 }}>FREE</span>
                      </div>
                    ) : (
                      s.price && <span style={{ fontSize: 11, fontWeight: 600, color: '#059669', flexShrink: 0 }}>Rs.{Number(s.price).toLocaleString()}</span>
                    )}
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

      {/*  EDIT MODAL  */}
      {editEntry && (
        <Modal open={!!editEntry} onClose={() => setEditEntry(null)} title="Edit Walk-in" size="md">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {editError && (
              <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 14px', color: '#B91C1C', fontSize: 13 }}>{editError}</div>
            )}

            <div>
              <Label>Customer Name *</Label>
              <Input value={editForm.customerName} onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })} placeholder="Customer name" />
            </div>

            <div>
              <Label>Phone <span style={{ color: MUTED, fontWeight: 400 }}>(optional)</span></Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Phone number" />
            </div>

            {/* Staff assign */}
            <div>
              <Label>Assign Staff</Label>
              <select
                value={editForm.staffId}
                onChange={(e) => setEditForm({ ...editForm, staffId: e.target.value })}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #D0D5DD', fontSize: 14, fontFamily: 'inherit', background: '#fff', color: DARK }}
              >
                <option value="">— Unassigned —</option>
                {staffList.filter((s) => s.is_active !== false).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{busyStaffIds.has(s.id) ? ' (Busy)' : ''}</option>
                ))}
              </select>
            </div>

            {/* Services multi-select */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Label style={{ margin: 0 }}>Services *</Label>
                {editForm.serviceIds.length > 0 && (
                  <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700 }}>
                    {editForm.serviceIds.length} selected
                  </span>
                )}
              </div>
              {/* Selected chips */}
              {editForm.serviceIds.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {services.filter((s) => editForm.serviceIds.includes(String(s.id))).map((s) => (
                    <span key={s.id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 99,
                      background: '#EEF2FF', border: '1.5px solid #C7D2FE',
                      fontSize: 12, fontWeight: 600, color: '#4338CA',
                    }}>
                      {s.name}
                      <button type="button" onClick={() => toggleEditService(s.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ border: '1.5px solid #D0D5DD', borderRadius: 10, maxHeight: 180, overflowY: 'auto', background: '#FAFAFA' }}>
                {services.filter((s) => s.is_active !== false).map((s, idx, arr) => {
                  const selected = editForm.serviceIds.includes(String(s.id));
                  return (
                    <div key={s.id} onClick={() => toggleEditService(s.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer',
                      background: selected ? '#EEF2FF' : 'transparent',
                      borderBottom: idx < arr.length - 1 ? '1px solid #F2F4F7' : 'none',
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
                      <span style={{ flex: 1, fontSize: 13, fontWeight: selected ? 700 : 500, color: selected ? '#4338CA' : DARK }}>{s.name}</span>
                      <span style={{ fontSize: 11, color: MUTED }}>{s.duration_minutes} min</span>
                      {s.price && <span style={{ fontSize: 11, fontWeight: 600, color: '#059669' }}>Rs. {Number(s.price).toLocaleString()}</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>Notes <span style={{ color: MUTED, fontWeight: 400 }}>(optional)</span></Label>
              <Textarea rows={2} value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} placeholder="Optional notes" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setEditEntry(null)}>Cancel</Button>
            <Button loading={editSaving} disabled={editSaving} onClick={submitEdit}>Save Changes</Button>
          </div>
        </Modal>
      )}

      {/*  SELL PACKAGE MODAL  */}
      <Modal open={showSellPkg} onClose={() => { setShowSellPkg(false); setSellPkgOk(false); }} title="Sell Package" size="md">
        {sellPkgOk ? (
          <div style={{ textAlign:'center', padding:'28px 0' }}>
            <div style={{ width:64, height:64, borderRadius:'50%', background:'#F5F3FF', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div style={{ fontSize:17, fontWeight:700, color:'#7C3AED', fontFamily:'inherit' }}>Package Sold!</div>
            <div style={{ fontSize:13, color:MUTED, marginTop:6 }}>{sellPkgSelCust?.name} has been assigned the package.</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {/* Stepper */}
            <div style={{ display:'flex', alignItems:'center', marginBottom:22 }}>
              {[['Customer',1],['Package',2],['Payment',3]].map(([label, step], i, arr) => {
                const done = sellPkgStep > step, active = sellPkgStep === step;
                return (
                  <div key={step} style={{ display:'flex', alignItems:'center', flex: i < arr.length-1 ? 1 : 'none' }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3, flexShrink:0 }}>
                      <div style={{ width:30, height:30, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, fontFamily:'inherit',
                        background:done?'#7C3AED':active?'#F5F3FF':'#F2F4F7',
                        border:active?'2px solid #7C3AED':done?'none':'2px solid #D0D5DD',
                        color:done?'#fff':active?'#7C3AED':'#64748B' }}>
                        {done ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : step}
                      </div>
                      <span style={{ fontSize:10, fontWeight:600, color:active?'#7C3AED':'#64748B', fontFamily:'inherit', whiteSpace:'nowrap' }}>{label}</span>
                    </div>
                    {i < arr.length-1 && <div style={{ flex:1, height:2, background:done?'#7C3AED':'#E4E7EC', margin:'0 6px', marginBottom:18 }} />}
                  </div>
                );
              })}
            </div>

            {/* Step 1: Customer */}
            {sellPkgStep === 1 && (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div style={{ fontSize:12, fontWeight:700, color:DARK }}>Search Customer</div>
                <input value={sellPkgCustSearch} onChange={e=>setSellPkgCustSearch(e.target.value)} placeholder="Name or phone..."
                  style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:DARK }}
                  onFocus={e=>e.target.style.borderColor='#7C3AED'} onBlur={e=>e.target.style.borderColor='#E4E7EC'} />
                <div style={{ maxHeight:220, overflowY:'auto', border:'1.5px solid #E4E7EC', borderRadius:10 }}>
                  {sellPkgCustomers.length === 0 ? (
                    <div style={{ textAlign:'center', padding:20, color:'#98A2B3', fontSize:13 }}>Loading customers…</div>
                  ) : sellPkgFilteredCusts.length === 0 ? (
                    <div style={{ textAlign:'center', padding:20, color:'#98A2B3', fontSize:13 }}>No customers found</div>
                  ) : sellPkgFilteredCusts.slice(0,30).map(c => {
                    const sel = String(c.id) === String(sellPkgForm.customer_id);
                    return (
                      <div key={c.id} onClick={() => setSellPkgForm(f=>({...f, customer_id:String(c.id)}))}
                        style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                          background:sel?'#F5F3FF':'#fff', borderBottom:'1px solid #F2F4F7',
                          cursor:'pointer', borderLeft:`3px solid ${sel?'#7C3AED':'transparent'}` }}
                        onMouseEnter={e=>{ if(!sel) e.currentTarget.style.background='#FAFAFA'; }}
                        onMouseLeave={e=>{ if(!sel) e.currentTarget.style.background=sel?'#F5F3FF':'#fff'; }}>
                        <div style={{ width:34, height:34, borderRadius:'50%', background:'#EDE9FE', color:'#7C3AED', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          {(c.name||'?')[0].toUpperCase()}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:DARK }}>{c.name}</div>
                          {c.phone && <div style={{ fontSize:11, color:MUTED }}>{c.phone}</div>}
                        </div>
                        {sel && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                    );
                  })}
                </div>
                {sellPkgSelCust && (
                  <div style={{ padding:'10px 14px', background:'linear-gradient(135deg,#7C3AED,#2563EB)', borderRadius:10, color:'#fff' }}>
                    <span style={{ fontSize:14, fontWeight:700 }}>{sellPkgSelCust.name}</span>
                    {sellPkgSelCust.phone && <span style={{ fontSize:12, opacity:0.8, marginLeft:8 }}>{sellPkgSelCust.phone}</span>}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Package */}
            {sellPkgStep === 2 && (
              <div>
                {sellPkgSelCust && (
                  <div style={{ background:'#F9FAFB', borderRadius:8, padding:'8px 12px', fontSize:12, color:MUTED, marginBottom:14 }}>
                    Customer: <strong style={{ color:DARK }}>{sellPkgSelCust.name}</strong>
                  </div>
                )}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, maxHeight:300, overflowY:'auto' }}>
                  {sellPkgPackages.length === 0 ? (
                    <div style={{ gridColumn:'1/-1', textAlign:'center', padding:24, color:'#98A2B3', fontSize:13 }}>Loading packages…</div>
                  ) : sellPkgPackages.map(p => {
                    const sel = String(p.id) === String(sellPkgForm.package_id);
                    const accent = p.type === 'bundle' ? '#2563EB' : '#7C3AED';
                    return (
                      <div key={p.id} onClick={() => setSellPkgForm(f=>({...f, package_id:String(p.id)}))}
                        style={{ padding:'12px 14px', borderRadius:10, cursor:'pointer', transition:'all 0.15s', position:'relative',
                          border:sel?`2px solid ${accent}`:'1.5px solid #E4E7EC', borderTop:`3px solid ${accent}`,
                          background:sel?(p.type==='bundle'?'#EFF6FF':'#F5F3FF'):'#fff' }}>
                        <div style={{ fontSize:12, fontWeight:700, color:DARK, marginBottom:2 }}>{p.name}</div>
                        <div style={{ fontSize:11, color:MUTED }}>{p.sessions_count} sessions · {p.validity_days} days</div>
                        <div style={{ fontSize:15, fontWeight:800, color:DARK, marginTop:6 }}>Rs. {Number(p.package_price).toLocaleString()}</div>
                        {Number(p.discount_percent) > 0 && (
                          <span style={{ position:'absolute', top:8, right:8, fontSize:10, color:'#059669', fontWeight:700, background:'#D1FAE5', padding:'2px 7px', borderRadius:10 }}>{Math.round(p.discount_percent)}% OFF</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Payment */}
            {sellPkgStep === 3 && (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {sellPkgSelCust && (
                  <div style={{ background:'#F9FAFB', borderRadius:10, padding:'10px 14px', fontSize:13 }}>
                    <span style={{ fontWeight:600, color:DARK }}>Customer: </span>
                    <span style={{ color:MUTED }}>{sellPkgSelCust.name}</span>
                  </div>
                )}
                {sellPkgSelPkg && (
                  <div style={{ padding:14, background:'linear-gradient(135deg,#7C3AED 0%,#2563EB 100%)', borderRadius:12, color:'#fff' }}>
                    <div style={{ fontSize:11, opacity:0.75, marginBottom:4, letterSpacing:'0.06em' }}>PACKAGE</div>
                    <div style={{ fontSize:16, fontWeight:800, marginBottom:10 }}>{sellPkgSelPkg.name}</div>
                    <div style={{ display:'flex', gap:20 }}>
                      {[[sellPkgSelPkg.sessions_count,'Sessions'],[`${sellPkgSelPkg.validity_days}d`,'Validity'],[`Rs.${Number(sellPkgSelPkg.package_price).toLocaleString()}`,'Price']].map(([val,lbl]) => (
                        <div key={lbl} style={{ textAlign:'center' }}>
                          <div style={{ fontSize:14, fontWeight:800 }}>{val}</div>
                          <div style={{ fontSize:10, opacity:0.8 }}>{lbl}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#98A2B3', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Payment Method</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {['Cash','Card','Online Transfer'].map(m => (
                      <button key={m} type="button" onClick={() => setSellPkgForm(f=>({...f,payment_method:m}))} style={{
                        padding:'7px 16px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                        border:`1.5px solid ${sellPkgForm.payment_method===m?'#7C3AED':'#D0D5DD'}`,
                        background:sellPkgForm.payment_method===m?'#F5F3FF':'#fff',
                        color:sellPkgForm.payment_method===m?'#5B21B6':DARK,
                      }}>{m}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#98A2B3', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Notes (optional)</div>
                  <input value={sellPkgForm.notes} onChange={e=>setSellPkgForm(f=>({...f,notes:e.target.value}))} placeholder="Any notes..."
                    style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:DARK }}
                    onFocus={e=>e.target.style.borderColor='#7C3AED'} onBlur={e=>e.target.style.borderColor='#E4E7EC'} />
                </div>
              </div>
            )}

            {sellPkgError && <div style={{ marginTop:12, padding:'9px 13px', background:'#FEE2E2', borderRadius:8, color:'#DC2626', fontSize:13, border:'1px solid #FEE2E2' }}>{sellPkgError}</div>}

            <div style={{ display:'flex', justifyContent:'space-between', marginTop:20 }}>
              <Button variant="secondary" onClick={() => { if(sellPkgStep>1){setSellPkgStep(s=>s-1);setSellPkgError('');}else setShowSellPkg(false); }}>
                {sellPkgStep===1?'Cancel':'← Back'}
              </Button>
              {sellPkgStep < 3 ? (
                <Button style={{ background:'#7C3AED', color:'#fff', border:'none', fontWeight:700 }} onClick={() => {
                  if(sellPkgStep===1&&!sellPkgForm.customer_id){setSellPkgError('Please select a customer.');return;}
                  if(sellPkgStep===2&&!sellPkgForm.package_id){setSellPkgError('Please select a package.');return;}
                  setSellPkgError(''); setSellPkgStep(s=>s+1);
                }}>Next →</Button>
              ) : (
                <Button loading={sellPkgSaving} disabled={sellPkgSaving}
                  style={{ background:'#7C3AED', color:'#fff', border:'none', fontWeight:700 }}
                  onClick={handleSellPkg}>
                  {sellPkgSaving?'Processing…':`Sell · Rs.${Number(sellPkgSelPkg?.package_price||0).toLocaleString()}`}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

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
