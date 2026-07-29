import React, { useEffect, useState, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import usePageTheme, { PAGE_STAT_COLORS as SC } from '../hooks/usePageTheme';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { Input, Label, Textarea, Select } from '../components/ui/FormElements';
import { computePromoFromDiscount } from '../utils/promoDiscount';
import {
  stripPackageLine,
  parsePackageSelection,
  buildPackageNoteLine,
  resolvePackageServiceIds,
  formatCustomerPackageLabel,
  packageCoversAllServices,
  resolveCustomerId,
  fetchActiveCustomerPackages,
  fetchDiscountedPackageTemplates,
  ensureCustomerPackageForTemplate,
  findCustomerPackageForTemplate,
  resolveTemplateServiceIds,
  applyPackageSelection,
  formatPackageTemplateLabel,
  calcServiceListTotal,
  getPackageBundlePrice,
  formatPackageAppliedMessage,
  formatPackageBillAmount,
  resolveWalkInAmountDisplay,
} from '../utils/packageHelpers';
import { getKcAccessToken } from '../utils/kcTokenStore';
import {
  PKModal as Modal, StatCard, StaffAvatar,
  IconUsers, IconCheck, IconClock, IconClose, IconPlus, IconDollar,
} from '../components/ui/PageKit';
import {
  ADDITIONAL_SERVICES_PREFIX,
  parseAdditionalServiceIdsFromNote,
  getWalkInOrderedServiceIds,
  getWalkInServicesTitle,
} from '../utils/walkInHelpers';
import { useFeatureGate } from '../hooks/useFeatureGate';
import RecurringDateCalendar, { defaultRecurringNextDate } from '../components/ui/RecurringDateCalendar';

/*  Constants  */
const STATUS_META = {
  waiting:   { color: SC.warning, bg: '#FFFBEB', label: 'Waiting',   border: '#F59E0B' },
  serving:   { color: SC.purple,  bg: '#F5F3FF', label: 'In Service', border: '#A78BFA' },
  completed: { color: SC.success, bg: '#ECFDF5', label: 'Completed', border: '#34D399' },
  cancelled: { color: SC.danger,  bg: '#FEF2F2', label: 'Cancelled', border: '#EF4444' },
};
const QUEUE_SECTION_ORDER = ['waiting', 'serving', 'completed', 'cancelled'];
const FILTER_PILLS  = ['all', 'waiting', 'serving', 'completed', 'cancelled'];
const EMPTY_FORM    = { customerName: '', phone: '', serviceId: '', branchId: '', note: '' };

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

function WalkInModal({ open, onClose, title, subtitle, children, footer, size = 'lg', dark = false, accent = 'amber' }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  if (!open) return null;
  const widths = { sm: 420, md: 560, lg: 720, xl: 900 };
  const accents = {
    amber: {
      headerLight: 'linear-gradient(135deg,#FFFBEB 0%,#FEF3C7 45%,#FFF7ED 100%)',
      headerDark: 'linear-gradient(135deg,#78350f 0%,#1e3a8a 100%)',
      borderLight: '#FDE68A', iconLight: '#D97706', iconBorderLight: '#FCD34D',
      iconDark: '#FCD34D',
    },
    emerald: {
      headerLight: 'linear-gradient(135deg,#ECFDF5 0%,#D1FAE5 45%,#EFF6FF 100%)',
      headerDark: 'linear-gradient(135deg,#064e3b 0%,#1e3a8a 100%)',
      borderLight: '#A7F3D0', iconLight: '#059669', iconBorderLight: '#6EE7B7',
      iconDark: '#6EE7B7',
    },
  };
  const ac = accents[accent] || accents.amber;
  const HeaderIcon = accent === 'emerald' ? IconDollar : IconClock;
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
          background: dark ? ac.headerDark : ac.headerLight,
          borderBottom: `1px solid ${dark ? '#334155' : ac.borderLight}`,
          borderRadius: '18px 18px 0 0',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0, gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: dark ? 'rgba(255,255,255,0.12)' : '#fff',
              border: dark ? '1px solid rgba(255,255,255,0.15)' : `1px solid ${ac.iconBorderLight}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: dark ? ac.iconDark : ac.iconLight,
              boxShadow: dark ? 'none' : `0 2px 8px ${ac.iconLight}26`,
            }}>
              <HeaderIcon />
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

function QueueShell({ title, subtitle, children, action }) {
  const { C } = usePageTheme();
  return (
    <div style={{ background: C.cardBg, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: C.shadow }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: C.headerGrad }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.title }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function QueueStatusBadge({ status, dark = false }) {
  const m = STATUS_META[status] || STATUS_META.waiting;
  const bg = dark ? `${m.color}22` : m.bg;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: bg, color: m.color, whiteSpace: 'nowrap', border: `1px solid ${dark ? `${m.color}40` : 'transparent'}` }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

function QueueEntryCard({
  entry, C, isDark, staffList, busyStaffIds, services, packageCache,
  onAssignStaff, onChangeStatus, onEdit, onPayment, onShowToken,
}) {
  const svc = entry.service || {};
  const stf = entry.staff;
  const servicesLine = getWalkInServicesTitle(entry);
  const noteOnly = removeAdditionalServicesLine(entry.note || '');
  const meta = STATUS_META[entry.status] || STATUS_META.waiting;
  const bill = resolveWalkInAmountDisplay(entry, {
    services,
    customerPackages: packageCache[entry.customer_id] || [],
  });

  return (
    <div style={{
      background: isDark ? '#0F172A' : '#fff',
      borderRadius: 14,
      border: `1px solid ${isDark ? '#334155' : '#EAECF0'}`,
      borderLeft: `4px solid ${meta.border}`,
      padding: '16px 18px',
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      boxShadow: isDark ? 'none' : '0 1px 4px rgba(16,24,40,0.04)',
      transition: 'box-shadow 0.15s ease',
    }}>
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: isDark ? 'linear-gradient(135deg,#1e293b,#334155)' : 'linear-gradient(135deg,#1e293b,#475569)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 900, fontFamily: 'monospace', letterSpacing: 1,
          boxShadow: '0 4px 12px rgba(15,23,42,0.25)',
        }}>
          {entry.token}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 5, fontWeight: 600 }}>{fmtTime(entry.check_in_time)}</div>
      </div>

      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.title }}>{entry.customer_name || 'Walk-in'}</div>
          <QueueStatusBadge status={entry.status} dark={isDark} />
        </div>
        {entry.phone && <div style={{ fontSize: 12, color: C.muted }}>{entry.phone}</div>}
        {servicesLine && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.label, background: isDark ? '#1E293B' : C.soft, padding: '3px 9px', borderRadius: 6 }}>{servicesLine}</span>
            {svc.duration_minutes && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: isDark ? '#172033' : '#F1F5F9', color: C.muted, fontWeight: 600 }}>
                {svc.duration_minutes} min
              </span>
            )}
            {bill.finalAmount > 0 && (
              <span style={{ fontSize: 12, fontWeight: 800, color: '#059669' }}>
                {bill.primary}
                {bill.isPackage && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#047857', marginLeft: 4 }}>Package</span>
                )}
              </span>
            )}
            {bill.listTotal != null && (
              <span style={{ fontSize: 11, color: C.muted, textDecoration: 'line-through', fontWeight: 600 }}>
                List Rs. {bill.listTotal.toLocaleString()}
              </span>
            )}
          </div>
        )}
        {noteOnly && <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', marginTop: 4 }}>{noteOnly}</div>}
        {entry.status === 'waiting' && entry.estimated_wait != null && (
          <div style={{ fontSize: 11, color: '#D97706', fontWeight: 600, marginTop: 6 }}>~{entry.estimated_wait} min estimated wait</div>
        )}
      </div>

      <div style={{ flex: '0 0 180px', minWidth: 140 }}>
        {stf ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: isDark ? '#172033' : C.soft, border: `1px solid ${isDark ? '#334155' : C.border}` }}>
            <StaffAvatar name={stf.name} size={34} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.title, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stf.name}</div>
              {stf.role_title && <div style={{ fontSize: 11, color: C.muted }}>{stf.role_title}</div>}
            </div>
          </div>
        ) : (
          <Select value="" onChange={(e) => e.target.value && onAssignStaff(entry.id, e.target.value)} style={{ width: '100%' }}>
            <option value="">Assign staff…</option>
            {staffList.filter((s) => s.is_active !== false).map((s) => (
              <option key={s.id} value={s.id} disabled={busyStaffIds.has(s.id)}>
                {s.name}{busyStaffIds.has(s.id) ? ' (Busy)' : ''}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap', marginLeft: 'auto' }}>
        {entry.status !== 'completed' && (
          <Button size="sm" variant="secondary" onClick={() => onEdit(entry)}>Edit</Button>
        )}
        {entry.status === 'waiting' && (
          <Button size="sm" onClick={() => onChangeStatus(entry.id, 'serving')}>Start</Button>
        )}
        {entry.status === 'serving' && (
          <Button size="sm" onClick={() => onPayment(entry)} style={{ background: 'linear-gradient(135deg,#059669,#10B981)' }}>
            Collect
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onShowToken(entry)}>Token</Button>
        {(entry.status === 'waiting' || entry.status === 'serving') && (
          <Button size="sm" variant="danger" onClick={() => onChangeStatus(entry.id, 'cancelled')}>Cancel</Button>
        )}
      </div>
    </div>
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
  const [walkInPackageCache, setWalkInPackageCache] = useState({});
  const [selectedBranch, setSelectedBranch] = useState(defaultBranch);
  const [filterStatus,   setFilterStatus]   = useState('all');
  const [queueSearch,    setQueueSearch]    = useState('');
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
  const [paymentCustomerId, setPaymentCustomerId] = useState(null);
  const [paymentRecurring, setPaymentRecurring] = useState(false);
  const [paymentRecurringDate, setPaymentRecurringDate] = useState(defaultRecurringNextDate());
  const [paymentRecurringTemplateId, setPaymentRecurringTemplateId] = useState('');
  const [recurringTemplates, setRecurringTemplates] = useState([]);
  const { allowed: recurringAllowed } = useFeatureGate('recurring');
  const CHANNEL_LABELS = { email: 'Email', whatsapp: 'WhatsApp', sms: 'SMS' };
  const [loadingPaymentPkgs, setLoadingPaymentPkgs] = useState(false);
  const [checkinCustPackages, setCheckinCustPackages] = useState([]);
  const [checkinCustPackageId, setCheckinCustPackageId] = useState('');
  const [checkinPackageTemplateId, setCheckinPackageTemplateId] = useState('');
  const [loadingCheckinPkgs, setLoadingCheckinPkgs] = useState(false);
  const [packageSelectSaving, setPackageSelectSaving] = useState(false);
  const [packageTemplates, setPackageTemplates] = useState([]);
  const [editEntry,      setEditEntry]      = useState(null);
  const [editForm,       setEditForm]       = useState({ customerName: '', phone: '', serviceId: '', note: '' });
  const [editExtraServiceIds, setEditExtraServiceIds] = useState([]);
  const [editCustPackages, setEditCustPackages] = useState([]);
  const [editCustPackageId, setEditCustPackageId] = useState('');
  const [editPackageTemplateId, setEditPackageTemplateId] = useState('');
  const [editPackageSelectSaving, setEditPackageSelectSaving] = useState(false);
  const [loadingEditPkgs, setLoadingEditPkgs] = useState(false);
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
    if (!recurringAllowed) return;
    api.get('/notifications/templates/options', { params: { event_type: 'recurring_reminder' } })
      .then(({ data }) => setRecurringTemplates(Array.isArray(data?.options) ? data.options : []))
      .catch(() => setRecurringTemplates([]));
  }, [recurringAllowed]);

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
      const rows = qRes.data || [];
      setQueue(rows);
      setStats(sRes.data || { waiting: 0, serving: 0, completed: 0, cancelled: 0, total: 0 });
      const pkgCustomerIds = [...new Set(
        rows
          .filter((r) => parsePackageSelection(r.note || '').id && r.customer_id)
          .map((r) => r.customer_id),
      )];
      if (pkgCustomerIds.length) {
        Promise.all(
          pkgCustomerIds.map(async (cid) => {
            const pkgs = await fetchActiveCustomerPackages(api, cid);
            return [cid, pkgs];
          }),
        )
          .then((entries) => setWalkInPackageCache(Object.fromEntries(entries)))
          .catch(() => setWalkInPackageCache({}));
      } else {
        setWalkInPackageCache({});
      }
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
    setPaymentCustomerId(null);
    setPaymentRecurring(false);
    setPaymentRecurringDate(defaultRecurringNextDate());
    setPaymentRecurringTemplateId('');

    const custId = await resolveCustomerId(api, {
      customerId: entry.customer_id || entry.customer?.id,
      phone: entry.phone,
      branchId: entry.branch_id || selectedBranch,
    });
    setPaymentCustomerId(custId);

    if (custId) {
      setLoadingPaymentPkgs(true);
      const pkgSel = parsePackageSelection(entry.note || entry.notes || '');
      fetchActiveCustomerPackages(api, custId)
        .then((pkgs) => {
          setPaymentCustPackages(pkgs);
          if (pkgSel.id && pkgs.find((p) => String(p.id) === String(pkgSel.id))) {
            applyPackageSelection({
              customerPackageId: String(pkgSel.id),
              customerPackages: pkgs,
              allServices: services,
              onServices: setPaymentServices,
              onPackageId: setPaymentCustPackageId,
              onMethod: setPaymentMethod,
              onAmount: setPaymentAmount,
            });
          }
        })
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
    if (paymentMethod === 'Package' && paymentCustPackageId) {
      const cp = paymentCustPackages.find((p) => String(p.id) === String(paymentCustPackageId));
      const bundle = getPackageBundlePrice(cp);
      setPaymentAmount(bundle > 0 ? String(bundle) : '0');
      return;
    }
    const gross = calcServiceTotal(paymentServices);
    const sel = paymentDiscountId
      ? paymentDiscounts.find((d) => String(d.id) === String(paymentDiscountId))
      : null;
    const promo = sel ? computePromoFromDiscount(sel, gross) : 0;
    const net = Math.max(0, gross - promo);
    setPaymentAmount(net > 0 ? String(net) : '');
  }, [paymentEntry, paymentServices, paymentDiscountId, paymentDiscounts, services, paymentMethod, paymentCustPackageId]);
  const applyPaymentPackage = (customerPackageId) => {
    if (!customerPackageId) {
      setPaymentCustPackageId('');
      setPaymentMethod('Cash');
      return;
    }
    applyPackageSelection({
      customerPackageId,
      customerPackages: paymentCustPackages,
      allServices: services,
      onServices: setPaymentServices,
      onPackageId: setPaymentCustPackageId,
      onMethod: setPaymentMethod,
      onAmount: setPaymentAmount,
    });
    setPaymentDiscountId('');
  };
  const applyCheckinPackageTemplate = async (templateId) => {
    setCheckinPackageTemplateId(templateId);
    if (!templateId) {
      setCheckinCustPackageId('');
      return;
    }
    const tpl = packageTemplates.find((p) => String(p.id) === String(templateId));
    if (!tpl) return;
    const nextIds = resolveTemplateServiceIds(tpl, services);
    if (nextIds.length) {
      setForm((f) => ({ ...f, serviceId: String(nextIds[0]) }));
      setCheckinExtraServiceIds(nextIds.slice(1));
    }
    if (!selectedCustomer?.id) return;
    const existing = findCustomerPackageForTemplate(checkinCustPackages, templateId);
    if (existing?.id) {
      setCheckinCustPackageId(String(existing.id));
      return;
    }
    setPackageSelectSaving(true);
    setFormError('');
    try {
      const cp = await ensureCustomerPackageForTemplate(api, {
        customerId: selectedCustomer.id,
        templateId,
        branchId: form.branchId || selectedBranch,
      });
      if (cp?.id) {
        setCheckinCustPackageId(String(cp.id));
        const pkgs = await fetchActiveCustomerPackages(api, selectedCustomer.id);
        setCheckinCustPackages(pkgs);
      }
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to link package to customer.');
      setCheckinPackageTemplateId('');
      setCheckinCustPackageId('');
    } finally {
      setPackageSelectSaving(false);
    }
  };
  const applyEditPackageTemplate = async (templateId) => {
    setEditPackageTemplateId(templateId);
    if (!templateId) {
      setEditCustPackageId('');
      return;
    }
    const tpl = packageTemplates.find((p) => String(p.id) === String(templateId));
    if (!tpl) return;
    const nextIds = resolveTemplateServiceIds(tpl, services);
    if (nextIds.length) {
      setEditForm((f) => ({ ...f, serviceId: String(nextIds[0]) }));
      setEditExtraServiceIds(nextIds.slice(1));
    }
    const customerId = editEntry?.customer_id || editEntry?.customer?.id;
    if (!customerId) return;
    const existing = findCustomerPackageForTemplate(editCustPackages, templateId);
    if (existing?.id) {
      setEditCustPackageId(String(existing.id));
      return;
    }
    setEditPackageSelectSaving(true);
    setEditError('');
    try {
      const cp = await ensureCustomerPackageForTemplate(api, {
        customerId,
        templateId,
        branchId: editEntry?.branch_id || selectedBranch,
      });
      if (cp?.id) {
        setEditCustPackageId(String(cp.id));
        const pkgs = await fetchActiveCustomerPackages(api, customerId);
        setEditCustPackages(pkgs);
      }
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to link package to customer.');
      setEditPackageTemplateId('');
      setEditCustPackageId('');
    } finally {
      setEditPackageSelectSaving(false);
    }
  };
  const handleCollectPayment = async () => {
    if (!paymentEntry) return;
    if (paymentMethod === 'Package') {
      if (!paymentCustPackageId) {
        setPaymentError('Select a customer package.');
        return;
      }
      const cp = paymentCustPackages.find((p) => String(p.id) === String(paymentCustPackageId));
      if (!cp) {
        setPaymentError('Selected package not found.');
        return;
      }
      const total = Number(cp.sessions_total || 0);
      const used = Number(cp.sessions_used || 0);
      const left = total > 0 ? Math.max(0, total - used) : null;
      if (left === 0) {
        setPaymentError('This package has no sessions remaining. Choose Cash/Card or assign a new package.');
        return;
      }
      if (!packageCoversAllServices(paymentServices, cp)) {
        setPaymentError('All selected services must be included in the package.');
        return;
      }
    } else if (!paymentAmount || Number(paymentAmount) <= 0) {
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
      const cp = paymentMethod === 'Package' && paymentCustPackageId
        ? paymentCustPackages.find((p) => String(p.id) === String(paymentCustPackageId))
        : null;
      const subtotal = cp ? getPackageBundlePrice(cp) : calcServiceTotal(paymentServices);
      const collectAmount = cp
        ? (subtotal > 0 ? subtotal : Number(paymentAmount) || 0)
        : Number(paymentAmount);
      await api.post('/payments', {
        branch_id: paymentEntry.branch_id || selectedBranch,
        staff_id: paymentEntry.staff_id || paymentEntry.staff?.id || null,
        customer_id: paymentCustomerId || paymentEntry.customer_id || paymentEntry.customer?.id || null,
        service_id: paymentServices[0] || paymentEntry.service_id || paymentEntry.service?.id || null,
        service_ids: paymentServices,
        customer_name: paymentEntry.customer_name || 'Walk-in',
        phone: paymentEntry.phone || '',
        walkin_token: paymentEntry.token || paymentEntry.queue_token || undefined,
        subtotal,
        loyalty_discount: 0,
        ...(paymentDiscountId ? { discount_id: Number(paymentDiscountId) } : {}),
        splits: [{
          method: paymentMethod,
          amount: collectAmount,
          ...(paymentMethod === 'Package' && paymentCustPackageId
            ? { customer_package_id: Number(paymentCustPackageId) }
            : {}),
        }],
        ...(recurringAllowed && paymentRecurring ? {
          is_recurring: true,
          recurring_next_date: paymentRecurringDate,
          appointment_time: paymentEntry.started_at || paymentEntry.check_in_time || undefined,
          ...(paymentRecurringTemplateId
            ? { recurring_message_template_id: paymentRecurringTemplateId }
            : {}),
        } : {}),
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
  const openEdit = async (entry) => {
    const wiq = entry?.queueServices || entry?.walkInServices;
    let primarySid = entry.service_id || entry.service?.id || '';
    let extraIds = [];
    if (Array.isArray(wiq) && wiq.length > 0) {
      const sorted = [...wiq].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      primarySid = sorted[0].service_id;
      extraIds = sorted.slice(1).map((r) => r.service_id).filter(Boolean);
    } else {
      extraIds = parseAdditionalServiceIds(entry.note);
    }
    const pkgSel = parsePackageSelection(entry.note || '');
    setEditEntry(entry);
    setEditForm({
      customerName: entry.customer_name || '',
      phone: entry.phone || entry.customer?.phone || '',
      serviceId: primarySid,
      note: stripPackageLine(removeAdditionalServicesLine(entry.note || '')),
    });
    setEditExtraServiceIds(extraIds.map(Number));
    setEditCustPackageId(pkgSel.id ? String(pkgSel.id) : '');
    setEditPackageTemplateId('');
    setEditCustPackages([]);
    setEditError('');

    const custId = await resolveCustomerId(api, {
      customerId: entry.customer_id || entry.customer?.id,
      phone: entry.phone,
      branchId: entry.branch_id || selectedBranch,
    });
    if (custId) {
      setLoadingEditPkgs(true);
      fetchActiveCustomerPackages(api, custId)
        .then((pkgs) => {
          setEditCustPackages(pkgs);
          if (pkgSel.id) {
            const cp = pkgs.find((p) => String(p.id) === String(pkgSel.id));
            if (cp) {
              setEditPackageTemplateId(String(cp.package_id || cp.package?.id || ''));
            }
          }
        })
        .catch(() => setEditCustPackages([]))
        .finally(() => setLoadingEditPkgs(false));
    }
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
      const baseNote = stripPackageLine(removeAdditionalServicesLine(editForm.note || ''));
      const extraServiceNames = services
        .filter((s) => editExtraServiceIds.includes(Number(s.id)))
        .map((s) => s.name);
      const pkgLine = editCustPackageId
        ? buildPackageNoteLine(
          editCustPackageId,
          editCustPackages.find((cp) => String(cp.id) === String(editCustPackageId))?.package?.name,
        )
        : '';
      const fullNote = [
        baseNote,
        pkgLine,
        extraServiceNames.length ? `${ADDITIONAL_SERVICES_PREFIX} ${extraServiceNames.join(', ')}` : '',
      ].filter(Boolean).join('\n');
      const primarySid = Number(editForm.serviceId);
      const editServiceIds = [primarySid, ...editExtraServiceIds.filter((x) => Number(x) !== primarySid)];
      const custId = await resolveCustomerId(api, {
        customerId: editEntry.customer_id || editEntry.customer?.id,
        phone: editForm.phone,
        branchId: editEntry.branch_id || selectedBranch,
      });
      await api.patch(`/walkin/${editEntry.id}`, {
        customerName: editForm.customerName.trim(),
        phone: editForm.phone || '',
        customerId: custId || undefined,
        serviceId: primarySid,
        serviceIds: editServiceIds,
        customerPackageId: editCustPackageId || undefined,
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
      const baseNote = stripPackageLine(removeAdditionalServicesLine(form.note || ''));
      const extraServiceNames = services
        .filter((s) => selectedServiceIds.slice(1).includes(Number(s.id)))
        .map((s) => s.name);
      const pkgLine = checkinCustPackageId
        ? buildPackageNoteLine(
          checkinCustPackageId,
          checkinCustPackages.find((cp) => String(cp.id) === String(checkinCustPackageId))?.package?.name,
        )
        : '';
      const fullNote = [
        baseNote,
        pkgLine,
        extraServiceNames.length ? `${ADDITIONAL_SERVICES_PREFIX} ${extraServiceNames.join(', ')}` : '',
      ].filter(Boolean).join('\n');
      const res = await api.post('/walkin/checkin', {
        customerName: nameTrim,
        phone:        form.phone || getCustomerPhone(selectedCustomer) || undefined,
        customerId:   selectedCustomer?.id || undefined,
        branchId:     form.branchId   || selectedBranch,
        serviceId:    Number(selectedServiceIds[0]),
        serviceIds:   selectedServiceIds.map(Number),
        customerPackageId: checkinCustPackageId || undefined,
        note:         fullNote        || undefined,
      });
      await fetchData();
      setShowCheckin(false);
      setForm({ ...EMPTY_FORM, branchId: selectedBranch });
      setCheckinExtraServiceIds([]);
      setCheckinCustPackages([]);
      setCheckinCustPackageId('');
      setCheckinPackageTemplateId('');
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

  useEffect(() => {
    if (!showCheckin && !editEntry) return;
    const branchId = form.branchId || editEntry?.branch_id || selectedBranch;
    fetchDiscountedPackageTemplates(api, branchId)
      .then(setPackageTemplates)
      .catch(() => setPackageTemplates([]));
  }, [showCheckin, editEntry, form.branchId, selectedBranch]);

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
    setCheckinCustPackageId('');
    setCheckinPackageTemplateId('');
    setCheckinCustPackages([]);
    if (c.id) {
      setLoadingCheckinPkgs(true);
      fetchActiveCustomerPackages(api, c.id)
        .then(setCheckinCustPackages)
        .catch(() => setCheckinCustPackages([]))
        .finally(() => setLoadingCheckinPkgs(false));
    }
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
  const checkinListTotal = calcServiceListTotal(checkinSelectedIds, services);
  for (const sid of checkinSelectedIds) {
    const svc = services.find((x) => Number(x.id) === Number(sid));
    if (svc) checkinDurationSum += Number(svc.duration_minutes || 30);
  }
  const checkinUsingPackage = !!(checkinPackageTemplateId || checkinCustPackageId);
  const checkinBundlePrice = checkinPackageTemplateId
    ? getPackageBundlePrice(packageTemplates.find((p) => String(p.id) === String(checkinPackageTemplateId)))
    : getPackageBundlePrice(checkinCustPackages.find((cp) => String(cp.id) === String(checkinCustPackageId)));
  const checkinFinalAmount = checkinUsingPackage ? checkinBundlePrice : checkinListTotal;
  const waitPreview = checkinSelectedIds.length ? stats.waiting * checkinDurationSum : null;

  const branchName = branches.find((b) => String(b.id) === String(selectedBranch))?.name || '';

  const paymentListTotal = calcServiceTotal(paymentServices);
  const paymentSelectedCp = paymentCustPackageId
    ? paymentCustPackages.find((p) => String(p.id) === String(paymentCustPackageId))
    : null;
  const paymentBundlePrice = getPackageBundlePrice(paymentSelectedCp);
  const paymentUsesPackage = paymentMethod === 'Package' && !!paymentCustPackageId;
  const paymentFinalAmount = paymentUsesPackage ? paymentBundlePrice : Number(paymentAmount || 0);

  const searchedQueue = useMemo(() => {
    const base = filterStatus === 'all' ? queue : queue.filter((e) => e.status === filterStatus);
    const q = queueSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter((e) =>
      (e.customer_name || '').toLowerCase().includes(q)
      || (e.phone || '').includes(q)
      || String(e.token || '').toLowerCase().includes(q)
      || getWalkInServicesTitle(e).toLowerCase().includes(q),
    );
  }, [queue, filterStatus, queueSearch]);

  const queueGroups = useMemo(() => {
    if (filterStatus !== 'all') return [{ status: filterStatus, items: searchedQueue }];
    return QUEUE_SECTION_ORDER
      .map((s) => ({ status: s, items: searchedQueue.filter((e) => e.status === s) }))
      .filter((g) => g.items.length > 0);
  }, [filterStatus, searchedQueue]);

  const openCheckin = () => {
    setFormError('');
    setForm({ ...EMPTY_FORM, branchId: selectedBranch });
    setCheckinExtraServiceIds([]);
    setCheckinCustPackages([]);
    setCheckinCustPackageId('');
    setCheckinPackageTemplateId('');
    setSelectedCustomer(null);
    setCustSearch('');
    setCustResults([]);
    setCustAll([]);
    setShowCustDrop(false);
    setShowCheckin(true);
  };

  const pageActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 12,
        background: isDark ? '#1E293B' : '#fff',
        border: `1px solid ${isDark ? '#334155' : '#E4E7EC'}`,
        fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: C.title, letterSpacing: 0.5,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 0 3px rgba(16,185,129,0.25)' }} />
        {clock.toLocaleTimeString()}
      </div>
      <Button variant="secondary" size="sm" onClick={() => window.open(`/token-display?branchId=${selectedBranch}`, '_blank')}>
        Token Display
      </Button>
      <Button variant="primary" onClick={openCheckin} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconPlus /> New Walk-in
      </Button>
    </div>
  );

  return (
    <PageWrapper
      title="Walk-In Queue"
      subtitle={`${stats.waiting} waiting · ${stats.serving} in service · ${stats.total} today${branchName ? ` · ${branchName}` : ''}`}
      actions={pageActions}
    >
      <style>{PRINT_CSS}</style>

      {!selectedBranch && isAdmin && (
        <div style={{
          background: isDark ? 'rgba(217,119,6,0.15)' : '#FEF3C7',
          border: `1px solid ${isDark ? 'rgba(251,191,36,0.3)' : '#FDE68A'}`,
          borderRadius: 12, padding: '14px 20px', color: isDark ? '#FCD34D' : '#92400E', fontSize: 14, fontWeight: 600,
        }}>
          Please select a branch to view the walk-in queue.
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Waiting" value={stats.waiting} color={SC.warning} icon={<IconClock />} />
        <StatCard label="In Service" value={stats.serving} color={SC.purple} icon={<IconUsers />} />
        <StatCard label="Completed" value={stats.completed} color={SC.success} icon={<IconCheck />} />
        <StatCard label="Total Today" value={stats.total} color={SC.primary} icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        } />
      </div>

      {/* Toolbar: branch + filters + search */}
      <div style={{ background: C.cardBg, borderRadius: 16, border: `1px solid ${C.border}`, padding: '14px 16px', boxShadow: C.shadow }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          {isAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>Branch</span>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="pk-filter-control"
                style={{ minWidth: 160 }}
              >
                <option value="">Select branch</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {FILTER_PILLS.map((f) => {
              const active = filterStatus === f;
              const meta = f !== 'all' ? STATUS_META[f] : null;
              const cnt = f === 'all' ? queue.length : (stats[f] ?? 0);
              return (
                <button
                  key={f}
                  onClick={() => setFilterStatus(f)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                    border: '1.5px solid',
                    borderColor: active ? (meta?.color ?? '#2563EB') : (isDark ? '#334155' : C.border),
                    background: active
                      ? (isDark
                        ? (meta ? `${meta.color}22` : 'rgba(37,99,235,0.2)')
                        : (meta?.bg ?? '#EFF6FF'))
                      : (isDark ? '#0F172A' : C.cardBg),
                    color: active ? (meta?.color ?? '#2563EB') : C.muted,
                    fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
                  }}
                >
                  {f === 'all' ? 'All' : STATUS_META[f]?.label || f}
                  {cnt > 0 && <span style={{ marginLeft: 5, opacity: 0.75 }}>({cnt})</span>}
                </button>
              );
            })}
          </div>
          <input
            type="search"
            className="pk-filter-control"
            placeholder="Search token, customer, service…"
            value={queueSearch}
            onChange={(e) => setQueueSearch(e.target.value)}
            style={{ width: 220, minWidth: 160 }}
          />
        </div>
      </div>

      {/* Staff availability */}
      {staffList.length > 0 && (
        <div style={{ background: C.cardBg, borderRadius: 14, border: `1px solid ${C.border}`, padding: '14px 18px', boxShadow: C.shadow }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.title, marginBottom: 10 }}>Staff Availability</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {staffList.filter((s) => s.is_active !== false).map((s) => {
              const busy = busyStaffIds.has(s.id);
              return (
                <div key={s.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '6px 14px 6px 6px', borderRadius: 999,
                  background: busy ? (isDark ? 'rgba(234,88,12,0.15)' : '#FFF7ED') : (isDark ? 'rgba(5,150,105,0.12)' : '#F0FDF4'),
                  border: `1.5px solid ${busy ? (isDark ? 'rgba(251,146,60,0.4)' : '#FED7AA') : (isDark ? 'rgba(52,211,153,0.35)' : '#BBF7D0')}`,
                }}>
                  <StaffAvatar name={s.name} size={28} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.title, lineHeight: 1.2 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: busy ? '#C2410C' : '#15803D', fontWeight: 600 }}>{busy ? 'Busy' : 'Available'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Queue list */}
      <QueueShell
        title="Live Queue"
        subtitle={loading ? 'Updating…' : `${searchedQueue.length} entr${searchedQueue.length !== 1 ? 'ies' : 'y'} shown`}
        action={!loading && (
          <Button variant="ghost" size="sm" onClick={fetchData}>↻ Refresh</Button>
        )}
      >
        <div style={{ padding: '12px 16px 16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: C.muted, fontSize: 14 }}>Loading queue…</div>
          ) : error ? (
            <div style={{ background: isDark ? '#450a0a' : '#FEE2E2', border: `1px solid ${isDark ? '#7f1d1d' : '#FECACA'}`, borderRadius: 10, padding: '12px 18px', color: isDark ? '#FCA5A5' : '#B91C1C', fontSize: 14 }}>{error}</div>
          ) : searchedQueue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🪑</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.title }}>Queue is empty</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>No walk-ins match your filters</div>
              <Button onClick={openCheckin} style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <IconPlus /> Check in first customer
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {queueGroups.map(({ status, items }) => (
                <div key={status}>
                  {filterStatus === 'all' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <QueueStatusBadge status={status} dark={isDark} />
                      <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{items.length} customer{items.length !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {items.map((entry) => (
                      <QueueEntryCard
                        key={entry.id}
                        entry={entry}
                        C={C}
                        isDark={isDark}
                        staffList={staffList}
                        busyStaffIds={busyStaffIds}
                        services={services}
                        packageCache={walkInPackageCache}
                        onAssignStaff={assignStaff}
                        onChangeStatus={changeStatus}
                        onEdit={openEdit}
                        onPayment={openPayment}
                        onShowToken={setShowToken}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </QueueShell>

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
                  <span style={{ fontWeight: 800, color: checkinUsingPackage ? '#047857' : '#059669', marginLeft: 8 }}>
                    · {checkinUsingPackage
                      ? (checkinBundlePrice > 0 ? `Bundle ${formatPackageBillAmount(checkinBundlePrice)}` : 'Package')
                      : `Rs. ${checkinFinalAmount.toLocaleString()}`}
                  </span>
                  {checkinUsingPackage && checkinListTotal > 0 && (
                    <span style={{ fontWeight: 500, color: C.muted, marginLeft: 8, textDecoration: 'line-through' }}>
                      List Rs. {checkinListTotal.toLocaleString()}
                    </span>
                  )}
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
                      setCheckinCustPackages([]);
                      setCheckinCustPackageId('');
                      setCheckinPackageTemplateId('');
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
              {!selectedCustomer && (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                  Select customer from list to use their package bundle
                </div>
              )}
            </div>

            <div>
              <Label>Phone</Label>
              <Input placeholder="Optional" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>

            {selectedCustomer && (
              <div>
                <Label>Package</Label>
                {(loadingCheckinPkgs || packageSelectSaving) && !packageTemplates.length ? (
                  <div style={{ fontSize: 12, color: C.muted, padding: '4px 0' }}>
                    {packageSelectSaving ? 'Linking package…' : 'Loading packages…'}
                  </div>
                ) : packageTemplates.length > 0 ? (
                  <Select
                    value={checkinPackageTemplateId}
                    onChange={(e) => applyCheckinPackageTemplate(e.target.value)}
                    disabled={packageSelectSaving}
                  >
                    <option value="">No package — pay normally</option>
                    {packageTemplates.map((p) => (
                      <option key={p.id} value={p.id}>{formatPackageTemplateLabel(p)}</option>
                    ))}
                  </Select>
                ) : (
                  <div style={{ fontSize: 12, color: C.muted, padding: '4px 0' }}>
                    No packages available — create a package with a bundle price first.
                  </div>
                )}
                {checkinPackageTemplateId && !packageSelectSaving && (
                  <div style={{ fontSize: 12, color: isDark ? '#6EE7B7' : '#047857', marginTop: 6, fontWeight: 600 }}>
                    {formatPackageAppliedMessage(checkinBundlePrice)}
                  </div>
                )}
              </div>
            )}

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
                  <span style={{ fontSize: 13, color: C.muted }}>
                    {checkinUsingPackage ? 'Bundle price' : 'Estimated bill'}
                  </span>
                  {checkinUsingPackage ? (
                    <div style={{ textAlign: 'right' }}>
                      {checkinListTotal > 0 && (
                        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textDecoration: 'line-through' }}>
                          List Rs. {checkinListTotal.toLocaleString()}
                        </div>
                      )}
                      <span style={{ fontSize: 16, color: '#047857', fontWeight: 800 }}>
                        {formatPackageBillAmount(checkinBundlePrice)}
                      </span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 16, color: '#059669', fontWeight: 800 }}>Rs. {checkinFinalAmount.toLocaleString()}</span>
                  )}
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
            <div style={{ fontSize: 16, fontWeight: 700, color: C.title, marginBottom: 4 }}>{showToken.customer_name}</div>
            {getWalkInServicesTitle(showToken) && (
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 2, maxWidth: 320, margin: '0 auto 2px', lineHeight: 1.4 }}>
                {getWalkInServicesTitle(showToken)}
              </div>
            )}
            {(() => {
              const tokenBill = resolveWalkInAmountDisplay(showToken, {
                services,
                customerPackages: walkInPackageCache[showToken.customer_id] || [],
              });
              if (!(tokenBill.finalAmount > 0)) return null;
              return (
                <div style={{ fontSize: 14, fontWeight: 800, color: '#059669', marginBottom: 4 }}>
                  {tokenBill.primary}
                  {tokenBill.isPackage && (
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#047857' }}>Package</span>
                  )}
                </div>
              );
            })()}
            <div style={{ fontSize: 12, color: '#94A3B8' }}>{fmtTime(showToken.check_in_time)}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
            <Button variant="secondary" onClick={() => setShowToken(null)}>Close</Button>
            <Button onClick={() => window.print()}>Print</Button>
          </div>
        </Modal>
      )}

      {/*  PAYMENT MODAL  */}
      <WalkInModal
        open={!!paymentEntry}
        onClose={() => setPaymentEntry(null)}
        title="Collect Walk-in Payment"
        subtitle={paymentEntry ? `${paymentEntry.customer_name || 'Walk-in'}${paymentEntry.phone ? ` · ${paymentEntry.phone}` : ''}` : ''}
        size="lg"
        dark={isDark}
        accent="emerald"
        footer={paymentEntry && !paymentOk ? (
          <>
            <Button variant="secondary" onClick={() => setPaymentEntry(null)}>Cancel</Button>
            <Button onClick={handleCollectPayment} loading={paymentSaving} disabled={
              paymentSaving
              || !paymentServices.length
              || (paymentMethod === 'Package' ? !paymentCustPackageId : (!paymentAmount || Number(paymentAmount) <= 0))
            }>
              {paymentSaving ? 'Collecting...' : paymentUsesPackage
                ? `Complete · ${formatPackageBillAmount(paymentBundlePrice)}`
                : `Collect Rs ${Number(paymentAmount || 0).toLocaleString()}`}
            </Button>
          </>
        ) : paymentEntry && paymentOk ? (
          <Button onClick={() => setPaymentEntry(null)}>Done</Button>
        ) : null}
      >
        {paymentEntry && (
          paymentOk ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: isDark ? '#064E3B' : '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#059669' }}>Payment Recorded!</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {paymentError && (
                <div style={{ background: isDark ? '#450A0A' : '#FEE2E2', border: `1px solid ${isDark ? '#7F1D1D' : '#FECACA'}`, borderRadius: 8, padding: '10px 14px', color: isDark ? '#FCA5A5' : '#B91C1C', fontSize: 13 }}>
                  {paymentError}
                </div>
              )}
              <div style={{ background: isDark ? '#1E293B' : '#F8FAFC', border: `1px solid ${isDark ? '#334155' : '#EEF2F6'}`, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: '#172554', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>
                  {(paymentEntry.customer_name || 'W').trim().charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.title, lineHeight: 1.2 }}>{paymentEntry.customer_name || 'Walk-in'}</div>
                  <div style={{ marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: C.muted, fontWeight: 600 }}>
                    {paymentEntry.phone && <span>📞 {paymentEntry.phone}</span>}
                    {(paymentEntry.staff?.name || paymentEntry.staff_id) && <span>✂ {paymentEntry.staff?.name || 'Staff'}</span>}
                  </div>
                </div>
              </div>
              {recurringAllowed && (
                <div style={{
                  border: `1px solid ${isDark ? '#334155' : '#E5EAF0'}`,
                  borderRadius: 12,
                  padding: 12,
                  background: isDark ? '#0F172A' : '#fff',
                }}>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={paymentRecurring}
                      onChange={(e) => setPaymentRecurring(e.target.checked)}
                      style={{ marginTop: 3, width: 16, height: 16, accentColor: '#2563EB' }}
                    />
                    <span>
                      <div style={{ fontWeight: 700, fontSize: 14, color: C.title }}>Recurring</div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                        Book next visit and send SMS on the selected day
                      </div>
                    </span>
                  </label>
                  {paymentRecurring && (
                    <>
                      <RecurringDateCalendar
                        value={paymentRecurringDate}
                        onChange={setPaymentRecurringDate}
                      />
                      <div style={{ marginTop: 10 }}>
                        <Label>Reminder message</Label>
                        <Select
                          value={paymentRecurringTemplateId}
                          onChange={(e) => setPaymentRecurringTemplateId(e.target.value)}
                          style={{ width: '100%', marginTop: 4 }}
                        >
                          <option value="">Use default recurring template</option>
                          {recurringTemplates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {CHANNEL_LABELS[t.channel] || t.channel} — {t.name}{t.is_default ? ' (default)' : ''}
                            </option>
                          ))}
                        </Select>
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                          {recurringTemplates.length
                            ? 'Sent on the visit day for this recurring booking.'
                            : 'No saved templates yet — add them in Notifications → Message Templates → Recurring Visit Reminder.'}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div>
                <div style={{ border: `1px solid ${isDark ? '#334155' : '#E5EAF0'}`, borderRadius: 12, overflow: 'hidden', background: isDark ? '#0F172A' : '#fff' }}>
                  {services.filter((s) => paymentServices.includes(Number(s.id))).map((s, idx, arr) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: idx !== arr.length - 1 ? `1px solid ${isDark ? '#334155' : '#EEF2F6'}` : 'none' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.title }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{s.duration_minutes || 30} min</div>
                      <div style={{ fontSize: 16, color: '#059669', fontWeight: 800 }}>Rs. {Number(s.price || 0).toLocaleString()}</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: isDark ? '#1E293B' : '#F8FAFC', borderTop: `1px solid ${isDark ? '#334155' : '#EEF2F6'}` }}>
                    <span style={{ fontWeight: 700, color: C.title }}>{paymentUsesPackage ? 'List value' : 'Subtotal'}</span>
                    <span style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: paymentUsesPackage ? C.muted : C.title,
                      textDecoration: paymentUsesPackage ? 'line-through' : 'none',
                    }}>
                      Rs. {paymentListTotal.toLocaleString()}
                    </span>
                  </div>
                  {paymentUsesPackage && paymentBundlePrice > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: isDark ? '#172554' : '#EFF6FF', borderTop: `1px solid ${isDark ? '#334155' : '#EEF2F6'}` }}>
                      <span style={{ fontWeight: 600, color: isDark ? '#93C5FD' : '#1D4ED8', fontSize: 13 }}>Bundle price (final)</span>
                      <span style={{ fontWeight: 800, color: isDark ? '#BFDBFE' : '#2563EB', fontSize: 14 }}>Rs. {paymentBundlePrice.toLocaleString()}</span>
                    </div>
                  )}
                  {!paymentUsesPackage && (() => {
                    const g = calcServiceTotal(paymentServices);
                    const sd = paymentDiscountId ? paymentDiscounts.find((d) => String(d.id) === String(paymentDiscountId)) : null;
                    const pr = sd ? computePromoFromDiscount(sd, g) : 0;
                    return pr > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: isDark ? '#3B0764' : '#FAF5FF', borderTop: `1px solid ${isDark ? '#6B21A8' : '#E9D5FF'}` }}>
                        <span style={{ fontWeight: 600, color: isDark ? '#E9D5FF' : '#6B21A8', fontSize: 13 }}>Promo</span>
                        <span style={{ fontWeight: 800, color: isDark ? '#C4B5FD' : '#7C3AED', fontSize: 14 }}>− Rs. {pr.toLocaleString()}</span>
                      </div>
                    ) : null;
                  })()}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: isDark ? '#064E3B' : '#ECFDF5', borderTop: `1px solid ${isDark ? '#065F46' : '#BBF7D0'}` }}>
                    <span style={{ fontWeight: 700, color: isDark ? '#A7F3D0' : '#065F46' }}>
                      {paymentUsesPackage ? 'Final amount (bundle)' : 'Collect'}
                    </span>
                    <span style={{ fontSize: 28, fontWeight: 900, color: '#059669', lineHeight: 1 }}>
                      {paymentUsesPackage
                        ? formatPackageBillAmount(paymentBundlePrice)
                        : `Rs. ${Number(paymentAmount || 0).toLocaleString()}`}
                    </span>
                  </div>
                </div>
              </div>
              {(paymentEntry?.customer_id || paymentCustomerId) && (
                <div>
                  <Label>Customer Package</Label>
                  {loadingPaymentPkgs ? (
                    <div style={{ fontSize: 12, color: C.muted, padding: '4px 0' }}>Loading packages…</div>
                  ) : paymentCustPackages.length > 0 ? (
                    <Select value={paymentCustPackageId} onChange={(e) => applyPaymentPackage(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                      <option value="">No package — pay normally</option>
                      {paymentCustPackages.map((cp) => (
                        <option key={cp.id} value={cp.id}>{formatCustomerPackageLabel(cp)}</option>
                      ))}
                    </Select>
                  ) : (
                    <div style={{ fontSize: 12, color: C.muted, padding: '4px 0' }}>
                      No package — use promo discount or select a package at check-in.
                    </div>
                  )}
                  {paymentUsesPackage && (
                    <div style={{ fontSize: 12, color: isDark ? '#6EE7B7' : '#047857', marginTop: 6, fontWeight: 600 }}>
                      {formatPackageAppliedMessage(paymentBundlePrice)}
                    </div>
                  )}
                  {paymentCustPackageId && paymentMethod !== 'Package' && (
                    <div style={{ fontSize: 12, color: isDark ? '#FCD34D' : '#B45309', marginTop: 6, fontWeight: 600 }}>
                      Package selected — switch payment method to Package to charge the bundle price (Rs. {paymentBundlePrice.toLocaleString()}).
                    </div>
                  )}
                </div>
              )}
              {paymentDiscounts.length > 0 && paymentMethod !== 'Package' && (
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
                  {['Cash', 'Card', 'Online Transfer', 'LankaQR', ...(paymentEntry?.customer_id || paymentEntry?.customer?.id || paymentCustomerId ? ['Package'] : [])].map((m) => {
                    const active = paymentMethod === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => { if (m === 'Package') { if (!paymentCustPackageId && paymentCustPackages[0]) applyPaymentPackage(String(paymentCustPackages[0].id)); else setPaymentMethod('Package'); } else { setPaymentMethod(m); setPaymentCustPackageId(''); } }}
                        style={{
                          padding: '8px 18px',
                          borderRadius: 10,
                          border: `1.5px solid ${active ? '#10B981' : (isDark ? '#475569' : '#CBD5E1')}`,
                          background: active ? (isDark ? '#064E3B' : '#ECFDF5') : (isDark ? '#1E293B' : '#fff'),
                          color: active ? (isDark ? '#A7F3D0' : '#065F46') : C.title,
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
                        <button key={s.id} type="button" onClick={() => togglePaymentService(s.id)} style={{
                          padding: '6px 10px', borderRadius: 8,
                          border: `1.5px solid ${active ? '#2563EB' : (isDark ? '#475569' : '#E4E7EC')}`,
                          background: active ? (isDark ? '#1E3A5F' : '#EFF6FF') : (isDark ? '#1E293B' : '#fff'),
                          color: active ? (isDark ? '#93C5FD' : '#2563EB') : C.muted,
                          fontWeight: active ? 700 : 500, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                        }}>
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
      </WalkInModal>

      {qrModal && createPortal(
        <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)' }}>
          <WalkInQRPanel amount={qrModal.amount} reference={qrModal.reference} onClose={() => setQrModal(null)} onSuccess={() => { setQrModal(null); handleCollectPayment(); }} />
        </div>,
        document.body
      )}

      {/*  EDIT MODAL  */}
      <WalkInModal
        open={!!editEntry}
        onClose={() => setEditEntry(null)}
        title="Edit Walk-in Entry"
        subtitle="Update customer details and services"
        size="sm"
        dark={isDark}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setEditEntry(null)}>Cancel</Button>
            <Button onClick={handleEditSave} loading={editSaving} disabled={editSaving || !editForm.customerName.trim() || !editForm.serviceId}>
              Save Changes
            </Button>
          </>
        )}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {editError && (
            <div style={{ background: isDark ? '#450A0A' : '#FEE2E2', border: `1px solid ${isDark ? '#7F1D1D' : '#FECACA'}`, borderRadius: 8, padding: '10px 14px', color: isDark ? '#FCA5A5' : '#B91C1C', fontSize: 13 }}>
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
          {(editEntry?.customer_id || editEntry?.customer?.id) && (
            <div>
              <Label>Package</Label>
              {(loadingEditPkgs || editPackageSelectSaving) && !packageTemplates.length ? (
                <div style={{ fontSize: 12, color: C.muted, padding: '4px 0' }}>
                  {editPackageSelectSaving ? 'Linking package…' : 'Loading packages…'}
                </div>
              ) : packageTemplates.length > 0 ? (
                <Select
                  value={editPackageTemplateId}
                  onChange={(e) => applyEditPackageTemplate(e.target.value)}
                  disabled={editPackageSelectSaving}
                >
                  <option value="">No package — pay normally</option>
                  {packageTemplates.map((p) => (
                    <option key={p.id} value={p.id}>{formatPackageTemplateLabel(p)}</option>
                  ))}
                </Select>
              ) : (
                <div style={{ fontSize: 12, color: C.muted, padding: '4px 0' }}>
                  No packages available — create a package with a bundle price first.
                </div>
              )}
            </div>
          )}
          <div>
            <Label>Service *</Label>
            <Select value={editForm.serviceId} onChange={(e) => setEditForm((f) => ({ ...f, serviceId: e.target.value }))}>
              <option value="">Select service</option>
              {services.filter((s) => s.is_active !== false).map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {s.duration_minutes} min</option>
              ))}
            </Select>
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
                      style={{
                        padding: '7px 12px', borderRadius: 10,
                        border: `1.5px solid ${active ? '#2563EB' : (isDark ? '#475569' : '#E4E7EC')}`,
                        background: active ? (isDark ? '#1E3A5F' : '#EFF6FF') : (isDark ? '#1E293B' : '#fff'),
                        color: active ? (isDark ? '#93C5FD' : '#2563EB') : C.muted,
                        fontWeight: active ? 700 : 500, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                      }}
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
      </WalkInModal>

    </PageWrapper>
  );
}
