import React, { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import usePageTheme from '../hooks/usePageTheme';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import { Input, Label, Textarea, Select } from '../components/ui/FormElements';
import { computePromoFromDiscount } from '../utils/promoDiscount';
import { getKcAccessToken } from '../utils/kcTokenStore';
import {
  PKModal as Modal, StatCard, StaffAvatar,
  IconUsers, IconCheck, IconClock, IconCalendar, IconClose,
} from '../components/ui/PageKit';
import {
  ADDITIONAL_SERVICES_PREFIX,
  parseAdditionalServiceIdsFromNote,
  getWalkInOrderedServiceIds,
  getWalkInServicesTitle,
} from '../utils/walkInHelpers';

/*  Constants  */
const STATUS_BORDER = { waiting: '#f59e0b', serving: '#10b981', completed: '#94a3b8', cancelled: '#ef4444' };
const STATUS_LABELS = { waiting: 'Waiting', serving: 'In Service', completed: 'Completed', cancelled: 'Cancelled' };
const FILTER_PILLS  = ['all', 'waiting', 'serving', 'completed', 'cancelled'];
const EMPTY_FORM    = { customerName: '', phone: '', serviceId: '', branchId: '', note: '' };
const DARK          = '#101828';
const MUTED         = '#64748B';
const ACTIVE_PILL   = '#1e293b';

/*  Helpers  */
const fmtTime = (t) => { if (!t) return ''; const [h, m] = t.split(':'); const hr = +h % 12 || 12; return `${hr}:${m} ${+h >= 12 ? 'PM' : 'AM'}`; };
const removeAdditionalServicesLine = (note = '') =>
  String(note)
    .split('\n')
    .filter((line) => !line.trim().startsWith(ADDITIONAL_SERVICES_PREFIX))
    .join('\n')
    .trim();
const getCustomerPhone = (customer = {}) => (
  customer.phone
  || customer.phone_number
  || customer.mobile
  || customer.mobile_number
  || customer.contact
  || customer.contact_number
  || ''
);

/*  Print CSS injected once  */
const PRINT_CSS = `@media print { body > *:not(#walkin-print-root) { display: none !important; } #walkin-print-root { display: block !important; } }`;

// ── HelaPay QR Panel (Walk-in) ────────────────────────────────────────────────
function WalkInQRPanel({ amount, reference, onClose, onSuccess }) {
  const [qrData,   setQrData]   = useState(null);
  const [status,   setStatus]   = useState('generating');
  const [errMsg,   setErrMsg]   = useState('');
  const pollRef = useRef(null);
  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  useEffect(() => {
    (async () => {
      try {
        const res = await api.post('/helapay/qr', { reference: String(reference), amount: Number(amount) });
        setQrData(res.data.qr_data);
        setStatus('waiting');
        const ref2 = res.data.reference;
        const qrRef = res.data.qr_reference;
        stopPoll();
        pollRef.current = setInterval(async () => {
          try {
            const r2 = await api.post('/helapay/status', { reference: ref2, qr_reference: qrRef });
            const ps = r2.data?.sale?.payment_status;
            if (ps === 2)  { stopPoll(); setStatus('success'); setTimeout(onSuccess, 1200); }
            else if (ps === -1) { stopPoll(); setStatus('failed'); }
          } catch { }
        }, 3000);
      } catch (e) {
        setErrMsg(e.response?.data?.message || 'QR generation failed.');
        setStatus('error');
      }
    })();
    return stopPoll;
  }, []);

  const qrUrl = qrData ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&ecc=M&data=${encodeURIComponent(qrData)}` : null;
  const colors = { generating:'#2563EB', waiting:'#D97706', success:'#059669', failed:'#DC2626', error:'#DC2626' };
  const labels = { generating:'Generating QR…', waiting:'Waiting for payment…', success:'Payment Received!', failed:'Payment Failed', error:'Error' };
  const c = colors[status]; const l = labels[status];

  return (
    <div style={{ background:'#fff', borderRadius:24, width:340, maxWidth:'92vw', boxShadow:'0 32px 80px rgba(0,0,0,0.3)', overflow:'hidden' }}>
      <div style={{ background:'linear-gradient(135deg,#1e3a5f,#0f2340)', padding:'18px 22px 14px', textAlign:'center' }}>
        <div style={{ color:'#fff', fontWeight:800, fontSize:16, letterSpacing:1 }}>LankaQR Payment</div>
        <div style={{ color:'#93C5FD', fontSize:13, marginTop:3 }}>Rs. {Number(amount||0).toLocaleString()}</div>
      </div>
      <div style={{ padding:'20px 22px 16px', textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:7, background:c+'18', border:`1px solid ${c}40`, borderRadius:99, padding:'5px 14px', marginBottom:16, fontSize:13, fontWeight:700, color:c }}>
          {l}
          {status === 'waiting' && <span style={{ display:'inline-block', width:13, height:13, border:`2px solid ${c}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', marginLeft:4 }} />}
        </div>
        {qrUrl && status === 'waiting' && (
          <div style={{ display:'inline-block', padding:10, border:'1.5px solid #E4E7EC', borderRadius:14, boxShadow:'0 4px 14px rgba(0,0,0,0.07)', marginBottom:12 }}>
            <img src={qrUrl} alt="LankaQR" width={200} height={200} style={{ display:'block', borderRadius:6 }} />
          </div>
        )}
        {status === 'success' && <div style={{ fontSize:40, marginBottom:8 }}>✅</div>}
        {status === 'failed'  && <div style={{ fontSize:40, marginBottom:8 }}>❌</div>}
        {status === 'error'   && <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#B91C1C', marginBottom:12 }}>{errMsg}</div>}
        {status === 'waiting' && <div style={{ fontSize:12, color:'#667085', marginBottom:4 }}>Ask the customer to scan with any LankaQR app</div>}
      </div>
      <div style={{ padding:'10px 22px 18px', display:'flex', gap:8, justifyContent:'center', borderTop:'1px solid #F2F4F7' }}>
        {(status === 'failed' || status === 'error') && <button onClick={onClose} style={{ padding:'9px 22px', borderRadius:9, border:'none', background:'#EF4444', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>Close</button>}
        {status === 'waiting' && <button onClick={() => { stopPoll(); onClose(); }} style={{ padding:'9px 22px', borderRadius:9, border:'1px solid #E5E7EB', background:'#fff', color:'#374151', fontWeight:600, fontSize:13, cursor:'pointer' }}>Cancel</button>}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function WalkInSection({ title, desc, children, dark = false }) {
  return (
    <div style={{
      border: `1px solid ${dark ? '#334155' : '#E4E7EC'}`,
      borderRadius: 14,
      background: dark ? '#0F172A' : '#fff',
    }}>
      <div style={{
        padding: '12px 16px',
        background: dark ? '#1E293B' : '#F8FAFC',
        borderBottom: `1px solid ${dark ? '#334155' : '#EEF2F7'}`,
        borderRadius: '14px 14px 0 0',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: dark ? '#E2E8F0' : '#101828' }}>{title}</div>
        {desc && <div style={{ fontSize: 11, color: dark ? '#94A3B8' : '#64748B', marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  );
}

function WalkInModal({ open, onClose, title, subtitle, children, footer, size = 'lg', dark = false }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  if (!open) return null;
  const widths = { sm: 420, md: 560, lg: 720, xl: 900 };
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(16,24,40,0.5)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: widths[size] ?? 720,
        background: dark ? '#111827' : '#fff', borderRadius: 18, display: 'flex', flexDirection: 'column',
        boxShadow: dark ? '0 24px 64px rgba(2,6,23,0.55)' : '0 24px 64px rgba(16,24,40,0.2)',
        maxHeight: '92vh', animation: 'walkin-modal-pop 0.2s ease',
        border: dark ? '1px solid #334155' : '1px solid #E4E7EC',
      }}>
        <style>{'@keyframes walkin-modal-pop { from { opacity:0; transform:scale(0.97) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }'}</style>
        <div style={{
          padding: '18px 22px',
          background: dark
            ? 'linear-gradient(135deg,#78350f 0%,#1e3a8a 100%)'
            : 'linear-gradient(135deg,#FFFBEB 0%,#FEF3C7 45%,#FFF7ED 100%)',
          borderBottom: `1px solid ${dark ? '#334155' : '#FDE68A'}`,
          borderRadius: '18px 18px 0 0',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0, gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: dark ? 'rgba(255,255,255,0.12)' : '#fff',
              border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #FCD34D',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: dark ? '#FCD34D' : '#D97706',
              boxShadow: dark ? 'none' : '0 2px 8px rgba(217,119,6,0.15)',
            }}>
              <IconClock />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: dark ? '#F8FAFC' : '#0F172A', fontFamily: "'Inter',sans-serif", letterSpacing: '-0.02em' }}>{title}</h3>
              {subtitle && <p style={{ margin: '4px 0 0', fontSize: 12, color: dark ? '#CBD5E1' : '#475569', lineHeight: 1.45 }}>{subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{
              background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.85)',
              border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : '#E4E7EC'}`,
              cursor: 'pointer', color: dark ? '#E2E8F0' : '#64748B',
              display: 'flex', alignItems: 'center', borderRadius: 10, padding: 7, flexShrink: 0,
            }}>
            <IconClose />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', background: dark ? '#111827' : '#F8FAFC' }}>{children}</div>
        {footer && (
          <div style={{
            padding: '14px 22px', borderTop: `1px solid ${dark ? '#334155' : '#E4E7EC'}`,
            display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0,
            background: dark ? '#0F172A' : '#fff', borderRadius: '0 0 18px 18px', width: '100%', boxSizing: 'border-box',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default function WalkInPage() {
  const { user }  = useAuth();
  const { isDark } = useTheme();
  const { C } = usePageTheme();
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
  const [qrModal,        setQrModal]        = useState(null);
  const [paymentServices,setPaymentServices]= useState([]);
  const [paymentDiscountId, setPaymentDiscountId] = useState('');
  const [paymentDiscounts, setPaymentDiscounts] = useState([]);
  const [paymentCustPackages, setPaymentCustPackages] = useState([]);
  const [paymentCustPackageId, setPaymentCustPackageId] = useState('');
  const [loadingPaymentPkgs, setLoadingPaymentPkgs] = useState(false);
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
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const custSearchRef = useRef(null);
  const [custDropPos, setCustDropPos] = useState({ top: 0, left: 0, width: 0 });

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
    api.get('/staff', { params: { branchId: selectedBranch, limit: 500 } }).then((r) => setStaffList(r.data.data || r.data || [])).catch(() => {});
  }, [selectedBranch]);

  /*  Fetch queue + stats  */
  const fetchData = useCallback(async () => {
    if (!selectedBranch) return;
    setLoading(true); setError('');
    try {
      const [qRes, sRes] = await Promise.all([
        api.get('/walkin', { params: { branchId: selectedBranch } }),
        api.get('/walkin/stats', { params: { branchId: selectedBranch } }),
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

  /*  Polling fallback — refreshes every 30 s regardless of socket state  */
  useEffect(() => {
    if (!selectedBranch) return;
    const t = setInterval(fetchData, 30000);
    return () => clearInterval(t);
  }, [selectedBranch, fetchData]);

  /*  Socket.io — pass KC access token so backend auth middleware accepts it  */
  useEffect(() => {
    if (!selectedBranch) return;
    const token = getKcAccessToken();
    const socket = token ? io({ auth: { token } }) : io();
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
    try {
      await api.patch(`/walkin/${id}/status`, { status });
      fetchData();
    } catch {
      /* socket refreshes */
    }
  };
  const assignStaff = async (id, staffId) => {
    try {
      await api.patch(`/walkin/${id}/assign`, { staffId: +staffId });
      fetchData();
    } catch {
      /* socket refreshes */
    }
  };
  const removeEntry = async (id) => {
    try {
      await api.delete(`/walkin/${id}`);
      fetchData();
    } catch {
      /* socket refreshes */
    }
  };
  const parseAdditionalServiceIds = (note = '') => parseAdditionalServiceIdsFromNote(note, services);
  const calcServiceTotal = (ids) => ids.reduce((sum, sid) => {
    const svc = services.find((x) => Number(x.id) === Number(sid));
    return sum + Number(svc?.price || 0);
  }, 0);
  const openPayment = async (entry) => {
    const ids = getWalkInOrderedServiceIds(entry, services);
    setPaymentEntry(entry);
    setPaymentMethod('Cash');
    setPaymentDiscountId('');
    setPaymentError('');
    setPaymentOk(false);
    setPaymentServices(ids);
    setPaymentCustPackages([]);
    setPaymentCustPackageId('');
    if (entry.customer_id) {
      setLoadingPaymentPkgs(true);
      api.get(`/packages/customer/${entry.customer_id}/active`)
        .then((r) => setPaymentCustPackages(Array.isArray(r.data) ? r.data : []))
        .catch(() => {})
        .finally(() => setLoadingPaymentPkgs(false));
    }
    const bid = entry.branch_id || selectedBranch;
    if (bid) {
      try {
        const dr = await api.get('/discounts/payment', { params: { branchId: bid } });
        setPaymentDiscounts(Array.isArray(dr.data) ? dr.data : (dr.data?.data ?? []));
      } catch {
        setPaymentDiscounts([]);
      }
    } else {
      setPaymentDiscounts([]);
    }
  };
  const togglePaymentService = (id) => {
    const nid = Number(id);
    setPaymentServices((prev) => {
      const next = prev.includes(nid) ? prev.filter((x) => x !== nid) : [...prev, nid];
      return next;
    });
  };

  useEffect(() => {
    if (!paymentEntry) return;
    const gross = calcServiceTotal(paymentServices);
    const sel = paymentDiscountId
      ? paymentDiscounts.find((d) => String(d.id) === String(paymentDiscountId))
      : null;
    const promo = sel ? computePromoFromDiscount(sel, gross) : 0;
    const net = Math.max(0, gross - promo);
    setPaymentAmount(net > 0 ? String(net) : '');
  }, [paymentEntry, paymentServices, paymentDiscountId, paymentDiscounts, services]);
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
      const subtotal = calcServiceTotal(paymentServices);
      await api.post('/payments', {
        branch_id: paymentEntry.branch_id || selectedBranch,
        staff_id: paymentEntry.staff_id || paymentEntry.staff?.id || null,
        service_id: paymentServices[0] || paymentEntry.service_id || paymentEntry.service?.id || null,
        service_ids: paymentServices,
        customer_name: paymentEntry.customer_name || 'Walk-in',
        phone: paymentEntry.phone || '',
        subtotal,
        loyalty_discount: 0,
        ...(paymentDiscountId ? { discount_id: Number(paymentDiscountId) } : {}),
        splits: [{ method: paymentMethod, amount: Number(paymentAmount), ...(paymentMethod === 'Package' && paymentCustPackageId ? { customer_package_id: Number(paymentCustPackageId) } : {}) }],
      });
      if (paymentEntry.status !== 'completed') {
        await api.patch(`/walkin/${paymentEntry.id}/status`, { status: 'completed' });
      }
      setPaymentOk(true);
      toast('Payment collected successfully.', 'success');
      fetchData();
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
    const wiq = entry?.walkInServices;
    let primarySid = entry.service_id || entry.service?.id || '';
    let extraIds = [];
    if (Array.isArray(wiq) && wiq.length > 0) {
      const sorted = [...wiq].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      primarySid = sorted[0].service_id;
      extraIds = sorted.slice(1).map((r) => r.service_id).filter(Boolean);
    } else {
      extraIds = parseAdditionalServiceIds(entry.note);
    }
    setEditEntry(entry);
    setEditForm({
      customerName: entry.customer_name || '',
      phone: entry.phone || '',
      serviceId: primarySid,
      note: removeAdditionalServicesLine(entry.note || ''),
    });
    setEditExtraServiceIds(extraIds.map(Number));
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
  const getCheckinSelectedServiceIds = () => {
    const primary = Number(form.serviceId);
    if (!primary) return [];
    return [primary, ...checkinExtraServiceIds.filter((id) => Number(id) !== primary)];
  };
  const toggleCheckinService = (id) => {
    const nid = Number(id);
    const primary = Number(form.serviceId || 0);
    const selected = getCheckinSelectedServiceIds();
    const isSelected = selected.includes(nid);

    if (!isSelected) {
      if (!primary) {
        setForm((f) => ({ ...f, serviceId: nid }));
      } else {
        setCheckinExtraServiceIds((prev) => prev.includes(nid) ? prev : [...prev, nid]);
      }
      return;
    }

    // Removing currently selected service
    if (primary === nid) {
      const remaining = selected.filter((x) => x !== nid);
      if (remaining.length === 0) {
        setForm((f) => ({ ...f, serviceId: '' }));
        setCheckinExtraServiceIds([]);
      } else {
        const [nextPrimary, ...rest] = remaining;
        setForm((f) => ({ ...f, serviceId: String(nextPrimary) }));
        setCheckinExtraServiceIds(rest);
      }
    } else {
      setCheckinExtraServiceIds((prev) => prev.filter((x) => Number(x) !== nid));
    }
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
      const primarySid = Number(editForm.serviceId);
      const editServiceIds = [primarySid, ...editExtraServiceIds.filter((x) => Number(x) !== primarySid)];
      await api.patch(`/walkin/${editEntry.id}`, {
        customerName: editForm.customerName.trim(),
        phone: editForm.phone || '',
        serviceId: primarySid,
        serviceIds: editServiceIds,
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
      const nameTrim = (form.customerName || '').trim();
      if (!nameTrim) {
        setFormError('Enter a customer name.');
        setSaving(false);
        return;
      }
      if (isAdmin && !(form.branchId || selectedBranch)) {
        setFormError('Select a branch.');
        setSaving(false);
        return;
      }
      const selectedServiceIds = getCheckinSelectedServiceIds();
      if (!selectedServiceIds.length) {
        setFormError('Select at least one service.');
        setSaving(false);
        return;
      }
      const baseNote = removeAdditionalServicesLine(form.note || '');
      const extraServiceNames = services
        .filter((s) => selectedServiceIds.slice(1).includes(Number(s.id)))
        .map((s) => s.name);
      const fullNote = [
        baseNote,
        extraServiceNames.length ? `${ADDITIONAL_SERVICES_PREFIX} ${extraServiceNames.join(', ')}` : '',
      ].filter(Boolean).join('\n');
      const res = await api.post('/walkin/checkin', {
        customerName: nameTrim,
        phone:        form.phone || getCustomerPhone(selectedCustomer) || undefined,
        branchId:     form.branchId   || selectedBranch,
        serviceId:    Number(selectedServiceIds[0]),
        serviceIds:   selectedServiceIds.map(Number),
        note:         fullNote        || undefined,
      });
      await fetchData();
      setShowCheckin(false);
      setForm({ ...EMPTY_FORM, branchId: selectedBranch });
      setCheckinExtraServiceIds([]);
      setSelectedCustomer(null);
      setCustSearch('');
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
        c.name?.toLowerCase().includes(q) || String(getCustomerPhone(c)).includes(q)
      )
    );
  }, [custSearch, custAll]);

  const selectCustomer = (c) => {
    setForm((f) => ({ ...f, customerName: c.name, phone: getCustomerPhone(c) }));
    setCustSearch(c.name);
    setSelectedCustomer(c);
    setShowCustDrop(false);
  };

  const closeCheckin = () => {
    setShowCheckin(false);
    setCheckinExtraServiceIds([]);
    setSelectedCustomer(null);
    setCustSearch('');
    setCustResults([]);
    setCustAll([]);
    setShowCustDrop(false);
  };

  useLayoutEffect(() => {
    if (!showCustDrop || !showCheckin || !custSearchRef.current) return;
    const update = () => {
      const rect = custSearchRef.current.getBoundingClientRect();
      setCustDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [showCustDrop, showCheckin, selectedCustomer, custSearch]);

  const custDropdown = (showCustDrop && showCheckin && !selectedCustomer) && createPortal(
    <>
      <div onClick={() => setShowCustDrop(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
      <div style={{
        position: 'fixed',
        top: custDropPos.top,
        left: custDropPos.left,
        width: custDropPos.width,
        zIndex: 9999,
        background: isDark ? '#1E293B' : '#fff',
        border: `1.5px solid ${isDark ? '#334155' : '#E4E7EC'}`,
        borderRadius: 10,
        boxShadow: isDark ? '0 8px 24px rgba(2,6,23,0.45)' : '0 8px 28px rgba(16,24,40,0.14)',
        maxHeight: 240,
        overflowY: 'auto',
      }}>
        {custLoading ? (
          [1, 2, 3].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: isDark ? '#334155' : '#F2F4F7' }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 12, borderRadius: 6, background: isDark ? '#334155' : '#F2F4F7', width: '60%', marginBottom: 5 }} />
                <div style={{ height: 10, borderRadius: 6, background: isDark ? '#334155' : '#F2F4F7', width: '40%' }} />
              </div>
            </div>
          ))
        ) : custResults.length === 0 ? (
          <div style={{ padding: '14px', fontSize: 13, color: C.muted, textAlign: 'center' }}>
            No customers found for &quot;<strong>{custSearch}</strong>&quot;
          </div>
        ) : (
          <>
            {custSearch.trim() && (
              <div style={{ padding: '6px 14px', fontSize: 11, color: C.muted, background: isDark ? '#0F172A' : '#F9FAFB', borderBottom: `1px solid ${isDark ? '#334155' : '#F2F4F7'}`, fontWeight: 600 }}>
                {custResults.length} result{custResults.length !== 1 ? 's' : ''} found
              </div>
            )}
            {custResults.slice(0, 50).map((c) => (
              <div
                key={c.id}
                onMouseDown={() => selectCustomer(c)}
                style={{
                  padding: '9px 14px', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: 10, borderBottom: `1px solid ${isDark ? '#334155' : '#F2F4F7'}`,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? '#172033' : '#F5F8FF'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: isDark ? 'rgba(37,99,235,0.2)' : '#EFF6FF',
                  color: '#2563EB', fontWeight: 700, fontSize: 13, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {c.name?.charAt(0)?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.title }}>{c.name}</div>
                  {getCustomerPhone(c) && <div style={{ fontSize: 11, color: C.muted }}>{getCustomerPhone(c)}</div>}
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
    </>,
    document.body,
  );

  /*  Check-in: wait + bill preview (all selected services)  */
  const checkinSelectedIds = getCheckinSelectedServiceIds();
  let checkinDurationSum = 0;
  let checkinTotalPreview = 0;
  for (const sid of checkinSelectedIds) {
    const svc = services.find((x) => Number(x.id) === Number(sid));
    if (svc) {
      checkinDurationSum += Number(svc.duration_minutes || 30);
      checkinTotalPreview += Number(svc.price || 0);
    }
  }
  const waitPreview = checkinSelectedIds.length ? stats.waiting * checkinDurationSum : null;

  /*  Page actions  */
  const pageActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: DARK, letterSpacing: 1 }}>
        {clock.toLocaleTimeString()}
      </span>
      <Button variant="ghost" size="sm" onClick={() => window.open(`/token-display?branchId=${selectedBranch}`, '_blank')}>
        Token Display
      </Button>
      <Button size="sm" onClick={() => { setFormError(''); setForm({ ...EMPTY_FORM, branchId: selectedBranch }); setCheckinExtraServiceIds([]); setSelectedCustomer(null); setCustSearch(''); setCustResults([]); setCustAll([]); setShowCustDrop(false); setShowCheckin(true); }}>
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
            const servicesLine = getWalkInServicesTitle(entry);
            const noteOnly = removeAdditionalServicesLine(entry.note || '');
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
                  {servicesLine && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#344054' }}>{servicesLine}</span>
                      {svc.duration_minutes && (
                        <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99, background: '#F1F5F9', color: MUTED, fontWeight: 600 }}>
                          {svc.duration_minutes} min
                        </span>
                      )}
                      {Number(entry.total_amount) > 0 && (
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#059669' }}>
                          Rs. {Number(entry.total_amount).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                  {noteOnly && (
                    <div style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic', marginTop: 3 }}>{noteOnly}</div>
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Badge variant={entry.status} dot>{STATUS_LABELS[entry.status] || entry.status}</Badge>
                    {entry.status === 'completed' && (
                      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, background: '#FEF2F2', color: '#DC2626', fontWeight: 800 }}>
                        Paid
                      </span>
                    )}
                  </div>
                  {entry.status === 'waiting' && entry.estimated_wait != null && (
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>~{entry.estimated_wait} min wait</div>
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
      <WalkInModal
        open={showCheckin}
        onClose={closeCheckin}
        title="New Walk-in Check-in"
        subtitle="Add a customer to the queue — select services and get a token."
        size="xl"
        dark={isDark}
        footer={(
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: C.muted }}>
              {checkinSelectedIds.length > 0 ? (
                <span style={{ fontWeight: 700, color: C.title }}>
                  {checkinSelectedIds.length} service{checkinSelectedIds.length !== 1 ? 's' : ''}
                  <span style={{ fontWeight: 800, color: '#059669', marginLeft: 8 }}>· Rs. {checkinTotalPreview.toLocaleString()}</span>
                  {waitPreview != null && (
                    <span style={{ fontWeight: 500, color: C.muted, marginLeft: 8 }}>· ~{waitPreview} min wait</span>
                  )}
                </span>
              ) : (
                <span>Select customer and at least one service</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <Button variant="secondary" onClick={closeCheckin}>Cancel</Button>
              <Button
                onClick={handleCheckin}
                loading={saving}
                disabled={
                  saving
                  || !(form.customerName || '').trim()
                  || !form.serviceId
                  || (isAdmin && !(form.branchId || selectedBranch))
                }
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <IconCheck /> Check In
              </Button>
            </div>
          </div>
        )}
      >
        {formError && (
          <div style={{
            background: isDark ? '#450a0a' : '#FEE2E2', color: isDark ? '#FCA5A5' : '#B91C1C',
            padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13,
            border: `1px solid ${isDark ? '#7f1d1d' : '#FECACA'}`, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {formError}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <WalkInSection title="Customer" desc="Search existing customer or enter walk-in name" dark={isDark}>
            <div ref={custSearchRef}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Label style={{ margin: 0 }}>Select Customer *</Label>
                {custLoading ? (
                  <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>Loading…</span>
                ) : custAll.length > 0 && (
                  <span style={{ fontSize: 11, color: C.muted }}>{custAll.length} loaded</span>
                )}
              </div>

              {selectedCustomer ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  background: isDark ? '#052e16' : '#ECFDF3',
                  border: `1px solid ${isDark ? '#166534' : '#86EFAC'}`,
                  borderRadius: 12, padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', background: '#16A34A', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, flexShrink: 0,
                    }}>
                      {selectedCustomer.name?.charAt(0)?.toUpperCase() || 'C'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? '#BBF7D0' : '#065F46' }}>{selectedCustomer.name}</div>
                      <div style={{ fontSize: 12, color: isDark ? '#86EFAC' : '#047857' }}>{getCustomerPhone(selectedCustomer) || 'No phone'}</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustSearch('');
                      setForm((f) => ({ ...f, customerName: '', phone: '' }));
                      setShowCustDrop(true);
                    }}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <Input
                  placeholder={custLoading ? 'Loading customers…' : 'Search by name or phone…'}
                  value={custSearch}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustSearch(v);
                    setSelectedCustomer(null);
                    setForm((f) => ({ ...f, customerName: v }));
                    setShowCustDrop(true);
                  }}
                  onFocus={() => setShowCustDrop(true)}
                  onBlur={() => setTimeout(() => setShowCustDrop(false), 200)}
                />
              )}
            </div>

            <div>
              <Label>Phone</Label>
              <Input placeholder="Optional" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>

            {isAdmin && (
              <div>
                <Label>Branch *</Label>
                <Select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                  <option value="">Select branch</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </div>
            )}

            <div>
              <Label>Notes</Label>
              <Textarea placeholder="Optional notes for this visit" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </WalkInSection>

          <WalkInSection title="Services" desc="Select one or more — first service is primary in queue" dark={isDark}>
            <div style={{
              border: `1px solid ${isDark ? '#334155' : '#DCE6F3'}`,
              borderRadius: 12, maxHeight: 280, overflowY: 'auto',
              background: isDark ? '#0F172A' : '#fff',
            }}>
              {services.filter((s) => s.is_active !== false).map((s, idx, arr) => {
                const active = getCheckinSelectedServiceIds().includes(Number(s.id));
                return (
                  <label key={s.id} style={{
                    display: 'grid', gridTemplateColumns: '24px 1fr auto auto', alignItems: 'center', gap: 10,
                    padding: '10px 12px',
                    borderBottom: idx !== arr.length - 1 ? `1px solid ${isDark ? '#334155' : '#EEF2F6'}` : 'none',
                    background: active ? (isDark ? 'rgba(37,99,235,0.15)' : '#F0F9FF') : 'transparent',
                    cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={active} onChange={() => toggleCheckinService(s.id)} style={{ width: 16, height: 16, accentColor: '#2563EB' }} />
                    <span style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: C.title }}>{s.name}</span>
                    <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{s.duration_minutes || 30} min</span>
                    <span style={{ fontSize: 14, color: '#059669', fontWeight: 800 }}>Rs.{Number(s.price || 0).toLocaleString()}</span>
                  </label>
                );
              })}
            </div>

            {checkinSelectedIds.length > 0 && (
              <div style={{
                background: isDark ? '#172033' : '#F8FAFC',
                border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Queue preview</span>
                  <span style={{ fontSize: 12, color: '#D97706', fontWeight: 700 }}>{stats.waiting} waiting ahead</span>
                </div>
                {waitPreview != null && (
                  <div style={{ fontSize: 13, color: '#15803D', fontWeight: 600 }}>
                    Estimated wait: ~{waitPreview} min
                    <span style={{ fontWeight: 500, color: C.muted, marginLeft: 6 }}>({checkinDurationSum} min per service)</span>
                  </div>
                )}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  paddingTop: 8, borderTop: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                }}>
                  <span style={{ fontSize: 13, color: C.muted }}>Estimated bill</span>
                  <span style={{ fontSize: 16, color: '#059669', fontWeight: 800 }}>Rs. {checkinTotalPreview.toLocaleString()}</span>
                </div>
              </div>
            )}
          </WalkInSection>
        </div>
      </WalkInModal>
      {custDropdown}

      {/*  TOKEN MODAL  */}
      {showToken && (
        <Modal open={!!showToken} onClose={() => setShowToken(null)} title="Queue Token" size="sm">
          <div id="walkin-print-root" style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 12, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
              HEXAONE · Walk-in Token
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
            {getWalkInServicesTitle(showToken) && (
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 2, maxWidth: 320, margin: '0 auto 2px', lineHeight: 1.4 }}>
                {getWalkInServicesTitle(showToken)}
              </div>
            )}
            {Number(showToken.total_amount) > 0 && (
              <div style={{ fontSize: 14, fontWeight: 800, color: '#059669', marginBottom: 4 }}>
                Rs. {Number(showToken.total_amount).toLocaleString()}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#94A3B8' }}>{fmtTime(showToken.check_in_time)}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
            <Button variant="secondary" onClick={() => setShowToken(null)}>Close</Button>
            <Button onClick={() => window.print()}>Print</Button>
          </div>
        </Modal>
      )}

      {/*  PAYMENT MODAL  */}
      <Modal open={!!paymentEntry} onClose={() => setPaymentEntry(null)} title="Collect Walk-in Payment" size="lg">
        {paymentEntry && (
          paymentOk ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#059669' }}>Payment Recorded!</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {paymentError && (
                <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#B91C1C', fontSize: 13 }}>
                  {paymentError}
                </div>
              )}
              <div style={{ background: '#F8FAFC', border: '1px solid #EEF2F6', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: '#172554', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>
                  {(paymentEntry.customer_name || 'W').trim().charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>{paymentEntry.customer_name || 'Walk-in'}</div>
                  <div style={{ marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: '#64748B', fontWeight: 600 }}>
                    {paymentEntry.phone && <span>📞 {paymentEntry.phone}</span>}
                    {(paymentEntry.staff?.name || paymentEntry.staff_id) && <span>✂ {paymentEntry.staff?.name || 'Staff'}</span>}
                  </div>
                </div>
              </div>
              <div>
                <div style={{ border: '1px solid #E5EAF0', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                  {services.filter((s) => paymentServices.includes(Number(s.id))).map((s, idx, arr) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: idx !== arr.length - 1 ? '1px solid #EEF2F6' : 'none' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>{s.duration_minutes || 30} min</div>
                      <div style={{ fontSize: 16, color: '#059669', fontWeight: 800 }}>Rs. {Number(s.price || 0).toLocaleString()}</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderTop: '1px solid #EEF2F6' }}>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>Subtotal</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Rs. {calcServiceTotal(paymentServices).toLocaleString()}</span>
                  </div>
                  {(() => {
                    const g = calcServiceTotal(paymentServices);
                    const sd = paymentDiscountId ? paymentDiscounts.find((d) => String(d.id) === String(paymentDiscountId)) : null;
                    const pr = sd ? computePromoFromDiscount(sd, g) : 0;
                    return pr > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: '#FAF5FF', borderTop: '1px solid #E9D5FF' }}>
                        <span style={{ fontWeight: 600, color: '#6B21A8', fontSize: 13 }}>Promo</span>
                        <span style={{ fontWeight: 800, color: '#7C3AED', fontSize: 14 }}>− Rs. {pr.toLocaleString()}</span>
                      </div>
                    ) : null;
                  })()}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#ECFDF5', borderTop: '1px solid #BBF7D0' }}>
                    <span style={{ fontWeight: 700, color: '#065F46' }}>Collect</span>
                    <span style={{ fontSize: 28, fontWeight: 900, color: '#059669', lineHeight: 1 }}>Rs. {Number(paymentAmount || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              {paymentDiscounts.length > 0 && (
                <div>
                  <Label>Promo discount</Label>
                  <Select
                    value={paymentDiscountId || ''}
                    onChange={(e) => setPaymentDiscountId(e.target.value)}
                    style={{ width: '100%', marginTop: 4 }}
                  >
                    <option value="">None</option>
                    {paymentDiscounts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.discount_type === 'fixed' ? `Rs.${d.value}` : `${d.value}%`})
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <div>
                <Label>Payment Method</Label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {['Cash', 'Card', 'Online Transfer', 'LankaQR', ...(paymentEntry?.customer_id ? ['Package'] : [])].map((m) => {
                    const active = paymentMethod === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => { setPaymentMethod(m); if (m !== 'Package') setPaymentCustPackageId(''); }}
                        style={{
                          padding: '8px 18px',
                          borderRadius: 10,
                          border: `1.5px solid ${active ? '#10B981' : '#CBD5E1'}`,
                          background: active ? '#ECFDF5' : '#fff',
                          color: '#0F172A',
                          fontWeight: 700,
                          fontSize: 15,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
                {paymentMethod === 'Package' && (
                  <div style={{ marginTop: 8 }}>
                    {loadingPaymentPkgs ? (
                      <div style={{ fontSize: 12, color: '#94A3B8', padding: '4px 0' }}>Loading packages...</div>
                    ) : paymentCustPackages.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#92400E', background: '#FFFBEB', padding: '8px 12px', borderRadius: 8, border: '1px solid #FDE68A' }}>No active packages for this customer</div>
                    ) : (
                      <select value={paymentCustPackageId} onChange={e => setPaymentCustPackageId(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #D0D5DD', fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#0F172A', outline: 'none' }}>
                        <option value="">Select package...</option>
                        {paymentCustPackages.map(cp => (
                          <option key={cp.id} value={cp.id}>
                            {cp.package?.name || 'Package'} — {cp.sessions_remaining !== null ? `${cp.sessions_remaining} sessions left` : 'Unlimited'} (exp {new Date(cp.expiry_date).toLocaleDateString()})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                {paymentMethod === 'LankaQR' && paymentAmount && Number(paymentAmount) > 0 && (
                  <button
                    type="button"
                    onClick={() => setQrModal({ amount: paymentAmount, reference: `WI-${Date.now()}` })}
                    style={{ marginTop:10, width:'100%', padding:'10px 0', borderRadius:10, border:'none', background:'linear-gradient(135deg,#1e3a5f,#2563EB)', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 20h3"/></svg>
                    Generate LankaQR
                  </button>
                )}
              </div>
              <div>
                <div>
                  <Label>Paid (Rs.) *</Label>
                  <Input
                    type="number"
                    min="0"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div style={{ marginTop: 8 }}>
                  <Label>Select Services *</Label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    {services.filter((s) => s.is_active !== false).map((s) => {
                      const active = paymentServices.includes(Number(s.id));
                      return (
                        <button key={s.id} type="button" onClick={() => togglePaymentService(s.id)} style={{ padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${active ? '#2563EB' : '#E4E7EC'}`, background: active ? '#EFF6FF' : '#fff', color: active ? '#2563EB' : '#667085', fontWeight: active ? 700 : 500, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                  {paymentServices.length === 0 && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 6 }}>Select at least one service</div>}
                </div>
              </div>
            </div>
          )
        )}
        {!paymentOk && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setPaymentEntry(null)}>Cancel</Button>
            <Button onClick={handleCollectPayment} loading={paymentSaving} disabled={paymentSaving || !paymentAmount || Number(paymentAmount) <= 0 || !paymentServices.length}>
              {paymentSaving ? 'Collecting...' : `Collect Rs ${Number(paymentAmount || 0).toLocaleString()}`}
            </Button>
          </div>
        )}
      </Modal>

      {qrModal && createPortal(
        <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)' }}>
          <WalkInQRPanel amount={qrModal.amount} reference={qrModal.reference} onClose={() => setQrModal(null)} onSuccess={() => { setQrModal(null); handleCollectPayment(); }} />
        </div>,
        document.body
      )}

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
