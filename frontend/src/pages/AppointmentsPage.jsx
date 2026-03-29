import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import { computePromoFromDiscount } from '../utils/promoDiscount';

const IconEye      = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconEdit     = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IconTrash    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
const IconSearch   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IconClose    = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconCalendar = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IconPlus     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
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

function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, fontSize:12, fontWeight:600, background:m.bg, color:m.color, whiteSpace:'nowrap' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:m.color, flexShrink:0 }} />
      {m.label}
    </span>
  );
}

function StatCard({ label, value, color, icon }) {
  return (
    <div style={{ background:'#fff', borderRadius:14, padding:'16px 20px', border:'1px solid #EAECF0', flex:1, minWidth:130, display:'flex', alignItems:'center', gap:14, boxShadow:'0 1px 4px rgba(16,24,40,0.04)' }}>
      <div style={{ width:42, height:42, borderRadius:10, background:`${color}15`, display:'flex', alignItems:'center', justifyContent:'center', color, flexShrink:0 }}>{icon}</div>
      <div>
        <div style={{ fontSize:24, fontWeight:800, color:'#101828', lineHeight:1.1 }}>{value}</div>
        <div style={{ fontSize:12, color:'#98A2B3', marginTop:2, fontWeight:500 }}>{label}</div>
      </div>
    </div>
  );
}

function Modal({ open, onClose, title, children, footer, size='md' }) {
  useEffect(() => { if (!open) return; document.body.style.overflow='hidden'; return () => { document.body.style.overflow=''; }; }, [open]);
  if (!open) return null;
  const widths = { sm:420, md:560, lg:720 };
  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:900, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(16,24,40,0.45)', backdropFilter:'blur(2px)' }} />
      <div style={{ position:'relative', width:'100%', maxWidth:widths[size]??560, background:'#fff', borderRadius:16, display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(16,24,40,0.18)', maxHeight:'90vh', animation:'modal-pop 0.18s ease' }}>
        <style>{'@keyframes modal-pop { from { opacity:0; transform:scale(0.96) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }'}</style>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #EAECF0', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:'#101828', fontFamily:"'Inter',sans-serif" }}>{title}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#98A2B3', display:'flex', alignItems:'center', borderRadius:8, padding:4 }}><IconClose /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>{children}</div>
        {footer && <div style={{ padding:'16px 24px', borderTop:'1px solid #EAECF0', display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0 }}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

function Drawer({ open, onClose, title, children, footer }) {
  useEffect(() => { if (!open) return; document.body.style.overflow='hidden'; return () => { document.body.style.overflow=''; }; }, [open]);
  if (!open) return null;
  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:900, display:'flex', justifyContent:'flex-end' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(16,24,40,0.4)', backdropFilter:'blur(2px)' }} />
      <div style={{ position:'relative', width:480, maxWidth:'95vw', background:'#fff', display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(16,24,40,0.15)', animation:'drawer-in 0.22s ease' }}>
        <style>{'@keyframes drawer-in { from { transform:translateX(100%); } to { transform:translateX(0); } }'}</style>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #EAECF0', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:'#101828', fontFamily:"'Inter',sans-serif" }}>{title}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#98A2B3', display:'flex', alignItems:'center', borderRadius:8, padding:4 }}><IconClose /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>{children}</div>
        {footer && <div style={{ padding:'16px 24px', borderTop:'1px solid #EAECF0', display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0 }}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

const AVATAR_PALETTES = [
  { bg:'#EFF6FF', color:'#2563EB' },
  { bg:'#FDF4FF', color:'#9333EA' },
  { bg:'#FFF7ED', color:'#EA580C' },
  { bg:'#F0FDF4', color:'#16A34A' },
  { bg:'#FEF2F2', color:'#DC2626' },
  { bg:'#F0F9FF', color:'#0284C7' },
  { bg:'#FFFBEB', color:'#D97706' },
  { bg:'#F5F3FF', color:'#7C3AED' },
];
function StaffAvatar({ name, size = 32 }) {
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_PALETTES.length;
  const { bg, color } = AVATAR_PALETTES[idx];
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg, color,
      fontSize: size * 0.38, fontWeight: 700, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0, border: `2px solid ${color}25`,
      fontFamily: "'Inter',sans-serif", letterSpacing: '0.02em', userSelect: 'none',
    }}>
      {initials}
    </div>
  );
}

function ActionBtn({ onClick, title, color, children }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} title={title} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width:30, height:30, borderRadius:8, border:`1.5px solid ${color}30`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all 0.15s', background:hov?`${color}20`:`${color}10`, color:color, transform:hov?'scale(1.1)':'scale(1)' }}>
      {children}
    </button>
  );
}

function PagBtn({ onClick, disabled, active, label }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ minWidth:32, height:32, padding:'0 6px', border:active?'1.5px solid #2563EB':'1px solid #E4E7EC', borderRadius:8, background:active?'#EFF6FF':hov&&!disabled?'#F2F4F7':'#fff', color:active?'#2563EB':disabled?'#D0D5DD':'#344054', fontSize:13, fontWeight:active?700:400, fontFamily:"'Inter',sans-serif", cursor:disabled?'not-allowed':'pointer', transition:'all 0.1s' }}>
      {label}
    </button>
  );
}

