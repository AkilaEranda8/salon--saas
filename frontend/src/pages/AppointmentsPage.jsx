import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup, Textarea } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import { computePromoFromDiscount } from '../utils/promoDiscount';
import {
  DataTable, ActionBtn, StaffAvatar, PagBtn,
  IconEye, IconEdit, IconTrash, IconClose, IconPlus, IconCalendar,
  StatCard,
} from '../components/ui/PageKit';
import usePageTheme from '../hooks/usePageTheme';
import { useNavigate } from 'react-router-dom';

const IconMoney    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;

const APPT_STATUSES = ['pending','confirmed','in_service','completed','cancelled','no_show'];
const APPT_EXTRA_SERVICES_PREFIX = 'Additional services:';
const APPT_PACKAGE_PREFIX = 'Package:';
const stripAdditionalServicesLine = (notes = '') =>
  String(notes)
    .split('\n')
    .filter((line) => !/^\s*additional\s+services?\s*[:\-]?\s*/i.test(line))
    .join('\n')
    .trim();
const stripPackageLine = (notes = '') =>
  String(notes)
    .split('\n')
    .filter((line) => !/^\s*package\s*[:\-]?\s*/i.test(line))
    .join('\n')
    .trim();
const parsePackageSelection = (notes = '') => {
  const line = String(notes).split('\n').find((l) => /^\s*package\s*[:\-]?\s*/i.test(l));
  if (!line) return { id: null, label: '' };
  const match = line.match(/#(\d+)/);
  return { id: match ? Number(match[1]) : null, label: line.replace(/^\s*package\s*[:\-]?\s*/i, '').trim() };
};
const parseAdditionalServiceNames = (notes = '') => {
  const line = String(notes).split('\n').find((line) => /^\s*additional\s+services?\s*[:\-]?\s*/i.test(line));
  if (!line) return [];
  const raw = line.replace(/^\s*additional\s+services?\s*[:\-]?\s*/i, '');
  return raw.split(',').map(s => s.trim()).filter(Boolean);
};
const normalizeServiceName = (name = '') =>
  String(name)
    .toLowerCase()
    .replace(/rs\.?\s*[\d,]+/gi, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const getAllServiceNamesForAppt = (row) => {
  const primary = row.service?.name || '';
  const extra = parseAdditionalServiceNames(row.notes || '');
  return Array.from(new Set([primary, ...extra].filter(Boolean)));
};
const inferExtraServiceIdsFromAmount = ({ primaryId, totalAmount, services }) => {
  const target = Number(totalAmount || 0);
  if (!target || target <= 0) return [];
  const primaryPrice = Number(services.find((s) => Number(s.id) === Number(primaryId))?.price || 0);
  const remaining = target - primaryPrice;
  if (remaining <= 0) return [];

  const candidates = services
    .filter((s) => Number(s.id) !== Number(primaryId) && Number(s.price || 0) > 0)
    .map((s) => ({ id: Number(s.id), price: Number(s.price || 0) }));

  // Exact 1-service match
  const single = candidates.find((c) => c.price === remaining);
  if (single) return [single.id];

  // Exact 2-service match fallback
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      if ((candidates[i].price + candidates[j].price) === remaining) {
        return [candidates[i].id, candidates[j].id];
      }
    }
  }
  return [];
};
const getInitialPaymentServiceIds = (row, services) => {
  const svcId = Number(row?.service_id || row?.service?.id || 0);
  if (Array.isArray(row?.service_ids) && row.service_ids.length) {
    const fromApi = Array.from(new Set(
      row.service_ids
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ));
    const mergedFromApi = Array.from(new Set([...(svcId ? [svcId] : []), ...fromApi]));
    const inferred = inferExtraServiceIdsFromAmount({
      primaryId: svcId,
      totalAmount: row?.amount,
      services,
    });
    return Array.from(new Set([...mergedFromApi, ...inferred]));
  }
  const extraNames = parseAdditionalServiceNames(row?.notes || '');
  const byExactName = extraNames
    .map((name) => services.find((s) => String(s.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase())?.id)
    .filter(Boolean)
    .map(Number)
    .filter((id) => id !== svcId);
  const fallbackExtraIds = byExactName.length
    ? []
    : inferExtraServiceIdsFromAmount({ primaryId: svcId, totalAmount: row?.amount, services });
  return Array.from(new Set([...(svcId ? [svcId] : []), ...byExactName, ...fallbackExtraIds]));
};
const STATUS_META = {
  pending:   { color:'#D97706', bg:'#FFFBEB', label:'Pending'   },
  confirmed: { color:'#2563EB', bg:'#EFF6FF', label:'Confirmed' },
  in_service:{ color:'#1D4ED8', bg:'#DBEAFE', label:'In Service' },
  completed: { color:'#059669', bg:'#ECFDF5', label:'Completed' },
  cancelled: { color:'#DC2626', bg:'#FEF2F2', label:'Cancelled' },
  no_show:   { color:'#64748B', bg:'#F8FAFC', label:'No Show'   },
};
const EMPTY = {
  branch_id: '',
  customer_id: '',
  customer_name: '',
  phone: '',
  service_id: '',
  staff_id: '',
  date: '',
  time: '',
  amount: '',
  notes: '',
  status: 'pending',
  is_recurring: false,
  recurrence_frequency: 'weekly',
};
const LIMIT = 20;

function StatusBadge({ status, dark = false }) {
  const m = STATUS_META[status] ?? STATUS_META.pending;
  const bg = dark ? `${m.color}22` : m.bg;
  const border = dark ? `${m.color}40` : 'transparent';
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, fontSize:12, fontWeight:600, background:bg, color:m.color, whiteSpace:'nowrap', border: `1px solid ${border}` }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:m.color, flexShrink:0 }} />
      {m.label}
    </span>
  );
}

function FeaturedApptStat({ total, pending, inService, dark }) {
  return (
    <div style={{
      background: dark
        ? 'linear-gradient(135deg, #1e3a8a 0%, #312e81 100%)'
        : 'linear-gradient(135deg, #1D4ED8 0%, #4F46E5 100%)',
      borderRadius: 18, padding: '22px 24px', color: '#fff', position: 'relative', overflow: 'hidden',
      minWidth: 260, flex: '1.4 1 280px',
      boxShadow: dark ? '0 8px 24px rgba(30,58,138,0.45)' : '0 8px 24px rgba(37,99,235,0.28)',
    }}>
      <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.08)' }} />
      <div style={{ position:'relative', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, textTransform:'uppercase', letterSpacing:'0.08em' }}>All Appointments</div>
          <div style={{ fontSize: 36, fontWeight: 900, letterSpacing:'-1px', lineHeight:1.1, marginTop: 6 }}>{total}</div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8, display:'flex', gap: 12, flexWrap:'wrap' }}>
            <span>{pending} pending</span>
            <span>·</span>
            <span>{inService} in service</span>
          </div>
        </div>
        <div style={{ width: 48, height: 48, borderRadius: 14, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <IconCalendar />
        </div>
      </div>
    </div>
  );
}

