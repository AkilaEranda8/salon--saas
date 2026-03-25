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
const EMPTY_FORM    = { customerName: '', phone: '', serviceId: '', branchId: '', note: '' };
const DARK          = '#101828';
const MUTED         = '#64748B';
const ACTIVE_PILL   = '#1e293b';
const ADDITIONAL_SERVICES_PREFIX = 'Additional services:';

/*  Helpers  */
const fmtTime = (t) => { if (!t) return ''; const [h, m] = t.split(':'); const hr = +h % 12 || 12; return `${hr}:${m} ${+h >= 12 ? 'PM' : 'AM'}`; };
const removeAdditionalServicesLine = (note = '') =>
  String(note)
    .split('\n')
    .filter((line) => !line.trim().startsWith(ADDITIONAL_SERVICES_PREFIX))
    .join('\n')
    .trim();

/*  Print CSS injected once  */
const PRINT_CSS = `@media print { body > *:not(#walkin-print-root) { display: none !important; } #walkin-print-root { display: block !important; } }`;

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
  const [checkinExtraServiceIds, setCheckinExtraServiceIds] = useState([]);
  const [formError,      setFormError]      = useState('');
  const [saving,         setSaving]         = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [clock,          setClock]          = useState(new Date());
  const [paymentEntry,   setPaymentEntry]   = useState(null);
  const [paymentMethod,  setPaymentMethod]  = useState('Cash');
  const [paymentAmount,  setPaymentAmount]  = useState('');
  const [paymentSaving,  setPaymentSaving]  = useState(false);
  const [paymentError,   setPaymentError]   = useState('');
  const [paymentOk,      setPaymentOk]      = useState(false);
  const [paymentServices,setPaymentServices]= useState([]);
  const [editEntry,      setEditEntry]      = useState(null);
  const [editForm,       setEditForm]       = useState({ customerName: '', phone: '', serviceId: '', note: '' });
  const [editExtraServiceIds, setEditExtraServiceIds] = useState([]);
  const [editSaving,     setEditSaving]     = useState(false);
  const [editError,      setEditError]      = useState('');

  const [custSearch,     setCustSearch]     = useState('');
  const [custResults,    setCustResults]    = useState([]);
  const [custAll,        setCustAll]        = useState([]);
  const [custLoading,    setCustLoading]    = useState(false);
  const [showCustDrop,   setShowCustDrop]   = useState(false);
  const custSearchRef = useRef(null);

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
  const filteredQueue = filterStatus === 'all' ? queue : queue.filter((e) => e.status === filterStatus);

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
  const parseAdditionalServiceIds = (note = '') => {
    const line = String(note).split('\n').find((l) => l.trim().startsWith(ADDITIONAL_SERVICES_PREFIX));
    if (!line) return [];
    const rawNames = line.replace(ADDITIONAL_SERVICES_PREFIX, '').split(',').map((s) => s.trim()).filter(Boolean);
    return rawNames
      .map((name) => services.find((s) => s.name === name)?.id)
      .filter(Boolean);
  };
  const calcServiceTotal = (ids) => ids.reduce((sum, sid) => {
    const svc = services.find((x) => Number(x.id) === Number(sid));
    return sum + Number(svc?.price || 0);
  }, 0);
  const openPayment = (entry) => {
    const svcId = Number(entry?.service_id || entry?.service?.id);
    const extraIds = parseAdditionalServiceIds(entry?.note);
    const ids = Array.from(new Set([...(svcId ? [svcId] : []), ...extraIds.map((x) => Number(x))]));
    const baseAmount = calcServiceTotal(ids);
    setPaymentEntry(entry);
    setPaymentMethod('Cash');
    setPaymentAmount(baseAmount > 0 ? String(baseAmount) : '');
    setPaymentError('');
    setPaymentOk(false);
    setPaymentServices(ids);
  };
  const togglePaymentService = (id) => {
    const nid = Number(id);
    setPaymentServices((prev) => {
      const next = prev.includes(nid) ? prev.filter((x) => x !== nid) : [...prev, nid];
      setPaymentAmount(calcServiceTotal(next));
      return next;
    });
  };
  const handleCollectPayment = async () => {
    if (!paymentEntry) return;
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      setPaymentError('Enter a valid amount.');
      return;
    }
    if (!paymentServices.length) {
      setPaymentError('Select at least one service.');
      return;
    }
    setPaymentSaving(true);
    setPaymentError('');
    try {
      await api.post('/payments', {
        branch_id: paymentEntry.branch_id || selectedBranch,
        staff_id: paymentEntry.staff_id || paymentEntry.staff?.id || null,
        service_id: paymentServices[0] || paymentEntry.service_id || paymentEntry.service?.id || null,
        customer_name: paymentEntry.customer_name || 'Walk-in',
        splits: [{ method: paymentMethod, amount: Number(paymentAmount) }],
      });
      if (paymentEntry.status !== 'completed') {
        await api.patch(`/walkin/${paymentEntry.id}/status`, { status: 'completed' });
      }
      setPaymentOk(true);
      toast('Payment collected successfully.', 'success');
      setTimeout(() => {
        setPaymentEntry(null);
        setPaymentOk(false);
      }, 1200);
    } catch (e) {
      setPaymentError(e.response?.data?.message || 'Payment collection failed.');
    } finally {
      setPaymentSaving(false);
    }
  };
  const openEdit = (entry) => {
    const extraIds = parseAdditionalServiceIds(entry.note);
    setEditEntry(entry);
    setEditForm({
      customerName: entry.customer_name || '',
      phone: entry.phone || '',
      serviceId: entry.service_id || entry.service?.id || '',
      note: removeAdditionalServicesLine(entry.note || ''),
    });
    setEditExtraServiceIds(extraIds);
    setEditError('');
  };
  const toggleEditExtraService = (id) => {
    const nid = Number(id);
    setEditExtraServiceIds((prev) => (
      prev.includes(nid) ? prev.filter((x) => x !== nid) : [...prev, nid]
    ));
  };
  const toggleCheckinExtraService = (id) => {
    const nid = Number(id);
    setCheckinExtraServiceIds((prev) => (
      prev.includes(nid) ? prev.filter((x) => x !== nid) : [...prev, nid]
    ));
  };
  const handleEditSave = async () => {
    if (!editEntry) return;
    if (!editForm.customerName.trim() || !editForm.serviceId) {
      setEditError('Customer name and service are required.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      const baseNote = removeAdditionalServicesLine(editForm.note || '');
      const extraServiceNames = services
        .filter((s) => editExtraServiceIds.includes(Number(s.id)))
        .map((s) => s.name);
      const fullNote = [
        baseNote,
        extraServiceNames.length ? `${ADDITIONAL_SERVICES_PREFIX} ${extraServiceNames.join(', ')}` : '',
      ].filter(Boolean).join('\n');
      await api.patch(`/walkin/${editEntry.id}`, {
        customerName: editForm.customerName.trim(),
        phone: editForm.phone || '',
        serviceId: Number(editForm.serviceId),
        note: fullNote,
      });
      toast('Walk-in entry updated.', 'success');
      setEditEntry(null);
    } catch (e) {
      setEditError(e.response?.data?.message || 'Update failed.');
    } finally {
      setEditSaving(false);
    }
  };

  /*  Check-in submit  */
  const handleCheckin = async () => {
    setSaving(true); setFormError('');
    try {
      const baseNote = removeAdditionalServicesLine(form.note || '');
      const extraServiceNames = services
        .filter((s) => checkinExtraServiceIds.includes(Number(s.id)))
        .map((s) => s.name);
      const fullNote = [
        baseNote,
        extraServiceNames.length ? `${ADDITIONAL_SERVICES_PREFIX} ${extraServiceNames.join(', ')}` : '',
      ].filter(Boolean).join('\n');
      const res = await api.post('/walkin/checkin', {
        customerName: form.customerName,
        phone:        form.phone      || undefined,
        branchId:     form.branchId   || selectedBranch,
        serviceId:    +form.serviceId,
        note:         fullNote        || undefined,
      });
      setShowCheckin(false);
      setForm({ ...EMPTY_FORM, branchId: selectedBranch });
      setCheckinExtraServiceIds([]);
      setShowToken(res.data);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Check-in failed.');
    } finally { setSaving(false); }
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
    setForm((f) => ({ ...f, customerName: c.name, phone: c.phone || '' }));
    setCustSearch(c.name);
    setShowCustDrop(false);
  };

  /*  Estimated wait preview  */
  const selectedService = services.find((s) => s.id === +form.serviceId);
  const waitPreview     = selectedService ? stats.waiting * (selectedService.duration_minutes || 30) : null;

  /*  Page actions  */
  const pageActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: DARK, letterSpacing: 1 }}>
        {clock.toLocaleTimeString()}
      </span>
      <Button variant="ghost" size="sm" onClick={() => window.open(`/token-display?branchId=${selectedBranch}`, '_blank')}>
        Token Display
      </Button>
      <Button size="sm" onClick={() => { setFormError(''); setForm({ ...EMPTY_FORM, branchId: selectedBranch }); setCheckinExtraServiceIds([]); setCustSearch(''); setCustResults([]); setCustAll([]); setShowCustDrop(false); setShowCheckin(true); }}>
        + New Walk-in
      </Button>
    </div>
  );

  /* 
     RENDER
      */
  return (
    <PageWrapper title="Walk-In Queue" subtitle="Real-time queue management" actions={pageActions}>
      <style>{PRINT_CSS}</style>

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
              <div key={entry.id} style={{
                background: '#fff', borderRadius: 14,
                boxShadow: '0 1px 4px rgba(16,24,40,0.06)',
                border: '1px solid #EAECF0',
                borderLeft: `5px solid ${STATUS_BORDER[entry.status] || '#E4E7EC'}`,
                padding: '16px 20px',
                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
              }}>

                {/* TOKEN */}
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 12,
                    background: '#1e293b', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 17, fontWeight: 900, fontFamily: 'monospace',
                    letterSpacing: 1,
                  }}>{entry.token}</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{fmtTime(entry.check_in_time)}</div>
                </div>

                {/* CUSTOMER + SERVICE */}
                <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: DARK }}>{entry.customer_name || 'Walk-in'}</div>
                  {entry.phone && <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>{entry.phone}</div>}
                  {svc.name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#344054' }}>{svc.name}</span>
                      {svc.duration_minutes && (
                        <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99, background: '#F1F5F9', color: MUTED, fontWeight: 600 }}>
                          {svc.duration_minutes} min
                        </span>
                      )}
                    </div>
                  )}
                  {entry.note && (
                    <div style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic', marginTop: 3 }}>{entry.note}</div>
                  )}
                </div>

                {/* STAFF */}
                <div style={{ flex: '0 0 170px' }}>
                  {stf ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StaffAvatar name={stf.name} size={32} />
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
                <div style={{ flexShrink: 0, minWidth: 90, textAlign: 'center' }}>
                  <Badge variant={entry.status} dot>{STATUS_LABELS[entry.status] || entry.status}</Badge>
                  {entry.status === 'waiting' && entry.estimated_wait != null && (
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>~{entry.estimated_wait} min wait</div>
                  )}
                  {entry.status === 'completed' && (
                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#ECFDF5', color: '#15803D', fontWeight: 700 }}>
                        Paid
                      </span>
                    </div>
                  )}
                </div>

                {/* ACTIONS */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                  {entry.status !== 'completed' && (
                    <Button size="sm" variant="ghost" onClick={() => openEdit(entry)}>Edit</Button>
                  )}
                  {entry.status === 'waiting' && (
                    <Button size="sm" onClick={() => changeStatus(entry.id, 'serving')}>Start</Button>
                  )}
                  {entry.status === 'serving' && (
                    <Button size="sm" onClick={() => openPayment(entry)}>Done & Collect</Button>
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
      <Modal open={showCheckin} onClose={() => { setShowCheckin(false); setCheckinExtraServiceIds([]); setCustSearch(''); setCustResults([]); setCustAll([]); setShowCustDrop(false); }} title="New Walk-in Check-in" size="md">
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

          {/* CUSTOMER SEARCH */}
          <div style={{ position: 'relative' }} ref={custSearchRef}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Label style={{ margin: 0 }}>Select Customer</Label>
              {custLoading && (
                <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>Loading…</span>
              )}
              {!custLoading && custAll.length > 0 && (
                <span style={{ fontSize: 11, color: MUTED }}>{custAll.length} customers loaded</span>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder={custLoading ? 'Loading customers…' : 'Search by name or phone…'}
                value={custSearch}
                onChange={(e) => { setCustSearch(e.target.value); setShowCustDrop(true); }}
                onBlur={(e) => { e.target.style.borderColor = '#D0D5DD'; setTimeout(() => setShowCustDrop(false), 200); }}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 10,
                  border: '1.5px solid #D0D5DD', fontSize: 14, fontFamily: 'inherit',
                  background: '#FAFAFA', color: DARK, outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#6366f1'; setShowCustDrop(true); }}
              />
            </div>

            {/* DROPDOWN — shows all or filtered */}
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94A3B8', fontSize: 12, fontWeight: 500 }}>
            <div style={{ flex: 1, height: 1, background: '#E4E7EC' }} />
            or enter manually
            <div style={{ flex: 1, height: 1, background: '#E4E7EC' }} />
          </div>

          <div>
            <Label>Customer Name *</Label>
            <Input placeholder="Name or 'Walk-in'" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
          </div>

          <div>
            <Label>Phone</Label>
            <Input placeholder="Optional" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>

          <div>
            <Label>Service *</Label>
            <select style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #D0D5DD', fontSize: 14, fontFamily: 'inherit', background: '#fff', color: DARK }}
              value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
              <option value="">Select service</option>
              {services.filter((s) => s.is_active !== false).map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {s.duration_minutes} min</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Additional Services (Optional)</Label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {services
                .filter((s) => s.is_active !== false && Number(s.id) !== Number(form.serviceId))
                .map((s) => {
                  const active = checkinExtraServiceIds.includes(Number(s.id));
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleCheckinExtraService(s.id)}
                      style={{ padding: '7px 12px', borderRadius: 10, border: `1.5px solid ${active ? '#2563EB' : '#E4E7EC'}`, background: active ? '#EFF6FF' : '#fff', color: active ? '#2563EB' : '#667085', fontWeight: active ? 700 : 500, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      {s.name}
                      {s.price ? <span style={{ marginLeft: 6, opacity: 0.65 }}>Rs.{Number(s.price).toLocaleString()}</span> : ''}
                    </button>
                  );
                })}
            </div>
          </div>

          {waitPreview != null && (
            <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#15803D', fontWeight: 600 }}>
              ⏳ Estimated wait: ~{waitPreview} min ({stats.waiting} ahead)
            </div>
          )}

          <div>
            <Label>Notes</Label>
            <Textarea placeholder="Optional notes" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <Button variant="secondary" onClick={() => setShowCheckin(false)}>Cancel</Button>
          <Button onClick={handleCheckin} loading={saving} disabled={saving || !form.customerName || !form.serviceId}>
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
      <Modal open={!!paymentEntry} onClose={() => setPaymentEntry(null)} title="Collect Walk-in Payment" size="sm">
        {paymentEntry && (
          paymentOk ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#059669' }}>Payment Recorded!</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {paymentError && (
                <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#B91C1C', fontSize: 13 }}>
                  {paymentError}
                </div>
              )}
              <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: DARK }}>{paymentEntry.customer_name || 'Walk-in'}</div>
                {paymentEntry.phone && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{paymentEntry.phone}</div>}
              </div>
              <div>
                <Label>Services *</Label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {services.filter((s) => s.is_active !== false).map((s) => {
                    const active = paymentServices.includes(Number(s.id));
                    return (
                      <button key={s.id} onClick={() => togglePaymentService(s.id)} style={{ padding: '7px 14px', borderRadius: 10, border: `1.5px solid ${active ? '#2563EB' : '#E4E7EC'}`, background: active ? '#EFF6FF' : '#fff', color: active ? '#2563EB' : '#667085', fontWeight: active ? 700 : 500, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {active && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        {s.name}
                        {s.price ? <span style={{ opacity: 0.65 }}>Rs.{Number(s.price).toLocaleString()}</span> : ''}
                      </button>
                    );
                  })}
                </div>
                {paymentServices.length === 0 && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 6 }}>Select at least one service</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <Label>Amount (Rs.) *</Label>
                  <Input
                    type="number"
                    min="0"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Payment Method *</Label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #D0D5DD', fontSize: 14, fontFamily: 'inherit', background: '#fff', color: DARK }}
                  >
                    {['Cash', 'Card', 'Bank Transfer', 'Online'].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #BBF7D0' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>Total</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>Rs. {Number(paymentAmount || 0).toLocaleString()}</span>
              </div>
            </div>
          )
        )}
        {!paymentOk && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setPaymentEntry(null)}>Cancel</Button>
            <Button onClick={handleCollectPayment} loading={paymentSaving} disabled={paymentSaving || !paymentAmount || Number(paymentAmount) <= 0}>
              Confirm Payment
            </Button>
          </div>
        )}
      </Modal>

      {/*  EDIT MODAL  */}
      <Modal open={!!editEntry} onClose={() => setEditEntry(null)} title="Edit Walk-in Entry" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {editError && (
            <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#B91C1C', fontSize: 13 }}>
              {editError}
            </div>
          )}
          <div>
            <Label>Customer Name *</Label>
            <Input
              value={editForm.customerName}
              onChange={(e) => setEditForm((f) => ({ ...f, customerName: e.target.value }))}
              placeholder="Customer name"
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={editForm.phone}
              onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label>Service *</Label>
            <select
              value={editForm.serviceId}
              onChange={(e) => setEditForm((f) => ({ ...f, serviceId: e.target.value }))}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #D0D5DD', fontSize: 14, fontFamily: 'inherit', background: '#fff', color: DARK }}
            >
              <option value="">Select service</option>
              {services.filter((s) => s.is_active !== false).map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {s.duration_minutes} min</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Additional Services (Optional)</Label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {services
                .filter((s) => s.is_active !== false && Number(s.id) !== Number(editForm.serviceId))
                .map((s) => {
                  const active = editExtraServiceIds.includes(Number(s.id));
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleEditExtraService(s.id)}
                      style={{ padding: '7px 12px', borderRadius: 10, border: `1.5px solid ${active ? '#2563EB' : '#E4E7EC'}`, background: active ? '#EFF6FF' : '#fff', color: active ? '#2563EB' : '#667085', fontWeight: active ? 700 : 500, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      {s.name}
                      {s.price ? <span style={{ marginLeft: 6, opacity: 0.65 }}>Rs.{Number(s.price).toLocaleString()}</span> : ''}
                    </button>
                  );
                })}
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={editForm.note}
              onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Optional notes"
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <Button variant="secondary" onClick={() => setEditEntry(null)}>Cancel</Button>
          <Button onClick={handleEditSave} loading={editSaving} disabled={editSaving || !editForm.customerName.trim() || !editForm.serviceId}>
            Save Changes
          </Button>
        </div>
      </Modal>

    </PageWrapper>
  );
}