function ApptRow({ row, idx, canEdit, onView, onEdit, onDelete, onStatusChange, onPayment }) {
  const [hovered, setHovered] = useState(false);
  const s = row.status;
  const meta = STATUS_META[s] ?? STATUS_META.pending;
  return (
    <tr onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background:hovered?'#FAFBFF':idx%2===0?'#fff':'#FAFAFA', transition:'background 0.1s', borderBottom:'1px solid #F2F4F7' }}>
      <td style={{ padding:'13px 16px' }}>
        <div style={{ fontWeight:600, color:'#101828', fontSize:14 }}>{row.customer_name}</div>
        {row.phone && <div style={{ fontSize:12, color:'#98A2B3', marginTop:1 }}>{row.phone}</div>}
      </td>
      <td style={{ padding:'13px 16px' }}>
        <span style={{ background:'#F2F4F7', padding:'3px 9px', borderRadius:6, fontSize:13, fontWeight:500, color:'#475467' }}>
          {getAllServiceNamesForAppt(row).join(', ')}
        </span>
      </td>
      <td style={{ padding:'13px 16px' }}>
        {row.staff?.name ? (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <StaffAvatar name={row.staff.name} size={32} />
            <span style={{ fontSize:13, fontWeight:500, color:'#344054' }}>{row.staff.name}</span>
          </div>
        ) : <span style={{ fontSize:13, color:'#D0D5DD' }}>—</span>}
      </td>
      <td style={{ padding:'13px 16px' }}>
        <div style={{ fontWeight:600, color:'#101828', fontSize:13 }}>{row.date ? new Date(row.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : ''}</div>
        {row.time && <div style={{ fontSize:12, color:'#98A2B3', marginTop:1 }}>{row.time}</div>}
      </td>
      <td style={{ padding:'13px 16px', textAlign:'right' }}>
        <span style={{ fontWeight:700, color:'#059669', fontSize:14 }}>Rs. {Number(row.amount||row.service?.price||0).toLocaleString()}</span>
      </td>
      <td style={{ padding:'13px 16px' }}>
        {!canEdit||s==='completed'||s==='cancelled' ? <StatusBadge status={s} /> : (
          <select value={s} onChange={e => onStatusChange(e.target.value)}
            style={{ padding:'4px 10px', borderRadius:20, border:`1.5px solid ${meta.color}40`, background:meta.bg, color:meta.color, fontWeight:700, fontSize:12, fontFamily:"'Inter',sans-serif", outline:'none', cursor:'pointer' }}>
            {APPT_STATUSES.filter(st => st !== 'completed').map(st => <option key={st} value={st}>{STATUS_META[st].label}</option>)}
          </select>
        )}
      </td>
      <td style={{ padding:'13px 16px', textAlign:'center' }}>
        <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
          <ActionBtn onClick={onView} title="View" color="#2563EB"><IconEye /></ActionBtn>
          {canEdit && s==='in_service' && <ActionBtn onClick={onPayment} title="Collect Payment" color="#059669"><IconMoney /></ActionBtn>}
          {canEdit && <ActionBtn onClick={onEdit} title="Edit" color="#D97706"><IconEdit /></ActionBtn>}
          {canEdit && <ActionBtn onClick={onDelete} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>}
        </div>
      </td>
    </tr>
  );
}