function ApptTableShell({ title, subtitle, children, footer, action }) {
  const { C } = usePageTheme();
  const showHeader = !!(title || subtitle || action);
  return (
    <div style={{ background: C.cardBg, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: C.shadow }}>
      {showHeader && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap: 12, flexWrap:'wrap', padding:'16px 20px', borderBottom:`1px solid ${C.border}`, background: C.headerGrad }}>
          <div>
            {title && <div style={{ fontSize: 15, fontWeight: 700, color: C.title }}>{title}</div>}
            {subtitle && <div style={{ fontSize: 12, color: C.muted, marginTop: title ? 2 : 0 }}>{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
      {footer && (
        <div style={{ padding:'12px 20px', borderTop:`1px solid ${C.border}`, background: C.soft, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap: 8 }}>
          {footer}
        </div>
      )}
    </div>
  );
}

function ApptSection({ title, desc, children, dark = false }) {
  return (
    <div style={{
      border: `1px solid ${dark ? '#334155' : '#E4E7EC'}`,
      borderRadius: 14,
      overflow: 'hidden',
      background: dark ? '#0F172A' : '#fff',
    }}>
      <div style={{
        padding: '12px 16px',
        background: dark ? '#1E293B' : '#F8FAFC',
        borderBottom: `1px solid ${dark ? '#334155' : '#EEF2F7'}`,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: dark ? '#E2E8F0' : '#101828' }}>{title}</div>
        {desc && <div style={{ fontSize: 11, color: dark ? '#94A3B8' : '#64748B', marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  );
}

function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', dark = false }) {
  useEffect(() => { if (!open) return; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, [open]);
  if (!open) return null;
  const widths = { sm: 420, md: 560, lg: 720, xl: 860 };
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(16,24,40,0.5)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: widths[size] ?? 560,
        background: dark ? '#111827' : '#fff', borderRadius: 18, display: 'flex', flexDirection: 'column',
        boxShadow: dark ? '0 24px 64px rgba(2,6,23,0.55)' : '0 24px 64px rgba(16,24,40,0.2)',
        maxHeight: '92vh', animation: 'modal-pop 0.2s ease',
        border: dark ? '1px solid #334155' : '1px solid #E4E7EC',
      }}>
        <style>{'@keyframes modal-pop { from { opacity:0; transform:scale(0.97) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }'}</style>
        <div style={{
          padding: '18px 22px',
          background: dark
            ? 'linear-gradient(135deg,#1e3a8a 0%,#312e81 100%)'
            : 'linear-gradient(135deg,#EFF6FF 0%,#DBEAFE 50%,#EEF2FF 100%)',
          borderBottom: `1px solid ${dark ? '#334155' : '#BFDBFE'}`,
          borderRadius: '18px 18px 0 0',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0, gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: dark ? 'rgba(255,255,255,0.12)' : '#fff',
              border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #BFDBFE',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: dark ? '#93C5FD' : '#2563EB',
              boxShadow: dark ? 'none' : '0 2px 8px rgba(37,99,235,0.12)',
            }}>
              <IconCalendar />
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
    document.body
  );
}

function Drawer({ open, onClose, title, subtitle, children, footer, dark = false }) {
  useEffect(() => { if (!open) return; document.body.style.overflow='hidden'; return () => { document.body.style.overflow=''; }; }, [open]);
  if (!open) return null;
  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:900, display:'flex', justifyContent:'flex-end' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(16,24,40,0.45)', backdropFilter:'blur(3px)' }} />
      <div style={{ position:'relative', width:500, maxWidth:'95vw', background:dark?'#111827':'#fff', display:'flex', flexDirection:'column', boxShadow:dark?'-8px 0 40px rgba(2,6,23,0.55)':'-8px 0 40px rgba(16,24,40,0.15)', animation:'drawer-in 0.22s ease', borderLeft:dark?'1px solid #334155':'none' }}>
        <style>{'@keyframes drawer-in { from { transform:translateX(100%); } to { transform:translateX(0); } }'}</style>
        <div style={{
          padding:'18px 22px', flexShrink:0,
          background: dark ? 'linear-gradient(135deg,#1e3a8a 0%,#312e81 100%)' : 'linear-gradient(135deg,#EFF6FF 0%,#DBEAFE 50%,#EEF2FF 100%)',
          borderBottom: `1px solid ${dark ? '#334155' : '#BFDBFE'}`,
          display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin:0, fontSize:17, fontWeight:800, color:dark?'#F8FAFC':'#0F172A', fontFamily:"'Inter',sans-serif" }}>{title}</h3>
            {subtitle && <p style={{ margin:'4px 0 0', fontSize:12, color:dark?'#CBD5E1':'#475569' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ background:dark?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.85)', border:`1px solid ${dark?'rgba(255,255,255,0.15)':'#E4E7EC'}`, cursor:'pointer', color:dark?'#E2E8F0':'#64748B', display:'flex', alignItems:'center', borderRadius:10, padding:7, flexShrink:0 }}><IconClose /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', background: dark ? '#111827' : '#F8FAFC' }}>{children}</div>
        {footer && <div style={{ padding:'16px 24px', borderTop:`1px solid ${dark?'#334155':'#EAECF0'}`, display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0, background:dark?'#0F172A':'#fff' }}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export default function AppointmentsPage() {
  const { user }     = useAuth();
  const { isDark }   = useTheme();
  const { C }        = usePageTheme();
  const navigate     = useNavigate();
  const canEdit      = ['superadmin','admin','manager','staff'].includes(user?.role);
  const isSuperAdmin = user?.role === 'superadmin';
  const today        = new Date().toISOString().slice(0,10);

  const [appts, setAppts]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [branches, setBranches]   = useState([]);
  const [services, setServices]   = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filterBranch, setFilterBranch] = useState(isSuperAdmin ? '' : user?.branch_id||'');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate]     = useState('');
  const [page, setPage]           = useState(1);
  const [showForm, setShowForm]       = useState(false);
  const [showDetail, setShowDetail]   = useState(false);
  const [editItem, setEditItem]       = useState(null);
  const [detailItem, setDetailItem]   = useState(null);
  const [form, setForm]               = useState(EMPTY);
  const [saving, setSaving]           = useState(false);
  const [formErr, setFormErr]         = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [showPayment, setShowPayment]     = useState(false);
  const [paymentAppt, setPaymentAppt]     = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentAmt, setPaymentAmt]       = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentErr, setPaymentErr]       = useState('');
  const [paymentOk, setPaymentOk]         = useState(false);
  const [paymentServices, setPaymentServices] = useState([]);
  const [paymentDiscountId, setPaymentDiscountId] = useState('');
  const [paymentDiscounts, setPaymentDiscounts] = useState([]);
  const [apptServiceIds, setApptServiceIds] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const [customerPackages, setCustomerPackages] = useState([]);
  const [loadingCustomerPackages, setLoadingCustomerPackages] = useState(false);
  const [selectedCustomerPackageId, setSelectedCustomerPackageId] = useState('');
  const [paymentCustPackages, setPaymentCustPackages] = useState([]);
  const [paymentCustPackageId, setPaymentCustPackageId] = useState('');
  const [loadingPaymentPkgs, setLoadingPaymentPkgs] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [apR, brR, svR, stR, cuR] = await Promise.all([
        api.get('/appointments', { params:{ page, limit:LIMIT, ...(filterBranch?{branchId:filterBranch}:{}), ...(filterStatus?{status:filterStatus}:{}), ...(filterDate?{date:filterDate}:{}) } }),
        api.get('/branches',     { params:{ limit:100 } }),
        api.get('/services',     { params:{ limit:200 } }),
        api.get('/staff',        { params:{ limit:200, ...(filterBranch?{branchId:filterBranch}:{}) } }),
        api.get('/customers',    { params:{ limit:500, ...(filterBranch?{branchId:filterBranch}:{}) } }),
      ]);
      const d = apR.data?.data ?? apR.data ?? [];
      setAppts(Array.isArray(d) ? d : []);
      setTotal(apR.data?.total || 0);
      setBranches(Array.isArray(brR.data) ? brR.data : (brR.data?.data??[]));
      setServices(Array.isArray(svR.data) ? svR.data : (svR.data?.data??[]));
      setStaffList(Array.isArray(stR.data) ? stR.data : (stR.data?.data??[]));
      setCustomers(Array.isArray(cuR.data) ? cuR.data : (cuR.data?.data??[]));
    } catch {}
    setLoading(false);
  }, [filterBranch, filterStatus, filterDate, page]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showForm) return;
    setCustomerLoading(true);
    api.get('/customers', { params: { limit: 500, ...(form.branch_id ? { branchId: form.branch_id } : {}) } })
      .then((r) => setCustomers(Array.isArray(r.data) ? r.data : (r.data?.data ?? [])))
      .catch(() => setCustomers([]))
      .finally(() => setCustomerLoading(false));
  }, [showForm, form.branch_id]);

  const calcServiceTotal = (ids) => ids.reduce((sum, sid) => { const s = services.find(x => Number(x.id) === Number(sid)); return sum + Number(s?.price || 0); }, 0);
  const openPayment = async (row) => {
    setPaymentAppt(row);
    let sourceRow = row;
    try {
      // Use latest appointment data so payment modal always reflects saved services.
      const r = await api.get(`/appointments/${row.id}`);
      if (r?.data?.id) sourceRow = r.data;
    } catch { /* fallback to row data */ }
    const ids = getInitialPaymentServiceIds(sourceRow, services);
    setPaymentServices(ids);
    setPaymentMethod('Cash');
    setPaymentDiscountId('');
    setPaymentErr('');
    setPaymentOk(false);
    setPaymentCustPackages([]);
    setPaymentCustPackageId('');
    const custId = sourceRow.customer_id || sourceRow.customer?.id;
    if (custId) {
      setLoadingPaymentPkgs(true);
      const pkgSel = parsePackageSelection(sourceRow.notes || '');
      api.get(`/packages/customer/${custId}/active`)
        .then((r2) => {
          const pkgs = Array.isArray(r2.data) ? r2.data : [];
          setPaymentCustPackages(pkgs);
          if (pkgSel.id && pkgs.find((p) => String(p.id) === String(pkgSel.id))) {
            setPaymentCustPackageId(String(pkgSel.id));
            setPaymentMethod('Package');
          }
        })
        .catch(() => {})
        .finally(() => setLoadingPaymentPkgs(false));
    }
    const bid = sourceRow.branch_id || sourceRow.branch?.id || user?.branch_id;
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
    setShowPayment(true);
  };
  const togglePaymentService = (id) => {
    const nid = Number(id);
    setPaymentServices((prev) => {
      const next = prev.includes(nid) ? prev.filter((x) => x !== nid) : [...prev, nid];
      return next;
    });
  };

  useEffect(() => {
    if (!showPayment || !paymentAppt) return;
    const gross = calcServiceTotal(paymentServices);
    const sel = paymentDiscountId
      ? paymentDiscounts.find((d) => String(d.id) === String(paymentDiscountId))
      : null;
    const promo = sel ? computePromoFromDiscount(sel, gross) : 0;
    const net = Math.max(0, gross - promo);
    setPaymentAmt(net > 0 ? String(net) : '');
  }, [showPayment, paymentAppt, paymentServices, paymentDiscountId, paymentDiscounts, services]);
  const handlePayment = async () => {
    if (paymentAppt?.status !== 'in_service') {
      return setPaymentErr('Payment can be collected only when status is In Service.');
    }
    if (!paymentAmt || Number(paymentAmt) <= 0) return setPaymentErr('Amount is required');
    if (!paymentServices.length) return setPaymentErr('At least one service is required');
    setPaymentSaving(true);
    try {
      const subtotal = calcServiceTotal(paymentServices);
      await api.post('/payments', {
        branch_id: paymentAppt.branch_id || paymentAppt.branch?.id || user?.branch_id,
        staff_id: paymentAppt.staff_id || paymentAppt.staff?.id || null,
        customer_id: paymentAppt.customer_id || null,
        service_id: paymentServices[0] || null,
        service_ids: paymentServices,
        appointment_id: paymentAppt.id,
        customer_name: paymentAppt.customer_name,
        subtotal,
        loyalty_discount: 0,
        ...(paymentDiscountId ? { discount_id: Number(paymentDiscountId) } : {}),
        splits: [{ method: paymentMethod, amount: Number(paymentAmt), ...(paymentMethod === 'Package' && paymentCustPackageId ? { customer_package_id: Number(paymentCustPackageId) } : {}) }],
      });
      if (paymentAppt?.id) {
        const primaryId = Number(paymentServices[0] || 0);
        const extraNames = paymentServices
          .slice(1)
          .map((id) => services.find((s) => Number(s.id) === Number(id))?.name)
          .filter(Boolean);
        const updatedNotes = [
          stripAdditionalServicesLine(paymentAppt.notes || ''),
          extraNames.length ? `${APPT_EXTRA_SERVICES_PREFIX} ${extraNames.join(', ')}` : '',
        ].filter(Boolean).join('\n');
        // Persist service selection back to appointment so future collect/edit screens match.
        await api.put(`/appointments/${paymentAppt.id}`, {
          service_id: primaryId || paymentAppt.service_id,
          service_ids: paymentServices,
          amount: Number(paymentAmt),
          notes: updatedNotes,
        });
        await api.patch(`/appointments/${paymentAppt.id}/status`, { status: 'completed' });
      }
      setPaymentOk(true);
      load();
      setTimeout(() => { setShowPayment(false); setPaymentOk(false); }, 1200);
    } catch (e) { setPaymentErr(e.response?.data?.message || 'Payment failed'); }
    setPaymentSaving(false);
  };

  const openAdd    = () => { setEditItem(null); setForm({...EMPTY, branch_id:user?.branch_id||'', date:today}); setApptServiceIds([]); setCustomerSearch(''); setShowCustomerDrop(false); setFormErr(''); setCustomerPackages([]); setSelectedCustomerPackageId(''); setShowForm(true); };
  const openEdit   = row => {
    const sid = Number(row.service?.id || row.service_id || 0);
    const extraNames = parseAdditionalServiceNames(row.notes || '');
    const extraIds = extraNames
      .map(name => services.find(s => s.name === name)?.id)
      .filter(Boolean)
      .map(Number);
    const selectedIds = Array.from(new Set([...(sid ? [sid] : []), ...extraIds]));
    const totalAmount = selectedIds.reduce((sum, id) => {
      const s = services.find(x => Number(x.id) === Number(id));
      return sum + Number(s?.price || 0);
    }, 0);
    setEditItem(row);
    setForm({
      ...row,
      customer_id: row.customer?.id || row.customer_id || '',
      service_id: row.service?.id || row.service_id,
      staff_id: row.staff?.id || row.staff_id,
      date: row.date?.slice(0,10) || '',
      amount: totalAmount || row.amount || '',
      notes: stripAdditionalServicesLine(row.notes || ''),
      is_recurring: Boolean(row.is_recurring),
      recurrence_frequency: row.recurrence_frequency || 'weekly',
    });
    setApptServiceIds(selectedIds);
    setCustomerSearch(row.customer_name || '');
    const pkgSel = parsePackageSelection(row.notes || '');
    setSelectedCustomerPackageId(pkgSel.id ? String(pkgSel.id) : '');
    setCustomerPackages([]);
    if (row.customer?.id || row.customer_id) {
      setLoadingCustomerPackages(true);
      api.get(`/packages/customer/${row.customer?.id || row.customer_id}/active`)
        .then((r) => setCustomerPackages(Array.isArray(r.data) ? r.data : []))
        .catch(() => setCustomerPackages([]))
        .finally(() => setLoadingCustomerPackages(false));
    }
    setShowCustomerDrop(false);
    setFormErr('');
    setShowForm(true);
  };
  const openDetail = row => { setDetailItem(row); setShowDetail(true); };

  const handleSave = async () => {
    if (!form.customer_name||!apptServiceIds.length||!form.date||!form.time) return setFormErr('Customer, service, date and time are required');
    setSaving(true);
    try {
      const selectedSvcs = services.filter(s => apptServiceIds.includes(Number(s.id)));
      const [primary, ...extras] = selectedSvcs;
      const extraNote = extras.length ? `${APPT_EXTRA_SERVICES_PREFIX} ${extras.map(s => s.name).join(', ')}` : '';
      const payload = {
        ...form,
        service_id: primary?.id || form.service_id,
        service_ids: apptServiceIds,
        amount: (() => {
          if (selectedCustomerPackageId) {
            const cp = customerPackages.find((p) => String(p.id) === String(selectedCustomerPackageId));
            if (cp?.package?.package_price) return Number(cp.package.package_price);
          }
          return selectedSvcs.reduce((sum, s) => sum + Number(s.price || 0), 0) || form.amount;
        })(),
        notes: [
          stripPackageLine(stripAdditionalServicesLine(form.notes || '')),
          selectedCustomerPackageId
            ? `${APPT_PACKAGE_PREFIX} #${selectedCustomerPackageId} - ${customerPackages.find((cp) => String(cp.id) === String(selectedCustomerPackageId))?.package?.name || 'Selected Package'}`
            : '',
          extraNote,
        ].filter(Boolean).join('\n'),
      };
      if (!payload.is_recurring) payload.recurrence_frequency = null;
      editItem ? await api.put(`/appointments/${editItem.id}`, payload) : await api.post('/appointments', payload);
      setShowForm(false); load();
    } catch (e) { setFormErr(e.response?.data?.message||'Save failed'); }
    setSaving(false);
  };
  const handleStatusChange = async (id, status) => { await api.patch(`/appointments/${id}/status`, { status }); load(); };
  const confirmDelete = id => setDeleteId(id);
  const handleDelete = async () => {
    if (!deleteId) return;
    try { await api.delete(`/appointments/${deleteId}`); } catch {}
    setDeleteId(null); load();
  };

  const toggleApptService = (id) => {
    const nid = Number(id);
    setApptServiceIds(prev => {
      const next = prev.includes(nid) ? prev.filter(x => x !== nid) : [...prev, nid];
      const total = calcServiceTotal(next);
      setForm(f => ({
        ...f,
        service_id: next[0] || '',
        amount: total || '',
      }));
      return next;
    });
  };
  const filteredCustomers = customers.filter(c => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return true;
    return c.name?.toLowerCase().includes(q) || c.phone?.includes(q);
  });
  const selectCustomer = (c) => {
    setForm(f => ({ ...f, customer_id: c.id, customer_name: c.name || '', phone: c.phone || f.phone }));
    setCustomerSearch(c.name || '');
    setShowCustomerDrop(false);
    setSelectedCustomerPackageId('');
    setLoadingCustomerPackages(true);
    api.get(`/packages/customer/${c.id}/active`)
      .then((r) => setCustomerPackages(Array.isArray(r.data) ? r.data : []))
      .catch(() => setCustomerPackages([]))
      .finally(() => setLoadingCustomerPackages(false));
  };
  const applySelectedPackage = (customerPackageId) => {
    setSelectedCustomerPackageId(customerPackageId);
    const cp = customerPackages.find((p) => String(p.id) === String(customerPackageId));
    if (!cp) return;
    const pkgServiceIds = (cp.package?.services || []).map(Number).filter(Boolean);
    if (!pkgServiceIds.length) return;
    const availableSvcIds = services.filter((s) => s.is_active !== false).map((s) => Number(s.id));
    const nextIds = pkgServiceIds.filter((id) => availableSvcIds.includes(id));
    if (!nextIds.length) return;
    const pkgPrice = cp.package?.package_price ? Number(cp.package.package_price) : null;
    setApptServiceIds(nextIds);
    setForm((f) => ({ ...f, service_id: nextIds[0] || '', amount: pkgPrice ?? calcServiceTotal(nextIds) ?? f.amount }));
  };

  const filteredStaff = form.branch_id ? staffList.filter(s => s.branch_id==form.branch_id) : staffList;
  const counts = APPT_STATUSES.reduce((acc,s) => { acc[s]=appts.filter(a=>a.status===s).length; return acc; }, {});
  const totalPages = Math.ceil(total / LIMIT);

  const apptColumns = useMemo(() => [
    {
      id: 'customer_name',
      accessorFn: (r) => [r.customer_name, r.phone, getAllServiceNamesForAppt(r).join(' '), r.staff?.name].filter(Boolean).join(' '),
      header: 'Customer',
      meta: { width: '20%' },
      cell: ({ row }) => {
        const r = row.original;
        return (
          <>
            <div style={{ fontWeight: 600, color: C.title, fontSize: 14 }}>{r.customer_name}</div>
            {r.phone && <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{r.phone}</div>}
          </>
        );
      },
    },
    {
      id: 'services',
      accessorFn: (r) => getAllServiceNamesForAppt(r).join(', '),
      header: 'Service',
      meta: { width: '16%' },
      cell: ({ getValue }) => (
        <span style={{ background: isDark ? '#1E293B' : C.soft, padding: '3px 9px', borderRadius: 6, fontSize: 13, fontWeight: 500, color: C.label, display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {getValue()}
        </span>
      ),
    },
    {
      id: 'staff',
      accessorFn: (r) => r.staff?.name || '',
      header: 'Staff',
      meta: { width: '14%' },
      cell: ({ row }) => {
        const r = row.original;
        return r.staff?.name ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <StaffAvatar name={r.staff.name} size={32} />
            <span style={{ fontSize: 13, fontWeight: 500, color: C.label, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.staff.name}</span>
          </div>
        ) : <span style={{ fontSize: 13, color: C.muted }}>—</span>;
      },
    },
    {
      id: 'date',
      accessorFn: (r) => `${r.date || ''} ${r.time || ''}`,
      header: 'Date & Time',
      meta: { width: '14%' },
      cell: ({ row }) => {
        const r = row.original;
        return (
          <>
            <div style={{ fontWeight: 600, color: C.title, fontSize: 13 }}>
              {r.date ? new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
            </div>
            {r.time && <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{r.time}</div>}
          </>
        );
      },
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      meta: { width: '11%', align: 'right' },
      cell: ({ row }) => (
        <span style={{ fontWeight: 700, color: '#059669', fontSize: 14 }}>
          Rs. {Number(row.original.amount || row.original.service?.price || 0).toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      meta: { width: '13%' },
      cell: ({ row }) => {
        const r = row.original;
        const s = r.status;
        const meta = STATUS_META[s] ?? STATUS_META.pending;
        if (!canEdit || s === 'completed' || s === 'cancelled') return <StatusBadge status={s} dark={isDark} />;
        return (
          <select value={s} onChange={(e) => handleStatusChange(r.id, e.target.value)}
            style={{
              padding: '4px 10px', borderRadius: 20, maxWidth: '100%',
              border: `1.5px solid ${meta.color}40`,
              background: isDark ? `${meta.color}22` : meta.bg,
              color: meta.color, fontWeight: 700, fontSize: 12,
              fontFamily: "'Inter',sans-serif", outline: 'none', cursor: 'pointer',
            }}>
            {APPT_STATUSES.filter((st) => st !== 'completed').map((st) => <option key={st} value={st}>{STATUS_META[st].label}</option>)}
          </select>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      meta: { width: '10%', align: 'center' },
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const s = r.status;
        return (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            <ActionBtn onClick={() => openDetail(r)} title="View" color="#2563EB"><IconEye /></ActionBtn>
            {canEdit && s === 'in_service' && <ActionBtn onClick={() => openPayment(r)} title="Collect Payment" color="#059669"><IconMoney /></ActionBtn>}
            {canEdit && <ActionBtn onClick={() => openEdit(r)} title="Edit" color="#D97706"><IconEdit /></ActionBtn>}
            {canEdit && <ActionBtn onClick={() => confirmDelete(r.id)} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>}
          </div>
        );
      },
    },
  ], [canEdit, isDark, C]);

  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const activeFilterLabel = filterStatus
    ? STATUS_META[filterStatus]?.label
    : filterDate
      ? (filterDate === today ? 'Today' : filterDate === tomorrow ? 'Tomorrow' : filterDate)
      : 'All statuses';

  return (
    <PageWrapper
      title="Appointments"
      subtitle={`Manage bookings · ${total.toLocaleString()} total · ${activeFilterLabel}`}
      actions={canEdit && (
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <Button variant="secondary" onClick={() => navigate('/calendar')} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <IconCalendar /> Calendar
          </Button>
          <Button variant="primary" onClick={openAdd} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <IconPlus /> New Appointment
          </Button>
        </div>
      )}
    >

      {/* Stats */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        <FeaturedApptStat total={total} pending={counts.pending||0} inService={counts.in_service||0} dark={isDark} />
        <StatCard label="Pending" value={counts.pending||0} color="#D97706" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} />
        <StatCard label="Confirmed" value={counts.confirmed||0} color="#2563EB" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>} />
        <StatCard label="In Service" value={counts.in_service||0} color="#7C3AED" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>} />
        <StatCard label="Completed" value={counts.completed||0} color="#059669" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>} />
      </div>

      {/* Filters */}
      <div style={{ background: C.cardBg, borderRadius: 16, border: `1px solid ${C.border}`, padding: '14px 16px', boxShadow: C.shadow }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap: 12, alignItems:'center' }}>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', flex: 1 }}>
            {[{val:'',label:'All'},...APPT_STATUSES.map(s=>({val:s,label:STATUS_META[s].label}))].map(({val,label}) => {
              const active=filterStatus===val, meta=val?STATUS_META[val]:null, cnt=val?counts[val]:appts.length;
              return (
                <button key={val} onClick={()=>{setFilterStatus(val);setPage(1);}} style={{ padding:'6px 14px', borderRadius:20, border:'1.5px solid', borderColor:active?(meta?.color??'#2563EB'):(isDark?'#334155':C.border), background:active?(meta?.bg??'#EFF6FF'):(isDark?'#0F172A':C.cardBg), color:active?(meta?.color??'#2563EB'):C.muted, fontWeight:active?700:500, fontSize:12, cursor:'pointer', fontFamily:"'Inter',sans-serif", whiteSpace:'nowrap' }}>
                  {label}{cnt>0?<span style={{ marginLeft:5, opacity:0.7 }}>({cnt})</span>:''}
                </button>
              );
            })}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
            {[
              { label: 'Today', value: today },
              { label: 'Tomorrow', value: tomorrow },
              { label: 'All dates', value: '' },
            ].map(({ label, value }) => (
              <button
                key={label}
                onClick={() => { setFilterDate(value); setPage(1); }}
                style={{
                  padding:'6px 12px', borderRadius: 8, fontSize: 12, fontWeight: filterDate === value ? 700 : 500,
                  border: `1.5px solid ${filterDate === value ? '#2563EB' : (isDark ? '#334155' : C.border)}`,
                  background: filterDate === value ? (isDark ? 'rgba(37,99,235,0.2)' : '#EFF6FF') : (isDark ? '#0F172A' : C.soft),
                  color: filterDate === value ? '#2563EB' : C.muted, cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
            <input type="date" value={filterDate} onChange={e=>{setFilterDate(e.target.value);setPage(1);}} className="pk-filter-control" style={{ width: 145 }} />
            {isSuperAdmin && (
              <select value={filterBranch} onChange={e=>{setFilterBranch(e.target.value);setPage(1);}} className="pk-filter-control" style={{ minWidth: 140 }}>
                <option value="">All Branches</option>
                {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <ApptTableShell
        footer={(
          <>
            <span style={{ fontSize:12, color: C.muted }}>Showing {appts.length} of {total}</span>
            {totalPages > 1 && (
              <div style={{ display:'flex', gap:4 }}>
                <PagBtn onClick={() => setPage(1)} disabled={page === 1} label="«" />
                <PagBtn onClick={() => setPage((p) => p - 1)} disabled={page === 1} label="‹" />
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                  return <PagBtn key={p} onClick={() => setPage(p)} active={p === page} label={p} />;
                })}
                <PagBtn onClick={() => setPage((p) => p + 1)} disabled={page === totalPages} label="›" />
                <PagBtn onClick={() => setPage(totalPages)} disabled={page === totalPages} label="»" />
              </div>
            )}
          </>
        )}
      >
        <div style={{ padding: '0 4px 4px' }}>
          <DataTable
            noShell
            compact
            columns={apptColumns}
            data={appts}
            loading={loading}
            emptyMessage="No appointments found"
            emptySub="Try adjusting your filters or book a new appointment"
            pagination={false}
            showRowNumbers={false}
            enableColumnVisibility={false}
            searchableColumns={[{ id: 'customer_name', title: 'Appointments', placeholder: 'Search customer, service, staff…' }]}
          />
        </div>
      </ApptTableShell>

      {/* New / Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editItem ? 'Edit Appointment' : 'New Appointment'}
        subtitle={editItem ? 'Update booking details, services, and schedule.' : 'Book a customer — select services, staff, and time slot.'}
        size="xl"
        dark={isDark}
        footer={(
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B' }}>
              {apptServiceIds.length > 0 ? (
                <span style={{ fontWeight: 800, color: '#059669' }}>
                  Rs. {Number(form.amount || 0).toLocaleString()}
                  <span style={{ fontWeight: 500, color: isDark ? '#94A3B8' : '#64748B', marginLeft: 8 }}>
                    · {apptServiceIds.length} service{apptServiceIds.length !== 1 ? 's' : ''}
                    {form.date && form.time ? ` · ${form.date} ${form.time}` : ''}
                  </span>
                </span>
              ) : (
                <span>Select at least one service</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="primary" loading={saving} onClick={handleSave}>
                {editItem ? 'Save Changes' : 'Create Appointment'}
              </Button>
            </div>
          </div>
        )}
      >
        {formErr && (
          <div style={{
            background: '#FEF2F2', color: '#DC2626', padding: '10px 14px', borderRadius: 10,
            marginBottom: 16, fontSize: 13, border: '1px solid #FEE2E2', fontWeight: 500,
          }}>
            {formErr}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ApptSection title="Customer" desc="Search existing customer or enter walk-in details" dark={isDark}>
              {form.customer_id && form.customer_name ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  border: '1px solid #86EFAC', background: isDark ? '#052e16' : '#ECFDF3',
                  borderRadius: 12, padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', background: '#16A34A', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, flexShrink: 0,
                    }}>
                      {form.customer_name?.charAt(0)?.toUpperCase() || 'C'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: isDark ? '#BBF7D0' : '#065F46', lineHeight: 1.2 }}>{form.customer_name}</div>
                      {form.phone && <div style={{ fontSize: 12, color: isDark ? '#86EFAC' : '#047857', marginTop: 2 }}>{form.phone}</div>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setForm((f) => ({ ...f, customer_id: '', customer_name: '', phone: '' }));
                      setCustomerSearch('');
                      setShowCustomerDrop(true);
                      setCustomerPackages([]);
                      setSelectedCustomerPackageId('');
                    }}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <Input
                    value={customerSearch}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomerSearch(v);
                      setForm((f) => ({ ...f, customer_id: '', customer_name: v }));
                      setCustomerPackages([]);
                      setSelectedCustomerPackageId('');
                      setShowCustomerDrop(true);
                    }}
                    onFocus={() => setShowCustomerDrop(true)}
                    onBlur={() => setTimeout(() => setShowCustomerDrop(false), 200)}
                    placeholder={customerLoading ? 'Loading customers…' : 'Search by name or phone…'}
                  />
                  {showCustomerDrop && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30,
                      background: isDark ? '#1E293B' : '#fff',
                      border: `1.5px solid ${isDark ? '#475569' : '#E4E7EC'}`,
                      borderRadius: 12, boxShadow: '0 12px 32px rgba(16,24,40,0.14)',
                      maxHeight: 240, overflowY: 'auto',
                    }}>
                      {customerLoading ? (
                        <div style={{ padding: '12px 14px', fontSize: 12, color: '#98A2B3' }}>Loading…</div>
                      ) : filteredCustomers.length === 0 ? (
                        <div style={{ padding: '14px', fontSize: 12, color: '#98A2B3', textAlign: 'center' }}>
                          No customer found — name will be saved as walk-in
                        </div>
                      ) : (
                        filteredCustomers.slice(0, 80).map((c) => (
                          <div
                            key={c.id}
                            onMouseDown={() => selectCustomer(c)}
                            style={{
                              padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                              borderBottom: `1px solid ${isDark ? '#334155' : '#F2F4F7'}`,
                            }}
                          >
                            <div style={{
                              width: 34, height: 34, borderRadius: '50%', background: '#EFF6FF', color: '#2563EB',
                              fontWeight: 700, fontSize: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {c.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: isDark ? '#E2E8F0' : '#101828' }}>{c.name}</div>
                              <div style={{ fontSize: 11, color: '#98A2B3' }}>{c.phone || 'No phone'}</div>
                            </div>
                            {c.loyalty_points > 0 && (
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#FEF9C3', color: '#854D0E', fontWeight: 700 }}>
                                ★ {c.loyalty_points}
                              </span>
                            )}
                            <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700, flexShrink: 0 }}>Select →</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormGroup label="Phone">
                  <Input value={form.phone || ''} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="07X XXX XXXX" />
                </FormGroup>
                <FormGroup label="Package (optional)">
                  <Select value={selectedCustomerPackageId} onChange={(e) => applySelectedPackage(e.target.value)} disabled={!form.customer_id || loadingCustomerPackages}>
                    <option value="">{!form.customer_id ? 'Select customer first' : loadingCustomerPackages ? 'Loading…' : 'No package'}</option>
                    {customerPackages.map((cp) => (
                      <option key={cp.id} value={cp.id}>
                        {cp.package?.name || 'Package'} — {cp.sessions_remaining == null ? 'Unlimited' : `${cp.sessions_remaining} left`}
                      </option>
                    ))}
                  </Select>
                </FormGroup>
              </div>
            </ApptSection>

            <ApptSection title="Services" desc="Select one or more — first service is primary" dark={isDark}>
              <div style={{
                border: `1px solid ${isDark ? '#334155' : '#DCE6F3'}`,
                borderRadius: 12, overflow: 'hidden', maxHeight: 220, overflowY: 'auto',
                background: isDark ? '#0F172A' : '#fff',
              }}>
                {services.filter((s) => s.is_active !== false).map((s, idx, arr) => {
                  const active = apptServiceIds.includes(Number(s.id));
                  return (
                    <label
                      key={s.id}
                      style={{
                        display: 'grid', gridTemplateColumns: '24px 1fr auto auto', alignItems: 'center', gap: 10,
                        padding: '10px 14px',
                        borderBottom: idx !== arr.length - 1 ? `1px solid ${isDark ? '#334155' : '#EEF2F6'}` : 'none',
                        background: active ? (isDark ? '#1e3a5f' : '#F0F9FF') : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <input type="checkbox" checked={active} onChange={() => toggleApptService(s.id)} style={{ width: 16, height: 16, accentColor: '#2563EB' }} />
                      <span style={{ fontSize: 14, color: isDark ? '#E2E8F0' : '#0F172A', fontWeight: active ? 700 : 500 }}>{s.name}</span>
                      <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>{s.duration_minutes || 30} min</span>
                      <span style={{ fontSize: 14, color: '#059669', fontWeight: 800 }}>Rs.{Number(s.price || 0).toLocaleString()}</span>
                    </label>
                  );
                })}
              </div>
              {apptServiceIds.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {services.filter((s) => apptServiceIds.includes(Number(s.id))).map((s) => (
                    <span key={s.id} style={{ fontSize: 11, color: '#047857', background: '#D1FAE5', border: '1px solid #A7F3D0', padding: '3px 10px', borderRadius: 999, fontWeight: 700 }}>
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </ApptSection>

            <ApptSection title="Staff & Notes" dark={isDark}>
              <FormGroup label="Assign Staff">
                <Select value={form.staff_id || ''} onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))}>
                  <option value="">Any available staff</option>
                  {filteredStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Notes">
                <Textarea value={form.notes || ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Special requests, allergies, preferences…" rows={2} />
              </FormGroup>
            </ApptSection>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ApptSection title="Schedule" desc="Date, time, and booking status" dark={isDark}>
              {isSuperAdmin && (
                <FormGroup label="Branch">
                  <Select value={form.branch_id || ''} onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value, staff_id: '' }))}>
                    <option value="">Select branch</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </FormGroup>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormGroup label="Date" required>
                  <Input type="date" value={form.date || ''} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                </FormGroup>
                <FormGroup label="Time" required>
                  <Input type="time" value={form.time || ''} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
                </FormGroup>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormGroup label="Status">
                  <Select value={form.status || 'pending'} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                    {APPT_STATUSES.filter((s) => s !== 'completed').map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup label="Amount (Rs.)">
                  <Input type="number" value={form.amount || ''} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="Auto from services" />
                </FormGroup>
              </div>
            </ApptSection>

            <ApptSection title="Recurring" desc="Auto-book next visit when completed" dark={isDark}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!form.is_recurring}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    is_recurring: e.target.checked,
                    recurrence_frequency: e.target.checked ? (f.recurrence_frequency || 'weekly') : 'weekly',
                  }))}
                  style={{ width: 18, height: 18, accentColor: '#2563EB' }}
                />
                <span style={{ fontSize: 14, fontWeight: 600, color: isDark ? '#E2E8F0' : '#0F172A' }}>Repeat this appointment</span>
              </label>
              {form.is_recurring && (
                <Select
                  value={form.recurrence_frequency || 'weekly'}
                  onChange={(e) => setForm((f) => ({ ...f, recurrence_frequency: e.target.value }))}
                >
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                </Select>
              )}
            </ApptSection>

            {/* Summary card */}
            <div style={{
              borderRadius: 14, padding: '16px 18px',
              background: isDark ? 'linear-gradient(135deg,#064e3b,#065f46)' : 'linear-gradient(135deg,#ECFDF5,#D1FAE5)',
              border: `1px solid ${isDark ? '#047857' : '#A7F3D0'}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? '#86EFAC' : '#047857', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Booking Summary
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: isDark ? '#D1FAE5' : '#065F46' }}>
                  <span>Customer</span>
                  <span style={{ fontWeight: 700, textAlign: 'right', maxWidth: '55%' }}>{form.customer_name || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: isDark ? '#D1FAE5' : '#065F46' }}>
                  <span>Services</span>
                  <span style={{ fontWeight: 700 }}>{apptServiceIds.length || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: isDark ? '#D1FAE5' : '#065F46' }}>
                  <span>Date & Time</span>
                  <span style={{ fontWeight: 700 }}>{form.date && form.time ? `${form.date} · ${form.time}` : '—'}</span>
                </div>
                <div style={{ height: 1, background: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(5,150,105,0.2)', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: isDark ? '#BBF7D0' : '#064E3B' }}>Estimated Total</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: isDark ? '#fff' : '#047857', letterSpacing: '-0.02em' }}>
                    Rs. {Number(form.amount || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={!!deleteId} onClose={()=>setDeleteId(null)} title="Delete Appointment" size="sm" dark={isDark}
        footer={<>
          <Button variant="secondary" onClick={()=>setDeleteId(null)}>No</Button>
          <Button variant="danger" onClick={handleDelete} style={{ background:'#DC2626', color:'#fff' }}>Yes, Delete</Button>
        </>}>
        <div style={{ textAlign:'center', padding:'12px 0' }}>
          <div style={{ width:56, height:56, borderRadius:'50%', background:'#FEF2F2', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </div>
          <div style={{ fontSize:15, fontWeight:600, color:isDark?'#E2E8F0':'#101828', marginBottom:6 }}>Are you sure?</div>
          <div style={{ fontSize:13, color:isDark?'#94A3B8':'#667085' }}>This appointment will be permanently deleted.<br/>This action cannot be undone.</div>
        </div>
      </Modal>

      {/* Collect Payment Modal */}
      <Modal open={showPayment} onClose={()=>setShowPayment(false)} title="Collect Payment" size="md" dark={isDark}
        footer={!paymentOk&&<><Button variant="secondary" onClick={()=>setShowPayment(false)}>Cancel</Button><Button variant="primary" loading={paymentSaving} onClick={handlePayment}>Confirm Payment</Button></>}>
        {paymentAppt && (
          paymentOk ? (
            <div style={{ textAlign:'center', padding:'28px 0' }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'#ECFDF5', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <div style={{ fontSize:16, fontWeight:700, color:'#059669' }}>Payment Recorded!</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {paymentErr && <div style={{ background:'#FEF2F2', color:'#DC2626', padding:'9px 13px', borderRadius:9, fontSize:13, border:'1px solid #FEE2E2' }}>{paymentErr}</div>}
              <div style={{ background:isDark?'#1E293B':'#F9FAFB', borderRadius:12, padding:'14px 16px', border:isDark?'1px solid #334155':'none' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontSize:15, fontWeight:700, color:isDark?'#E2E8F0':'#101828' }}>{paymentAppt.customer_name}</div>
                    <div style={{ fontSize:13, color:isDark?'#94A3B8':'#667085', marginTop:2 }}>{paymentAppt.phone||''}</div>
                  </div>
                  {paymentAppt.staff?.name && <span style={{ background:isDark?'#334155':'#F3F4F6', color:isDark?'#CBD5E1':'#475467', padding:'4px 12px', borderRadius:8, fontSize:12, fontWeight:500 }}>{paymentAppt.staff.name}</span>}
                </div>
              </div>
              <FormGroup label="Services" required>
                <div style={{ border:`1px solid ${isDark?'#334155':'#DCE6F3'}`, borderRadius:12, overflow:'hidden', maxHeight:180, overflowY:'auto', background:isDark?'#0F172A':'#fff' }}>
                  {services.filter(s => s.is_active !== false).map((s, idx, arr) => {
                    const active = paymentServices.includes(Number(s.id));
                    return (
                      <label key={s.id} style={{ display:'grid', gridTemplateColumns:'24px 1fr auto', alignItems:'center', gap:10, padding:'9px 12px', borderBottom:idx!==arr.length-1?`1px solid ${isDark?'#334155':'#EEF2F6'}`:'none', background:active?'#F0F9FF':(isDark?'#0F172A':'#fff'), cursor:'pointer' }}>
                        <input type="checkbox" checked={active} onChange={() => togglePaymentService(s.id)} style={{ width:16, height:16, accentColor:'#2563EB' }} />
                        <span style={{ fontSize:14, color:isDark?'#E2E8F0':'#0F172A', fontWeight:active?700:500 }}>{s.name}</span>
                        <span style={{ fontSize:14, color:'#059669', fontWeight:800 }}>Rs.{Number(s.price||0).toLocaleString()}</span>
                      </label>
                    );
                  })}
                </div>
                {paymentServices.length===0 && <div style={{ fontSize:12, color:'#DC2626', marginTop:4 }}>Select at least one service</div>}
              </FormGroup>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, alignItems:'start' }}>
                <FormGroup label="Subtotal (Rs.)">
                  <div style={{ padding:'10px 12px', background:isDark?'#1E293B':'#F9FAFB', borderRadius:10, border:`1px solid ${isDark?'#334155':'#E5E7EB'}`, fontWeight:800, color:'#059669' }}>
                    Rs. {calcServiceTotal(paymentServices).toLocaleString()}
                  </div>
                </FormGroup>
                {paymentDiscounts.length > 0 && (
                  <FormGroup label="Promo discount">
                    <Select value={paymentDiscountId || ''} onChange={e => setPaymentDiscountId(e.target.value)}>
                      <option value="">None</option>
                      {paymentDiscounts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.discount_type === 'fixed' ? `Rs.${d.value}` : `${d.value}%`})
                        </option>
                      ))}
                    </Select>
                  </FormGroup>
                )}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <FormGroup label="Paid (Rs.)" required>
                  <Input type="number" value={paymentAmt} onChange={e=>setPaymentAmt(e.target.value)} placeholder="0" />
                </FormGroup>
                <FormGroup label="Payment Method" required>
                  <Select value={paymentMethod} onChange={e=>{ setPaymentMethod(e.target.value); if (e.target.value !== 'Package') setPaymentCustPackageId(''); }}>
                    {['Cash','Card','Bank Transfer','Online','Package'].map(m=><option key={m} value={m}>{m}</option>)}
                  </Select>
                </FormGroup>
              </div>
              {paymentMethod === 'Package' && (
                <FormGroup label="Customer Package">
                  {!paymentAppt.customer_id ? (
                    <div style={{ fontSize:12, color:'#92400E', background:'#FFFBEB', padding:'8px 12px', borderRadius:8, border:'1px solid #FDE68A' }}>No customer linked to this appointment</div>
                  ) : loadingPaymentPkgs ? (
                    <div style={{ fontSize:12, color:'#94A3B8', padding:'4px 0' }}>Loading packages...</div>
                  ) : paymentCustPackages.length === 0 ? (
                    <div style={{ fontSize:12, color:'#92400E', background:'#FFFBEB', padding:'8px 12px', borderRadius:8, border:'1px solid #FDE68A' }}>No active packages for this customer</div>
                  ) : (
                    <Select value={paymentCustPackageId} onChange={e => setPaymentCustPackageId(e.target.value)}>
                      <option value="">Select package...</option>
                      {paymentCustPackages.map(cp => (
                        <option key={cp.id} value={cp.id}>
                          {cp.package?.name || 'Package'} — {cp.sessions_remaining !== null ? `${cp.sessions_remaining} sessions left` : 'Unlimited'} (exp {new Date(cp.expiry_date).toLocaleDateString()})
                        </option>
                      ))}
                    </Select>
                  )}
                </FormGroup>
              )}
              <div style={{ background:'#F0FDF4', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #BBF7D0' }}>
                <span style={{ fontSize:13, fontWeight:600, color:'#166534' }}>Collected</span>
                <span style={{ fontSize:18, fontWeight:800, color:'#059669' }}>Rs. {Number(paymentAmt||0).toLocaleString()}</span>
              </div>
            </div>
          )
        )}
      </Modal>

      {/* Detail Drawer */}
      <Drawer open={showDetail} onClose={()=>setShowDetail(false)} title="Appointment Details" subtitle={detailItem ? `${detailItem.date || ''} ${detailItem.time || ''}`.trim() : ''} dark={isDark}
        footer={canEdit&&detailItem&&(
          <div style={{ display:'flex', gap:8 }}>
            {detailItem.status!=='completed'&&detailItem.status!=='cancelled'&&<Button variant="primary" onClick={()=>{setShowDetail(false);openEdit(detailItem);}} style={{ display:'flex', alignItems:'center', gap:6 }}><IconEdit /> Edit</Button>}
            {detailItem.status==='in_service'&&<Button variant="primary" onClick={()=>{setShowDetail(false);openPayment(detailItem);}} style={{ display:'flex', alignItems:'center', gap:6, background:'#059669' }}><IconMoney /> Collect Payment</Button>}
          </div>
        )}>
        {detailItem && (
          <div style={{ fontFamily:"'Inter',sans-serif" }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, padding:'16px', background:isDark?'#1E293B':'#fff', borderRadius:14, border:`1px solid ${isDark?'#334155':C.border}`, boxShadow: isDark ? 'none' : '0 2px 8px rgba(16,24,40,0.04)' }}>
              <div style={{ display:'flex', alignItems:'center', gap: 12, minWidth: 0 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#2563EB,#4F46E5)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
                  {detailItem.customer_name?.charAt(0)?.toUpperCase() || 'C'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize:17, fontWeight:700, color:isDark?'#E2E8F0':'#101828' }}>{detailItem.customer_name}</div>
                  <div style={{ fontSize:13, color:isDark?'#94A3B8':'#667085', marginTop:2 }}>{detailItem.phone || 'No phone'}</div>
                </div>
              </div>
              <StatusBadge status={detailItem.status} dark={isDark} />
            </div>
            {(() => {
              const extraServiceNames = parseAdditionalServiceNames(detailItem.notes || '');
              const allServiceNames = Array.from(new Set([detailItem.service?.name, ...extraServiceNames].filter(Boolean)));
              const rows = [
                { icon:'✂️', label:'Services', value: allServiceNames.join(', ') || '—' },
                { icon:'👤', label:'Staff', value: detailItem.staff?.name || '—' },
                { icon:'📅', label:'Date', value: detailItem.date ? new Date(detailItem.date).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) : '—' },
                { icon:'🕐', label:'Time', value: detailItem.time || '—' },
                { icon:'🏢', label:'Branch', value: detailItem.branch?.name || '—' },
                { icon:'💰', label:'Amount', value: `Rs. ${Number(detailItem.amount||detailItem.service?.price||0).toLocaleString()}`, highlight: true },
              ];
              return (
                <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
                  {rows.map(({ icon, label, value, highlight }) => (
                    <div key={label} style={{ display:'flex', alignItems:'center', gap: 12, padding:'12px 14px', background: isDark ? '#0F172A' : '#fff', borderRadius: 12, border:`1px solid ${isDark?'#334155':C.border}` }}>
                      <span style={{ fontSize: 18, width: 28, textAlign:'center', flexShrink: 0 }}>{icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</div>
                        <div style={{ fontSize: 14, color: highlight ? '#059669' : C.title, fontWeight: highlight ? 800 : 600, marginTop: 2 }}>{value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {detailItem.notes && (
              <div style={{ marginTop:20, padding:'14px 16px', background:isDark?'#422006':'#FFFBEB', borderRadius:10, border:`1px solid ${isDark?'#92400E':'#FDE68A'}` }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#D97706', textTransform:'uppercase', marginBottom:6 }}> Notes</div>
                <div style={{ fontSize:13, color:isDark?'#FDE68A':'#475467', lineHeight:1.6 }}>{detailItem.notes}</div>
              </div>
            )}
            <div style={{ marginTop:20, textAlign:'right' }}>
              <span style={{ fontSize:11, color:isDark?'#64748B':'#D0D5DD', fontFamily:'monospace' }}>ID #{detailItem.id}</span>
            </div>
          </div>
        )}
      </Drawer>
    </PageWrapper>
  );
}