export default function AppointmentsPage() {
  const { user }     = useAuth();
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
  const [search, setSearch]       = useState('');
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
  const [sortKey, setSortKey]   = useState('date');
  const [sortDir, setSortDir]   = useState('desc');
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
        splits: [{ method: paymentMethod, amount: Number(paymentAmt) }],
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
        amount: selectedSvcs.reduce((sum, s) => sum + Number(s.price || 0), 0) || form.amount,
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
    const total = calcServiceTotal(nextIds);
    setApptServiceIds(nextIds);
    setForm((f) => ({ ...f, service_id: nextIds[0] || '', amount: total || f.amount }));
  };

  const filteredStaff = form.branch_id ? staffList.filter(s => s.branch_id==form.branch_id) : staffList;
  const counts = APPT_STATUSES.reduce((acc,s) => { acc[s]=appts.filter(a=>a.status===s).length; return acc; }, {});
  const totalPages = Math.ceil(total/LIMIT);

  const handleSort = key => { if (sortKey===key) setSortDir(d=>d==='asc'?'desc':'asc'); else { setSortKey(key); setSortDir('asc'); } };
  const SortIco = ({ col }) => sortKey!==col ? <span style={{ opacity:0.3, fontSize:10, marginLeft:4 }}></span> : <span style={{ fontSize:10, marginLeft:4, color:'#2563EB' }}>{sortDir==='asc'?'':''}</span>;
  const Th = ({ children, col, align='left', sx }) => (
    <th onClick={col?()=>handleSort(col):undefined} style={{ padding:'11px 16px', textAlign:align, fontSize:11, fontWeight:700, color:'#98A2B3', textTransform:'uppercase', letterSpacing:'0.05em', background:'#F9FAFB', borderBottom:'1px solid #EAECF0', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', cursor:col?'pointer':'default', userSelect:'none', ...sx }}>
      {children}{col&&<SortIco col={col} />}
    </th>
  );

  const displayed = appts
    .filter(a => { if (!search) return true; const q=search.toLowerCase(); return a.customer_name?.toLowerCase().includes(q)||a.phone?.toLowerCase().includes(q)||a.service?.name?.toLowerCase().includes(q)||a.staff?.name?.toLowerCase().includes(q); })
    .sort((a,b) => { let av=a[sortKey],bv=b[sortKey]; if(sortKey==='date'){av=`${a.date} ${a.time}`;bv=`${b.date} ${b.time}`;} if(sortKey==='amount'){av=Number(av);bv=Number(bv);} if(av<bv) return sortDir==='asc'?-1:1; if(av>bv) return sortDir==='asc'?1:-1; return 0; });

  return (
    <PageWrapper title="Appointments" subtitle={`${total} total appointments`}
      actions={canEdit && <Button variant="primary" onClick={openAdd} style={{ display:'flex', alignItems:'center', gap:6 }}><IconPlus /> New Appointment</Button>}>

      {/* Stat Cards */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        <StatCard label="Total"     value={total}                color="#2563EB" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>} />
        <StatCard label="Pending"   value={counts.pending||0}   color="#D97706" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} />
        <StatCard label="Confirmed" value={counts.confirmed||0} color="#2563EB" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>} />
        <StatCard label="Completed" value={counts.completed||0} color="#059669" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>} />
      </div>

      {/* Filter Bar */}
      <div style={{ background:'#fff', borderRadius:14, border:'1px solid #EAECF0', padding:'14px 16px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', boxShadow:'0 1px 4px rgba(16,24,40,0.04)' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#98A2B3', pointerEvents:'none', display:'flex' }}><IconSearch /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search appointments..."
            style={{ width:'100%', padding:'8px 12px 8px 34px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', boxSizing:'border-box', color:'#101828', background:'#FAFAFA' }}
            onFocus={e=>e.target.style.borderColor='#2563EB'} onBlur={e=>e.target.style.borderColor='#E4E7EC'} />
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {[{val:'',label:'All'},...APPT_STATUSES.map(s=>({val:s,label:STATUS_META[s].label}))].map(({val,label}) => {
            const active=filterStatus===val, meta=val?STATUS_META[val]:null, cnt=val?counts[val]:appts.length;
            return (
              <button key={val} onClick={()=>{setFilterStatus(val);setPage(1);}} style={{ padding:'6px 14px', borderRadius:20, border:'1.5px solid', borderColor:active?(meta?.color??'#2563EB'):'#E4E7EC', background:active?(meta?.bg??'#EFF6FF'):'#fff', color:active?(meta?.color??'#2563EB'):'#667085', fontWeight:active?700:500, fontSize:12, cursor:'pointer', fontFamily:"'Inter',sans-serif", whiteSpace:'nowrap' }}>
                {label}{cnt>0?<span style={{ marginLeft:5, opacity:0.7 }}>({cnt})</span>:''}
              </button>
            );
          })}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:'auto' }}>
          <span style={{ color:'#98A2B3', display:'flex' }}><IconCalendar /></span>
          <input type="date" value={filterDate} onChange={e=>{setFilterDate(e.target.value);setPage(1);}}
            style={{ padding:'7px 10px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054' }}
            onFocus={e=>e.target.style.borderColor='#2563EB'} onBlur={e=>e.target.style.borderColor='#E4E7EC'} />
          {filterDate && <button onClick={()=>setFilterDate('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#98A2B3', display:'flex', padding:2 }}><IconClose /></button>}
        </div>
        {isSuperAdmin && (
          <select value={filterBranch} onChange={e=>{setFilterBranch(e.target.value);setPage(1);}}
            style={{ padding:'7px 12px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
            <option value="">All Branches</option>
            {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div style={{ background:'#fff', borderRadius:14, border:'1px solid #EAECF0', overflow:'hidden', boxShadow:'0 1px 4px rgba(16,24,40,0.04)' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:"'Inter',sans-serif", tableLayout:'fixed' }}>
            <colgroup>
              <col style={{ width:'18%' }} />
              <col style={{ width:'15%' }} />
              <col style={{ width:'16%' }} />
              <col style={{ width:'15%' }} />
              <col style={{ width:'12%' }} />
              <col style={{ width:'14%' }} />
              <col style={{ width:'10%' }} />
            </colgroup>
            <thead>
              <tr>
                <Th col="customer_name">Customer</Th>
                <Th>Service</Th>
                <Th>Staff</Th>
                <Th col="date">Date & Time</Th>
                <Th col="amount" align="right">Amount</Th>
                <Th col="status">Status</Th>
                <Th align="center">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({length:5}).map((_,i)=>(
                <tr key={i}>{Array.from({length:7}).map((_,j)=>(
                  <td key={j} style={{ padding:'14px 16px' }}>
                    <div style={{ height:13, borderRadius:6, width:`${50+(j*13)%40}%`, background:'linear-gradient(90deg,#F2F4F7 25%,#E8EAED 50%,#F2F4F7 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s infinite' }} />
                  </td>
                ))}</tr>
              )) : displayed.length===0 ? (
                <tr><td colSpan={7} style={{ padding:'52px 16px', textAlign:'center' }}>
                  <div style={{ fontSize:40, marginBottom:12 }}></div>
                  <div style={{ color:'#344054', fontWeight:600, fontSize:15 }}>No appointments found</div>
                  <div style={{ color:'#98A2B3', fontSize:13, marginTop:4 }}>Try adjusting your filters or add a new appointment</div>
                </td></tr>
              ) : displayed.map((row,idx)=>(
                <ApptRow key={row.id} row={row} idx={idx} canEdit={canEdit}
                  onView={()=>openDetail(row)} onEdit={()=>openEdit(row)} onDelete={()=>confirmDelete(row.id)}
                  onStatusChange={v=>handleStatusChange(row.id,v)} onPayment={()=>openPayment(row)} />
              ))}
            </tbody>
          </table>
          <style>{'@keyframes shimmer { to { background-position:-200% 0; } }'}</style>
        </div>
        <div style={{ padding:'10px 16px', borderTop:'1px solid #F2F4F7', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
          <span style={{ fontSize:12, color:'#98A2B3' }}>Showing {displayed.length} of {total}</span>
          {totalPages>1 && (
            <div style={{ display:'flex', gap:4 }}>
              <PagBtn onClick={()=>setPage(1)} disabled={page===1} label="«" />
              <PagBtn onClick={()=>setPage(p=>p-1)} disabled={page===1} label="" />
              {Array.from({length:Math.min(5,totalPages)},(_,i)=>{ const p=Math.max(1,Math.min(totalPages-4,page-2))+i; return <PagBtn key={p} onClick={()=>setPage(p)} active={p===page} label={p} />; })}
              <PagBtn onClick={()=>setPage(p=>p+1)} disabled={page===totalPages} label="" />
              <PagBtn onClick={()=>setPage(totalPages)} disabled={page===totalPages} label="»" />
            </div>
          )}
        </div>
      </div>

      {/* New / Edit Modal */}
      <Modal open={showForm} onClose={()=>setShowForm(false)} title={editItem?'Edit Appointment':'New Appointment'} size="lg"
        footer={<><Button variant="secondary" onClick={()=>setShowForm(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSave}>{editItem?'Save Changes':'Create Appointment'}</Button></>}>
        {formErr && <div style={{ background:'#FEF2F2', color:'#DC2626', padding:'9px 13px', borderRadius:9, marginBottom:16, fontSize:13, border:'1px solid #FEE2E2' }}> {formErr}</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <FormGroup label="Customer" required>
            {form.customer_id && form.customer_name ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, border:'1px solid #86EFAC', background:'#ECFDF3', borderRadius:10, padding:'10px 12px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                  <div style={{ width:34, height:34, borderRadius:8, background:'#16A34A', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800 }}>
                    {form.customer_name?.charAt(0)?.toUpperCase() || 'C'}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'#0F172A', lineHeight:1.2 }}>{form.customer_name}</div>
                    {form.phone && <div style={{ fontSize:12, color:'#64748B' }}>{form.phone}</div>}
                  </div>
                </div>
                <button type="button" onClick={() => { setForm(f=>({...f, customer_id:'', customer_name:'', phone:''})); setCustomerSearch(''); setShowCustomerDrop(true); setCustomerPackages([]); setSelectedCustomerPackageId(''); }} style={{ border:'none', background:'none', color:'#94A3B8', cursor:'pointer', fontSize:18, lineHeight:1 }}>×</button>
              </div>
            ) : (
              <div style={{ position:'relative' }}>
                <Input
                  value={customerSearch}
                  onChange={e => {
                    const v = e.target.value;
                    setCustomerSearch(v);
                    setForm(f=>({...f, customer_id:'', customer_name:v}));
                    setCustomerPackages([]);
                    setSelectedCustomerPackageId('');
                    setShowCustomerDrop(true);
                  }}
                  onFocus={() => setShowCustomerDrop(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDrop(false), 200)}
                  placeholder={customerLoading ? 'Loading customers...' : 'Search customer name or phone'}
                />
                {showCustomerDrop && (
                  <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:20, background:'#fff', border:'1.5px solid #E4E7EC', borderRadius:10, boxShadow:'0 8px 24px rgba(16,24,40,0.12)', maxHeight:220, overflowY:'auto' }}>
                    {customerLoading ? (
                      <div style={{ padding:'10px 12px', fontSize:12, color:'#98A2B3' }}>Loading...</div>
                    ) : filteredCustomers.length === 0 ? (
                      <div style={{ padding:'10px 12px', fontSize:12, color:'#98A2B3' }}>No customer found</div>
                    ) : (
                      filteredCustomers.slice(0, 80).map(c => (
                        <div key={c.id} onMouseDown={() => selectCustomer(c)} style={{ padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid #F2F4F7' }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'#101828' }}>{c.name}</div>
                          <div style={{ fontSize:11, color:'#98A2B3' }}>{c.phone || 'No phone'}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </FormGroup>
          <FormGroup label="Phone"><Input value={form.phone||''} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="0300-0000000" /></FormGroup>
          <FormGroup label="Customer Package (Optional)">
            <Select value={selectedCustomerPackageId} onChange={e => applySelectedPackage(e.target.value)} disabled={!form.customer_id || loadingCustomerPackages}>
              <option value="">{!form.customer_id ? 'Select customer first' : loadingCustomerPackages ? 'Loading packages...' : 'No package / normal appointment'}</option>
              {customerPackages.map(cp => (
                <option key={cp.id} value={cp.id}>
                  {cp.package?.name || 'Package'} - {(cp.sessions_remaining ?? ((cp.sessions_total || 0) - (cp.sessions_used || 0)))} left
                </option>
              ))}
            </Select>
          </FormGroup>
          {isSuperAdmin && <FormGroup label="Branch"><Select value={form.branch_id||''} onChange={e=>setForm(f=>({...f,branch_id:e.target.value,staff_id:''}))}>
            <option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </Select></FormGroup>}
          <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:10, padding:'10px 12px' }}>
            <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
              <input
                type="checkbox"
                checked={!!form.is_recurring}
                onChange={e => setForm(f => ({
                  ...f,
                  is_recurring: e.target.checked,
                  recurrence_frequency: e.target.checked ? (f.recurrence_frequency || 'weekly') : 'weekly',
                }))}
                style={{ width:16, height:16, accentColor:'#2563EB' }}
              />
              <span style={{ fontSize:14, fontWeight:600, color:'#0F172A' }}>Recurring Appointment</span>
            </label>
            {form.is_recurring && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:8 }}>
                <div>
                  <div style={{ fontSize:12, color:'#64748B', marginBottom:4, fontWeight:600 }}>Repeat</div>
                  <select
                    value={form.recurrence_frequency || 'weekly'}
                    onChange={e => setForm(f => ({ ...f, recurrence_frequency: e.target.value }))}
                    style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1.5px solid #D0D5DD', fontSize:13, fontFamily:'inherit', background:'#fff', color:'#344054' }}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div style={{ fontSize:12, color:'#64748B', alignSelf:'end' }}>
                  Next appointment auto-create වෙන්නේ current appointment එක completed උනාමයි.
                </div>
              </div>
            )}
          </div>
          <FormGroup label="Services" required>
            <div style={{ border:'1px solid #DCE6F3', borderRadius:12, overflow:'hidden', maxHeight:180, overflowY:'auto' }}>
              {services.filter(s => s.is_active !== false).map((s, idx, arr) => {
                const active = apptServiceIds.includes(Number(s.id));
                return (
                  <label key={s.id} style={{ display:'grid', gridTemplateColumns:'24px 1fr auto', alignItems:'center', gap:10, padding:'9px 12px', borderBottom:idx!==arr.length-1?'1px solid #EEF2F6':'none', background:active?'#F0F9FF':'#fff', cursor:'pointer' }}>
                    <input type="checkbox" checked={active} onChange={() => toggleApptService(s.id)} style={{ width:16, height:16, accentColor:'#2563EB' }} />
                    <span style={{ fontSize:14, color:'#0F172A', fontWeight:active?700:500 }}>{s.name}</span>
                    <span style={{ fontSize:14, color:'#059669', fontWeight:800 }}>Rs.{Number(s.price||0).toLocaleString()}</span>
                  </label>
                );
              })}
            </div>
            {apptServiceIds.length > 0 && (
              <div style={{ marginTop:8, display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                {services.filter(s => apptServiceIds.includes(Number(s.id))).map(s => (
                  <span key={s.id} style={{ fontSize:12, color:'#047857', background:'#D1FAE5', border:'1px solid #A7F3D0', padding:'2px 8px', borderRadius:999, fontWeight:700 }}>
                    {s.name}
                  </span>
                ))}
                <span style={{ fontSize:13, color:'#047857', fontWeight:800 }}>Total: Rs. {Number(form.amount||0).toLocaleString()}</span>
              </div>
            )}
          </FormGroup>
          <FormGroup label="Staff"><Select value={form.staff_id||''} onChange={e=>setForm(f=>({...f,staff_id:e.target.value}))}>
            <option value="">Any available</option>{filteredStaff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </Select></FormGroup>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
            <FormGroup label="Date" required><Input type="date" value={form.date||''} onChange={e=>setForm(f=>({...f,date:e.target.value}))} /></FormGroup>
            <FormGroup label="Time" required><Input type="time" value={form.time||''} onChange={e=>setForm(f=>({...f,time:e.target.value}))} /></FormGroup>
            <FormGroup label="Amount (Rs.)"><Input type="number" value={form.amount||''} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0" /></FormGroup>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FormGroup label="Status"><Select value={form.status||'pending'} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
              {APPT_STATUSES.filter(s => s !== 'completed').map(s=><option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </Select></FormGroup>
            <FormGroup label="Notes"><Input value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Special requests..." /></FormGroup>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={!!deleteId} onClose={()=>setDeleteId(null)} title="Delete Appointment" size="sm"
        footer={<>
          <Button variant="secondary" onClick={()=>setDeleteId(null)}>No</Button>
          <Button variant="danger" onClick={handleDelete} style={{ background:'#DC2626', color:'#fff' }}>Yes, Delete</Button>
        </>}>
        <div style={{ textAlign:'center', padding:'12px 0' }}>
          <div style={{ width:56, height:56, borderRadius:'50%', background:'#FEF2F2', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </div>
          <div style={{ fontSize:15, fontWeight:600, color:'#101828', marginBottom:6 }}>Are you sure?</div>
          <div style={{ fontSize:13, color:'#667085' }}>This appointment will be permanently deleted.<br/>This action cannot be undone.</div>
        </div>
      </Modal>

      {/* Collect Payment Modal */}
      <Modal open={showPayment} onClose={()=>setShowPayment(false)} title="Collect Payment" size="md"
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
              <div style={{ background:'#F9FAFB', borderRadius:12, padding:'14px 16px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontSize:15, fontWeight:700, color:'#101828' }}>{paymentAppt.customer_name}</div>
                    <div style={{ fontSize:13, color:'#667085', marginTop:2 }}>{paymentAppt.phone||''}</div>
                  </div>
                  {paymentAppt.staff?.name && <span style={{ background:'#F3F4F6', color:'#475467', padding:'4px 12px', borderRadius:8, fontSize:12, fontWeight:500 }}>{paymentAppt.staff.name}</span>}
                </div>
              </div>
              <FormGroup label="Services" required>
                <div style={{ border:'1px solid #DCE6F3', borderRadius:12, overflow:'hidden', maxHeight:180, overflowY:'auto' }}>
                  {services.filter(s => s.is_active !== false).map((s, idx, arr) => {
                    const active = paymentServices.includes(Number(s.id));
                    return (
                      <label key={s.id} style={{ display:'grid', gridTemplateColumns:'24px 1fr auto', alignItems:'center', gap:10, padding:'9px 12px', borderBottom:idx!==arr.length-1?'1px solid #EEF2F6':'none', background:active?'#F0F9FF':'#fff', cursor:'pointer' }}>
                        <input type="checkbox" checked={active} onChange={() => togglePaymentService(s.id)} style={{ width:16, height:16, accentColor:'#2563EB' }} />
                        <span style={{ fontSize:14, color:'#0F172A', fontWeight:active?700:500 }}>{s.name}</span>
                        <span style={{ fontSize:14, color:'#059669', fontWeight:800 }}>Rs.{Number(s.price||0).toLocaleString()}</span>
                      </label>
                    );
                  })}
                </div>
                {paymentServices.length===0 && <div style={{ fontSize:12, color:'#DC2626', marginTop:4 }}>Select at least one service</div>}
              </FormGroup>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, alignItems:'start' }}>
                <FormGroup label="Subtotal (Rs.)">
                  <div style={{ padding:'10px 12px', background:'#F9FAFB', borderRadius:10, border:'1px solid #E5E7EB', fontWeight:800, color:'#059669' }}>
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
                  <Select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}>
                    {['Cash','Card','Bank Transfer','Online'].map(m=><option key={m} value={m}>{m}</option>)}
                  </Select>
                </FormGroup>
              </div>
              <div style={{ background:'#F0FDF4', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #BBF7D0' }}>
                <span style={{ fontSize:13, fontWeight:600, color:'#166534' }}>Collected</span>
                <span style={{ fontSize:18, fontWeight:800, color:'#059669' }}>Rs. {Number(paymentAmt||0).toLocaleString()}</span>
              </div>
            </div>
          )
        )}
      </Modal>

      {/* Detail Drawer */}
      <Drawer open={showDetail} onClose={()=>setShowDetail(false)} title="Appointment Details"
        footer={canEdit&&detailItem&&(
          <div style={{ display:'flex', gap:8 }}>
            {detailItem.status!=='completed'&&detailItem.status!=='cancelled'&&<Button variant="primary" onClick={()=>{setShowDetail(false);openEdit(detailItem);}} style={{ display:'flex', alignItems:'center', gap:6 }}><IconEdit /> Edit</Button>}
            {detailItem.status==='in_service'&&<Button variant="primary" onClick={()=>{setShowDetail(false);openPayment(detailItem);}} style={{ display:'flex', alignItems:'center', gap:6, background:'#059669' }}><IconMoney /> Collect Payment</Button>}
          </div>
        )}>
        {detailItem && (
          <div style={{ fontFamily:"'Inter',sans-serif" }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, padding:'16px', background:'#F9FAFB', borderRadius:12 }}>
              <div>
                <div style={{ fontSize:18, fontWeight:700, color:'#101828' }}>{detailItem.customer_name}</div>
                <div style={{ fontSize:13, color:'#667085', marginTop:2 }}>{detailItem.phone}</div>
              </div>
              <StatusBadge status={detailItem.status} />
            </div>
            {(() => {
              const extraServiceNames = parseAdditionalServiceNames(detailItem.notes || '');
              const allServiceNames = Array.from(new Set([detailItem.service?.name, ...extraServiceNames].filter(Boolean)));
              return (
                <>
                  {[
                    { icon:'', label:'Services', value: allServiceNames.join(', ') || '' },
                    { icon:'', label:'Staff',   value:detailItem.staff?.name||'' },
                    { icon:'', label:'Date',    value:detailItem.date?new Date(detailItem.date).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}):'' },
                    { icon:'', label:'Time',    value:detailItem.time||'' },
                    { icon:'', label:'Branch',  value:detailItem.branch?.name||'' },
                    { icon:'', label:'Amount',  value:`Rs. ${Number(detailItem.amount||detailItem.service?.price||0).toLocaleString()}`, highlight:true },
                  ].map(({icon,label,value,highlight})=>(
                    <div key={label} style={{ display:'flex', alignItems:'center', padding:'12px 0', borderBottom:'1px solid #F2F4F7' }}>
                      <span style={{ fontSize:16, width:28, flexShrink:0 }}>{icon}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:'#98A2B3', textTransform:'uppercase', width:80, flexShrink:0 }}>{label}</span>
                      <span style={{ fontSize:14, color:highlight?'#059669':'#101828', fontWeight:highlight?700:500 }}>{value}</span>
                    </div>
                  ))}
                </>
              );
            })()}
            {detailItem.notes && (
              <div style={{ marginTop:20, padding:'14px 16px', background:'#FFFBEB', borderRadius:10, border:'1px solid #FDE68A' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#D97706', textTransform:'uppercase', marginBottom:6 }}> Notes</div>
                <div style={{ fontSize:13, color:'#475467', lineHeight:1.6 }}>{detailItem.notes}</div>
              </div>
            )}
            <div style={{ marginTop:20, textAlign:'right' }}>
              <span style={{ fontSize:11, color:'#D0D5DD', fontFamily:'monospace' }}>ID #{detailItem.id}</span>
            </div>
          </div>
        )}
      </Drawer>
    </PageWrapper>
  );
}
