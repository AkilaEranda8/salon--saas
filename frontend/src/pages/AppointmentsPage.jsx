import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Input, Select, FormGroup } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';

const IconEye      = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconEdit     = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IconTrash    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
const IconSearch   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IconClose    = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconCalendar = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IconPlus     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconMoney    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
const IconPackage  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;

const APPT_STATUSES = ['pending','confirmed','in_service','completed','cancelled','no_show'];
const STATUS_META = {
  pending:    { color:'#D97706', bg:'#FFFBEB', label:'Pending'    },
  confirmed:  { color:'#2563EB', bg:'#EFF6FF', label:'Confirmed'  },
  in_service: { color:'#7C3AED', bg:'#F5F3FF', label:'In Service' },
  completed:  { color:'#059669', bg:'#ECFDF5', label:'Completed'  },
  cancelled:  { color:'#DC2626', bg:'#FEF2F2', label:'Cancelled'  },
  no_show:    { color:'#64748B', bg:'#F8FAFC', label:'No Show'    },
};
const EMPTY = { branch_id:'', customer_id:'', customer_name:'', phone:'', service_id:'', additional_service_ids:[], staff_id:'', date:'', time:'', amount:'', notes:'', status:'pending' };
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

function ApptRow({ row, idx, canEdit, onView, onEdit, onDelete, onStatusChange, onPayment, onSellPkg }) {
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
        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
          {row.service?.name && <span style={{ background:'#F2F4F7', padding:'3px 9px', borderRadius:6, fontSize:12, fontWeight:600, color:'#475467' }}>{row.service.name}</span>}
          {(row.additional_services||[]).map(s=>(
            <span key={s.id} style={{ background:'#EDE9FE', padding:'3px 9px', borderRadius:6, fontSize:12, fontWeight:500, color:'#5B21B6' }}>{s.name}</span>
          ))}
        </div>
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
        <span style={{ fontWeight:700, color:'#059669', fontSize:14 }}>Rs. {Number(row.service?.price||row.amount||0).toLocaleString()}</span>
      </td>
      <td style={{ padding:'13px 16px' }}>
        {!canEdit||s==='completed'||s==='cancelled' ? <StatusBadge status={s} /> : (
          <select value={s} onChange={e => onStatusChange(e.target.value)}
            style={{ padding:'4px 10px', borderRadius:20, border:`1.5px solid ${meta.color}40`, background:meta.bg, color:meta.color, fontWeight:700, fontSize:12, fontFamily:"'Inter',sans-serif", outline:'none', cursor:'pointer' }}>
            {APPT_STATUSES.map(st => <option key={st} value={st}>{STATUS_META[st].label}</option>)}
          </select>
        )}
      </td>
      <td style={{ padding:'13px 16px', textAlign:'center' }}>
        <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
          <ActionBtn onClick={onView} title="View" color="#2563EB"><IconEye /></ActionBtn>
          {canEdit && s==='in_service' && <ActionBtn onClick={onPayment} title="Collect Payment" color="#059669"><IconMoney /></ActionBtn>}
          {canEdit && row.customer_id && <ActionBtn onClick={onSellPkg} title="Sell Package" color="#7C3AED"><IconPackage /></ActionBtn>}
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
  const [sortKey, setSortKey]   = useState('id');
  const [sortDir, setSortDir]   = useState('desc');
  const [deleteId, setDeleteId] = useState(null);
  // Customer search for form
  const [custSearch, setCustSearch]     = useState('');
  const [custResults, setCustResults]   = useState([]);
  const [custLoading, setCustLoading]   = useState(false);
  const [showCustDrop, setShowCustDrop] = useState(false);
  const [selectedCust, setSelectedCust] = useState(null);
  const custRef = useRef(null);
  // Package selection for form
  const [custPackages, setCustPackages] = useState([]);
  const [selectedPkg, setSelectedPkg]   = useState(null);
  const [pkgLoading,  setPkgLoading]    = useState(false);

  const [showPayment, setShowPayment]     = useState(false);
  const [paymentAppt, setPaymentAppt]     = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentAmt, setPaymentAmt]       = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentErr, setPaymentErr]       = useState('');
  const [paymentOk, setPaymentOk]         = useState(false);
  const [paymentServices, setPaymentServices] = useState([]);

  // Sell Package modal
  const [showSellPkg,       setShowSellPkg]       = useState(false);
  const [sellPkgStep,       setSellPkgStep]       = useState(1);
  const [sellPkgCustomers,  setSellPkgCustomers]  = useState([]);
  const [sellPkgPackages,   setSellPkgPackages]   = useState([]);
  const [sellPkgCustSearch, setSellPkgCustSearch] = useState('');
  const [sellPkgForm,       setSellPkgForm]       = useState({ customer_id:'', package_id:'', payment_method:'Cash', notes:'' });
  const [sellPkgSaving,     setSellPkgSaving]     = useState(false);
  const [sellPkgError,      setSellPkgError]      = useState('');
  const [sellPkgOk,         setSellPkgOk]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [apR, brR, svR, stR] = await Promise.all([
        api.get('/appointments', { params:{ page, limit:LIMIT, ...(filterBranch?{branchId:filterBranch}:{}), ...(filterStatus?{status:filterStatus}:{}), ...(filterDate?{date:filterDate}:{}) } }),
        api.get('/branches',     { params:{ limit:100 } }),
        api.get('/services',     { params:{ limit:200 } }),
        api.get('/staff',        { params:{ limit:200, ...(filterBranch?{branchId:filterBranch}:{}) } }),
      ]);
      const d = apR.data?.data ?? apR.data ?? [];
      setAppts(Array.isArray(d) ? d : []);
      setTotal(apR.data?.total || 0);
      setBranches(Array.isArray(brR.data) ? brR.data : (brR.data?.data??[]));
      setServices(Array.isArray(svR.data) ? svR.data : (svR.data?.data??[]));
      setStaffList(Array.isArray(stR.data) ? stR.data : (stR.data?.data??[]));
    } catch {}
    setLoading(false);
  }, [filterBranch, filterStatus, filterDate, page]);
  useEffect(() => { load(); }, [load]);

  // Customer search
  useEffect(() => {
    if (!custSearch || custSearch.length < 1) { setCustResults([]); return; }
    const t = setTimeout(async () => {
      setCustLoading(true);
      try {
        const r = await api.get('/customers', { params: { search: custSearch, limit: 10 } });
        setCustResults(r.data?.data || r.data || []);
      } catch { setCustResults([]); }
      setCustLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [custSearch]);

  // Close customer dropdown on outside click
  useEffect(() => {
    const handler = e => { if (custRef.current && !custRef.current.contains(e.target)) setShowCustDrop(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load active packages when customer is selected
  useEffect(() => {
    if (!selectedCust?.id) { setCustPackages([]); setSelectedPkg(null); setPkgLoading(false); return; }
    setPkgLoading(true);
    api.get(`/packages/customer/${selectedCust.id}/active`)
      .then(r => setCustPackages(r.data || []))
      .catch(() => setCustPackages([]))
      .finally(() => setPkgLoading(false));
  }, [selectedCust]);

  const selectCust = (c) => {
    setSelectedCust(c);
    setForm(f => ({ ...f, customer_id: c.id, customer_name: c.name, phone: c.phone || f.phone }));
    setCustSearch(''); setShowCustDrop(false);
  };
  const clearCust = () => {
    setSelectedCust(null); setSelectedPkg(null); setCustPackages([]);
    setForm(f => ({ ...f, customer_id: '', customer_name: '', phone: '' }));
  };

  const calcServiceTotal = (ids) => ids.reduce((sum, sid) => { const s = services.find(x => Number(x.id) === Number(sid)); return sum + Number(s?.price || 0); }, 0);
  const openPayment = (row) => {
    setPaymentAppt(row);
    const svcId = Number(row.service_id || row.service?.id);
    const ids = svcId ? [svcId] : [];
    setPaymentServices(ids);
    const total = calcServiceTotal(ids);
    setPaymentAmt(total > 0 ? total : (row.amount || ''));
    setPaymentMethod('Cash');
    setPaymentErr('');
    setPaymentOk(false);
    setShowPayment(true);
  };
  const togglePaymentService = (id) => {
    const nid = Number(id);
    setPaymentServices(prev => {
      const next = prev.includes(nid) ? prev.filter(x => x !== nid) : [...prev, nid];
      setPaymentAmt(calcServiceTotal(next));
      return next;
    });
  };
  const handlePayment = async () => {
    if (!paymentAmt || Number(paymentAmt) <= 0) return setPaymentErr('Amount is required');
    if (!paymentServices.length) return setPaymentErr('At least one service is required');
    setPaymentSaving(true);
    try {
      await api.post('/payments', {
        branch_id: paymentAppt.branch_id || paymentAppt.branch?.id || user?.branch_id,
        staff_id: paymentAppt.staff_id || paymentAppt.staff?.id || null,
        customer_id: paymentAppt.customer_id || null,
        service_id: paymentServices[0] || null,
        appointment_id: paymentAppt.id,
        customer_name: paymentAppt.customer_name,
        splits: [{ method: paymentMethod, amount: Number(paymentAmt) }],
      });
      // Auto-mark appointment as completed
      await api.patch(`/appointments/${paymentAppt.id}/status`, { status: 'completed' });
      setPaymentOk(true);
      load();
      setTimeout(() => { setShowPayment(false); setPaymentOk(false); }, 1200);
    } catch (e) { setPaymentErr(e.response?.data?.message || 'Payment failed'); }
    setPaymentSaving(false);
  };

  const openAdd    = () => { setEditItem(null); setForm({...EMPTY, branch_id:user?.branch_id||'', date:today}); setFormErr(''); setSelectedCust(null); setSelectedPkg(null); setCustPackages([]); setCustSearch(''); setShowForm(true); };
  const openEdit   = row => { setEditItem(row); setForm({...row, service_id:row.service?.id||row.service_id, additional_service_ids:row.additional_service_ids||[], staff_id:row.staff?.id||row.staff_id, date:row.date?.slice(0,10)||''}); setFormErr(''); setSelectedCust(null); setSelectedPkg(null); setCustPackages([]); setCustSearch(''); setShowForm(true); };
  const openDetail = row => { setDetailItem(row); setShowDetail(true); };

  const handleSave = async () => {
    if (!form.customer_name||!form.service_id||!form.date||!form.time) return setFormErr('Customer, service, date and time are required');
    setSaving(true);
    try {
      const payload = { ...form, additional_service_ids: form.additional_service_ids || [] };
      const res = editItem
        ? await api.put(`/appointments/${editItem.id}`, payload)
        : await api.post('/appointments', payload);
      // Redeem package session if a package was selected (new appointments only)
      if (!editItem && selectedPkg && form.service_id) {
        try {
          await api.post('/packages/redeem', {
            customerPackageId: selectedPkg.id,
            serviceId: Number(form.service_id),
            appointmentId: res.data?.id || null,
            staffId: form.staff_id || null,
          });
        } catch (pkgErr) {
          // Non-fatal — appointment already created, just warn
          setFormErr(`Appointment saved but package redeem failed: ${pkgErr.response?.data?.message || pkgErr.message}`);
          setSaving(false); load(); return;
        }
      }
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
    const brId = filterBranch || user?.branch_id;
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
      actions={canEdit && (
        <div style={{ display:'flex', gap:8 }}>
          <Button variant="primary" onClick={() => openSellPkg()} style={{ display:'flex', alignItems:'center', gap:6, background:'#7C3AED' }}>
            <IconPackage /> Sell Package
          </Button>
          <Button variant="primary" onClick={openAdd} style={{ display:'flex', alignItems:'center', gap:6 }}><IconPlus /> New Appointment</Button>
        </div>
      )}>

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
                  onStatusChange={v=>handleStatusChange(row.id,v)} onPayment={()=>openPayment(row)}
                  onSellPkg={() => openSellPkg(row.customer_id ? { id: row.customer_id, name: row.customer_name } : null)} />
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
          {/* Customer Search */}
          <FormGroup label="Customer" required>
            {selectedCust ? (
              <div style={{ display:'flex', alignItems:'center', gap:10, background:'#F0FDF4', border:'1.5px solid #86EFAC', borderRadius:10, padding:'9px 14px' }}>
                <div style={{ width:36, height:36, borderRadius:8, background:'#16a34a', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, flexShrink:0 }}>
                  {selectedCust.name?.charAt(0)?.toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#101828' }}>{selectedCust.name}</div>
                  {selectedCust.phone && <div style={{ fontSize:11, color:'#667085' }}>{selectedCust.phone}</div>}
                </div>
                <button type="button" onClick={clearCust} style={{ background:'none', border:'none', cursor:'pointer', color:'#64748b', fontSize:18, lineHeight:1, padding:2 }}>×</button>
              </div>
            ) : (
              <div style={{ position:'relative' }} ref={custRef}>
                <input value={custSearch} onChange={e=>{setCustSearch(e.target.value); setForm(f=>({...f,customer_name:e.target.value,customer_id:''})); setShowCustDrop(true);}}
                  onFocus={()=>setShowCustDrop(true)}
                  placeholder="Type to search or enter name..."
                  style={{ width:'100%', padding:'8px 12px', borderRadius:9, border:'1.5px solid #D0D5DD', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', boxSizing:'border-box', color:'#101828' }}
                  onFocusCap={e=>e.target.style.borderColor='#2563EB'} onBlur={e=>e.target.style.borderColor='#D0D5DD'} />
                {custLoading && <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:12, color:'#98A2B3' }}>⏳</span>}
                {showCustDrop && custResults.length>0 && (
                  <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff', border:'1.5px solid #E4E7EC', borderRadius:10, boxShadow:'0 8px 24px rgba(16,24,40,0.12)', zIndex:200, maxHeight:180, overflowY:'auto' }}>
                    {custResults.map(c=>(
                      <div key={c.id} onMouseDown={()=>selectCust(c)} style={{ padding:'9px 14px', cursor:'pointer', borderBottom:'1px solid #F2F4F7', display:'flex', alignItems:'center', gap:10 }}
                        onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                        <div style={{ width:28, height:28, borderRadius:6, background:'#2563EB', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{c.name?.charAt(0)?.toUpperCase()}</div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:'#101828' }}>{c.name}</div>
                          {c.phone && <div style={{ fontSize:11, color:'#98A2B3' }}>{c.phone}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </FormGroup>
          {/* Phone (manual only when no customer selected) */}
          {!selectedCust && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <FormGroup label="Name (manual)" required>
                <Input value={form.customer_name||''} onChange={e=>setForm(f=>({...f,customer_name:e.target.value}))} placeholder="Full name" />
              </FormGroup>
              <FormGroup label="Phone"><Input value={form.phone||''} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="0300-0000000" /></FormGroup>
            </div>
          )}
          {selectedCust && (
            <FormGroup label="Phone">
              <Input value={form.phone||''} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="0300-0000000" />
            </FormGroup>
          )}
          {/* Active Packages — show while loading or when packages exist */}
          {selectedCust && (pkgLoading || custPackages.length > 0) && (
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'#98A2B3', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>
                Packages
                {pkgLoading
                  ? <span style={{ fontSize:11, fontWeight:400, color:'#C4CAD4', textTransform:'none', marginLeft:6 }}>— loading…</span>
                  : <span style={{ fontSize:11, fontWeight:400, color:'#C4CAD4', textTransform:'none', marginLeft:6 }}>— click to use a session</span>
                }
              </div>
              {pkgLoading ? (
                <div style={{ background:'#F9FAFB', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#98A2B3', textAlign:'center' }}>
                  Loading packages…
                </div>
              ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                {custPackages.map(cp=>{
                  const isSel = selectedPkg?.id===cp.id;
                  const pkgServices = cp.package?.services || [];
                  const sessLeft = (cp.sessions_total||0)-(cp.sessions_used||0);
                  return (
                    <div key={cp.id} onClick={()=>{
                      setSelectedPkg(isSel?null:cp);
                      if(!isSel && pkgServices.length>0){
                        const sid = String(pkgServices[0]);
                        setForm(f=>({...f, service_id:sid, additional_service_ids:[], amount:0}));
                      }
                    }} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:10, border:`1.5px solid ${isSel?'#7C3AED':'#E4E7EC'}`, background:isSel?'#F5F3FF':'#FAFAFA', cursor:'pointer', transition:'all 0.15s' }}>
                      <div style={{ width:36, height:36, borderRadius:8, background:isSel?'#7C3AED':'#E4E7EC', color:isSel?'#fff':'#667085', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, flexShrink:0 }}>PKG</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:isSel?'#5B21B6':'#101828' }}>{cp.package?.name||'Package'}</div>
                        <div style={{ fontSize:11, color:'#667085', marginTop:1 }}>
                          {sessLeft} session{sessLeft!==1?'s':''} left · expires {cp.expiry_date}
                        </div>
                      </div>
                      {isSel && <span style={{ fontSize:13, color:'#7C3AED', fontWeight:700 }}>✓ Selected</span>}
                    </div>
                  );
                })}
                {selectedPkg && <div style={{ fontSize:11, color:'#7C3AED', marginTop:4, fontWeight:600 }}>Package session will be redeemed on save</div>}
              </div>
              )}
            </div>
          )}
          {isSuperAdmin && <FormGroup label="Branch"><Select value={form.branch_id||''} onChange={e=>setForm(f=>({...f,branch_id:e.target.value,staff_id:''}))}>
            <option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </Select></FormGroup>}
          {/* Services multi-select */}
          <FormGroup label="Services" required>
            <div style={{ display:'flex', flexDirection:'column', gap:5, maxHeight:180, overflowY:'auto', border:'1.5px solid #E4E7EC', borderRadius:10, padding:'8px 10px' }}>
              {(() => {
                const pkgSvcIds = (selectedPkg?.package?.services || []).map(Number);
                return services.map(s => {
                  const isPrimary   = String(form.service_id) === String(s.id);
                  const isExtra     = (form.additional_service_ids||[]).map(Number).includes(Number(s.id));
                  const isSel       = isPrimary || isExtra;
                  const coveredByPkg = pkgSvcIds.includes(Number(s.id));
                  return (
                    <label key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 8px', borderRadius:8, cursor:'pointer', background: coveredByPkg && isSel ? '#F5F3FF' : isSel ? '#F0FDF4' : 'transparent', border: coveredByPkg ? '1px solid #DDD6FE' : 'none', transition:'background 0.1s' }}>
                      <input type="checkbox" checked={isSel} onChange={() => {
                        setForm(f => {
                          const cur = (f.additional_service_ids||[]).map(Number);
                          const pkgIds = (selectedPkg?.package?.services || []).map(Number);
                          // Price for a service = 0 if covered by selected package
                          const svcPrice = (id) => {
                            const sv = services.find(x=>Number(x.id)===Number(id));
                            return pkgIds.includes(Number(id)) ? 0 : Number(sv?.price||0);
                          };
                          if (isPrimary) {
                            if (cur.length > 0) {
                              const [newPrimary, ...rest] = cur;
                              const total = rest.reduce((sum,id)=>sum+svcPrice(id),0) + svcPrice(newPrimary);
                              return { ...f, service_id: String(newPrimary), additional_service_ids: rest, amount: total };
                            }
                            return { ...f, service_id: '', additional_service_ids: [], amount: '' };
                          }
                          if (isExtra) {
                            const next = cur.filter(x => x !== Number(s.id));
                            const allIds = [f.service_id, ...next].filter(Boolean);
                            const total = allIds.reduce((sum,id)=>sum+svcPrice(id),0);
                            return { ...f, additional_service_ids: next, amount: total };
                          }
                          if (!f.service_id) {
                            return { ...f, service_id: String(s.id), amount: svcPrice(s.id) };
                          }
                          const next = [...cur, Number(s.id)];
                          const allIds = [f.service_id, ...next].filter(Boolean);
                          const total = allIds.reduce((sum,id)=>sum+svcPrice(id),0);
                          return { ...f, additional_service_ids: next, amount: total };
                        });
                      }} style={{ accentColor:'#7C3AED', width:15, height:15, flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:13, fontWeight:isSel?700:500, color:isSel?(coveredByPkg?'#5B21B6':'#059669'):'#101828' }}>{s.name}</span>
                        {isPrimary && !coveredByPkg && <span style={{ fontSize:10, color:'#059669', fontWeight:700, background:'#DCFCE7', padding:'1px 6px', borderRadius:4 }}>Primary</span>}
                        {coveredByPkg && <span style={{ fontSize:10, color:'#7C3AED', fontWeight:700, background:'#EDE9FE', padding:'1px 7px', borderRadius:4 }}>PKG</span>}
                      </div>
                      {coveredByPkg ? (
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <span style={{ fontSize:11, color:'#94A3B8', textDecoration:'line-through', display:'block' }}>Rs.{Number(s.price||0).toLocaleString()}</span>
                          <span style={{ fontSize:12, color:'#7C3AED', fontWeight:800 }}>FREE</span>
                        </div>
                      ) : (
                        <span style={{ fontSize:12, color:'#059669', fontWeight:600, flexShrink:0 }}>Rs.{Number(s.price||0).toLocaleString()}</span>
                      )}
                    </label>
                  );
                });
              })()}
            </div>
            {/* Selected chips */}
            {(form.service_id || (form.additional_service_ids||[]).length>0) && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:6 }}>
                {[form.service_id, ...(form.additional_service_ids||[])].filter(Boolean).map((id,i) => {
                  const svc = services.find(x=>String(x.id)===String(id));
                  if (!svc) return null;
                  const pkgSvcIds = (selectedPkg?.package?.services || []).map(Number);
                  const free = pkgSvcIds.includes(Number(id));
                  return <span key={id} style={{ fontSize:11, background: free ? '#EDE9FE' : '#DCFCE7', color: free ? '#5B21B6' : '#059669', padding:'2px 9px', borderRadius:20, fontWeight:600 }}>{i===0?'★ ':''}{svc.name}{free?' (FREE)':''}</span>;
                })}
                <span style={{ fontSize:11, color:'#059669', fontWeight:700, padding:'2px 0', alignSelf:'center' }}>Total: Rs. {Number(form.amount||0).toLocaleString()}</span>
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
              {APPT_STATUSES.map(s=><option key={s} value={s}>{STATUS_META[s].label}</option>)}
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
      <Modal open={showPayment} onClose={()=>setShowPayment(false)} title="Collect Payment" size="sm">
        {paymentAppt && (
          paymentOk ? (
            <div style={{ textAlign:'center', padding:'28px 0' }}>
              <div style={{ width:64, height:64, borderRadius:'50%', background:'#ECFDF5', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <div style={{ fontSize:17, fontWeight:700, color:'#059669' }}>Payment Collected!</div>
              <div style={{ fontSize:13, color:'#667085', marginTop:6 }}>Rs. {Number(paymentAmt||0).toLocaleString()} via {paymentMethod}</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {paymentErr && <div style={{ background:'#FEE2E2', border:'1px solid #FECACA', borderRadius:8, padding:'9px 14px', color:'#B91C1C', fontSize:13 }}>{paymentErr}</div>}

              {/* Customer info */}
              <div style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:42, height:42, borderRadius:10, background:'#1e293b', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, flexShrink:0 }}>
                  {paymentAppt.customer_name?.charAt(0)?.toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#101828' }}>{paymentAppt.customer_name}</div>
                  <div style={{ display:'flex', gap:10, marginTop:2, flexWrap:'wrap' }}>
                    {paymentAppt.phone && <span style={{ fontSize:12, color:'#667085' }}>📞 {paymentAppt.phone}</span>}
                    {paymentAppt.staff?.name && <span style={{ fontSize:12, color:'#667085' }}>✂ {paymentAppt.staff.name}</span>}
                  </div>
                </div>
              </div>

              {/* Service breakdown */}
              {paymentServices.length > 0 && (
                <div style={{ border:'1px solid #E4E7EC', borderRadius:10, overflow:'hidden' }}>
                  {services.filter(s => paymentServices.includes(Number(s.id))).map((s, i, arr) => (
                    <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 14px', borderBottom: i < arr.length-1 ? '1px solid #F2F4F7' : 'none' }}>
                      <div>
                        <span style={{ fontSize:13, fontWeight:600, color:'#101828' }}>{s.name}</span>
                        {s.duration_minutes && <span style={{ fontSize:11, color:'#98A2B3', marginLeft:8 }}>{s.duration_minutes} min</span>}
                      </div>
                      <span style={{ fontSize:13, fontWeight:700, color:'#059669' }}>
                        {s.price ? `Rs. ${Number(s.price).toLocaleString()}` : '—'}
                      </span>
                    </div>
                  ))}
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 14px', background:'#F9FAFB', borderTop:'1.5px solid #E4E7EC' }}>
                    <span style={{ fontSize:13, fontWeight:700, color:'#101828' }}>Total</span>
                    <span style={{ fontSize:15, fontWeight:800, color:'#059669' }}>Rs. {Number(paymentAmt||0).toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Payment method toggle */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#98A2B3', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Payment Method</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {['Cash','Card','Online Transfer'].map(m => (
                    <button key={m} type="button" onClick={()=>setPaymentMethod(m)} style={{
                      padding:'7px 16px', borderRadius:8, fontSize:13, fontWeight:600,
                      cursor:'pointer', fontFamily:"'Inter',sans-serif", transition:'all 0.15s',
                      border:`1.5px solid ${paymentMethod===m?'#10b981':'#D0D5DD'}`,
                      background:paymentMethod===m?'#F0FDF4':'#fff',
                      color:paymentMethod===m?'#065F46':'#101828',
                    }}>{m}</button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#98A2B3', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Amount (Rs.) *</div>
                <input type="number" min="0" value={paymentAmt} onChange={e=>setPaymentAmt(e.target.value)}
                  style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid #D0D5DD', fontSize:14, fontFamily:"'Inter',sans-serif", background:'#fff', color:'#101828', outline:'none', boxSizing:'border-box' }}
                  onFocus={e=>e.target.style.borderColor='#10b981'} onBlur={e=>e.target.style.borderColor='#D0D5DD'} />
              </div>

              {/* Actions */}
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:6 }}>
                <Button variant="secondary" onClick={()=>setShowPayment(false)}>Cancel</Button>
                <Button loading={paymentSaving} disabled={paymentSaving||!paymentAmt} onClick={handlePayment}
                  style={{ background:'#10b981', border:'none', fontWeight:700 }}>
                  Collect Rs. {Number(paymentAmt||0).toLocaleString()}
                </Button>
              </div>
            </div>
          )
        )}
      </Modal>

      {/* Sell Package Modal */}
      <Modal open={showSellPkg} onClose={() => { setShowSellPkg(false); setSellPkgOk(false); }} title="Sell Package" size="md">
        {sellPkgOk ? (
          <div style={{ textAlign:'center', padding:'28px 0' }}>
            <div style={{ width:64, height:64, borderRadius:'50%', background:'#F5F3FF', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div style={{ fontSize:17, fontWeight:700, color:'#7C3AED', fontFamily:"'Inter',sans-serif" }}>Package Sold!</div>
            <div style={{ fontSize:13, color:'#667085', marginTop:6, fontFamily:"'Inter',sans-serif" }}>{sellPkgSelCust?.name} has been assigned the package.</div>
          </div>
        ) : (
          <>
            {/* Stepper */}
            <div style={{ display:'flex', alignItems:'center', marginBottom:22 }}>
              {[['Customer',1],['Package',2],['Payment',3]].map(([label, step], i, arr) => {
                const done = sellPkgStep > step, active = sellPkgStep === step;
                return (
                  <div key={step} style={{ display:'flex', alignItems:'center', flex: i < arr.length-1 ? 1 : 'none' }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3, flexShrink:0 }}>
                      <div style={{ width:30, height:30, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, fontFamily:"'Inter',sans-serif",
                        background:done?'#7C3AED':active?'#F5F3FF':'#F2F4F7',
                        border:active?'2px solid #7C3AED':done?'none':'2px solid #D0D5DD',
                        color:done?'#fff':active?'#7C3AED':'#64748B' }}>
                        {done ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : step}
                      </div>
                      <span style={{ fontSize:10, fontWeight:600, color:active?'#7C3AED':'#64748B', fontFamily:"'Inter',sans-serif", whiteSpace:'nowrap' }}>{label}</span>
                    </div>
                    {i < arr.length-1 && <div style={{ flex:1, height:2, background:done?'#7C3AED':'#E4E7EC', margin:'0 6px', marginBottom:18 }} />}
                  </div>
                );
              })}
            </div>

            {/* Step 1: Customer */}
            {sellPkgStep === 1 && (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#344054', fontFamily:"'Inter',sans-serif" }}>Search Customer</div>
                <input value={sellPkgCustSearch} onChange={e=>setSellPkgCustSearch(e.target.value)} placeholder="Name or phone..."
                  style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', boxSizing:'border-box', color:'#101828' }}
                  onFocus={e=>e.target.style.borderColor='#7C3AED'} onBlur={e=>e.target.style.borderColor='#E4E7EC'} />
                <div style={{ maxHeight:220, overflowY:'auto', border:'1.5px solid #E4E7EC', borderRadius:10 }}>
                  {sellPkgCustomers.length === 0 ? (
                    <div style={{ textAlign:'center', padding:20, color:'#98A2B3', fontSize:13, fontFamily:"'Inter',sans-serif" }}>Loading customers…</div>
                  ) : sellPkgFilteredCusts.length === 0 ? (
                    <div style={{ textAlign:'center', padding:20, color:'#98A2B3', fontSize:13, fontFamily:"'Inter',sans-serif" }}>No customers found</div>
                  ) : sellPkgFilteredCusts.slice(0,30).map(c => {
                    const sel = String(c.id) === String(sellPkgForm.customer_id);
                    return (
                      <div key={c.id} onClick={() => setSellPkgForm(f=>({...f, customer_id:String(c.id)}))}
                        style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                          background:sel?'#F5F3FF':'#fff', borderBottom:'1px solid #F2F4F7',
                          cursor:'pointer', borderLeft:`3px solid ${sel?'#7C3AED':'transparent'}` }}
                        onMouseEnter={e=>{ if(!sel) e.currentTarget.style.background='#FAFAFA'; }}
                        onMouseLeave={e=>{ if(!sel) e.currentTarget.style.background=sel?'#F5F3FF':'#fff'; }}>
                        <div style={{ width:34, height:34, borderRadius:'50%', background:'#EDE9FE', color:'#7C3AED', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontFamily:"'Inter',sans-serif" }}>
                          {(c.name||'?')[0].toUpperCase()}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'#101828', fontFamily:"'Inter',sans-serif" }}>{c.name}</div>
                          {c.phone && <div style={{ fontSize:11, color:'#667085', fontFamily:"'Inter',sans-serif" }}>{c.phone}</div>}
                        </div>
                        {sel && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                    );
                  })}
                </div>
                {sellPkgSelCust && (
                  <div style={{ padding:'10px 14px', background:'linear-gradient(135deg,#7C3AED,#2563EB)', borderRadius:10, color:'#fff' }}>
                    <span style={{ fontSize:14, fontWeight:700, fontFamily:"'Inter',sans-serif" }}>{sellPkgSelCust.name}</span>
                    {sellPkgSelCust.phone && <span style={{ fontSize:12, opacity:0.8, marginLeft:8 }}>{sellPkgSelCust.phone}</span>}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Package */}
            {sellPkgStep === 2 && (
              <div>
                {sellPkgSelCust && (
                  <div style={{ background:'#F9FAFB', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#667085', marginBottom:14, fontFamily:"'Inter',sans-serif" }}>
                    Customer: <strong style={{ color:'#101828' }}>{sellPkgSelCust.name}</strong>
                  </div>
                )}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, maxHeight:300, overflowY:'auto' }}>
                  {sellPkgPackages.length === 0 ? (
                    <div style={{ gridColumn:'1/-1', textAlign:'center', padding:24, color:'#98A2B3', fontSize:13, fontFamily:"'Inter',sans-serif" }}>Loading packages…</div>
                  ) : sellPkgPackages.map(p => {
                    const sel = String(p.id) === String(sellPkgForm.package_id);
                    const accent = p.type === 'bundle' ? '#2563EB' : '#7C3AED';
                    return (
                      <div key={p.id} onClick={() => setSellPkgForm(f=>({...f, package_id:String(p.id)}))}
                        style={{ padding:'12px 14px', borderRadius:10, cursor:'pointer', transition:'all 0.15s', position:'relative',
                          border:sel?`2px solid ${accent}`:'1.5px solid #E4E7EC', borderTop:`3px solid ${accent}`,
                          background:sel?(p.type==='bundle'?'#EFF6FF':'#F5F3FF'):'#fff' }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'#101828', marginBottom:2, fontFamily:"'Inter',sans-serif" }}>{p.name}</div>
                        <div style={{ fontSize:11, color:'#667085', fontFamily:"'Inter',sans-serif" }}>{p.sessions_count} sessions · {p.validity_days} days</div>
                        <div style={{ fontSize:15, fontWeight:800, color:'#101828', marginTop:6, fontFamily:"'Inter',sans-serif" }}>Rs. {Number(p.package_price).toLocaleString()}</div>
                        {Number(p.discount_percent) > 0 && (
                          <span style={{ position:'absolute', top:8, right:8, fontSize:10, color:'#059669', fontWeight:700, background:'#D1FAE5', padding:'2px 7px', borderRadius:10, fontFamily:"'Inter',sans-serif" }}>{Math.round(p.discount_percent)}% OFF</span>
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
                  <div style={{ background:'#F9FAFB', borderRadius:10, padding:'10px 14px', fontSize:13, fontFamily:"'Inter',sans-serif" }}>
                    <span style={{ fontWeight:600, color:'#101828' }}>Customer: </span>
                    <span style={{ color:'#667085' }}>{sellPkgSelCust.name}</span>
                  </div>
                )}
                {sellPkgSelPkg && (
                  <div style={{ padding:14, background:'linear-gradient(135deg,#7C3AED 0%,#2563EB 100%)', borderRadius:12, color:'#fff' }}>
                    <div style={{ fontSize:11, opacity:0.75, marginBottom:4, letterSpacing:'0.06em', fontFamily:"'Inter',sans-serif" }}>PACKAGE</div>
                    <div style={{ fontSize:16, fontWeight:800, marginBottom:10, fontFamily:"'Inter',sans-serif" }}>{sellPkgSelPkg.name}</div>
                    <div style={{ display:'flex', gap:20 }}>
                      {[[sellPkgSelPkg.sessions_count,'Sessions'],[`${sellPkgSelPkg.validity_days}d`,'Validity'],[`Rs.${Number(sellPkgSelPkg.package_price).toLocaleString()}`,'Price']].map(([val,lbl]) => (
                        <div key={lbl} style={{ textAlign:'center' }}>
                          <div style={{ fontSize:14, fontWeight:800, fontFamily:"'Inter',sans-serif" }}>{val}</div>
                          <div style={{ fontSize:10, opacity:0.8, fontFamily:"'Inter',sans-serif" }}>{lbl}</div>
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
                        padding:'7px 16px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'Inter',sans-serif",
                        border:`1.5px solid ${sellPkgForm.payment_method===m?'#7C3AED':'#D0D5DD'}`,
                        background:sellPkgForm.payment_method===m?'#F5F3FF':'#fff',
                        color:sellPkgForm.payment_method===m?'#5B21B6':'#101828',
                      }}>{m}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#98A2B3', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Notes (optional)</div>
                  <input value={sellPkgForm.notes} onChange={e=>setSellPkgForm(f=>({...f,notes:e.target.value}))} placeholder="Any notes..."
                    style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', boxSizing:'border-box', color:'#101828' }}
                    onFocus={e=>e.target.style.borderColor='#7C3AED'} onBlur={e=>e.target.style.borderColor='#E4E7EC'} />
                </div>
              </div>
            )}

            {sellPkgError && <div style={{ marginTop:12, padding:'9px 13px', background:'#FEE2E2', borderRadius:8, color:'#DC2626', fontSize:13, border:'1px solid #FEE2E2', fontFamily:"'Inter',sans-serif" }}>{sellPkgError}</div>}

            <div style={{ display:'flex', justifyContent:'space-between', marginTop:20 }}>
              <Button variant="secondary" onClick={() => { if(sellPkgStep>1){setSellPkgStep(s=>s-1);setSellPkgError('');}else setShowSellPkg(false); }}>
                {sellPkgStep===1?'Cancel':'← Back'}
              </Button>
              {sellPkgStep < 3 ? (
                <Button variant="primary" style={{ background:'#7C3AED' }} onClick={() => {
                  if(sellPkgStep===1&&!sellPkgForm.customer_id){setSellPkgError('Please select a customer.');return;}
                  if(sellPkgStep===2&&!sellPkgForm.package_id){setSellPkgError('Please select a package.');return;}
                  setSellPkgError(''); setSellPkgStep(s=>s+1);
                }}>Next →</Button>
              ) : (
                <Button loading={sellPkgSaving} disabled={sellPkgSaving} style={{ background:'#7C3AED', border:'none' }} onClick={handleSellPkg}>
                  {sellPkgSaving?'Processing…':`Sell · Rs.${Number(sellPkgSelPkg?.package_price||0).toLocaleString()}`}
                </Button>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* Detail Drawer */}
      <Drawer open={showDetail} onClose={()=>setShowDetail(false)} title="Appointment Details"
        footer={canEdit&&detailItem&&(
          <div style={{ display:'flex', gap:8 }}>
            {detailItem.status!=='completed'&&detailItem.status!=='cancelled'&&<Button variant="primary" onClick={()=>{setShowDetail(false);openEdit(detailItem);}} style={{ display:'flex', alignItems:'center', gap:6 }}><IconEdit /> Edit</Button>}
            {detailItem.status!=='cancelled'&&<Button variant="primary" onClick={()=>{setShowDetail(false);openPayment(detailItem);}} style={{ display:'flex', alignItems:'center', gap:6, background:'#059669' }}><IconMoney /> Collect Payment</Button>}
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
            {[
              { icon:'', label:'Service', value:detailItem.service?.name||'' },
              { icon:'', label:'Staff',   value:detailItem.staff?.name||'' },
              { icon:'', label:'Date',    value:detailItem.date?new Date(detailItem.date).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}):'' },
              { icon:'', label:'Time',    value:detailItem.time||'' },
              { icon:'', label:'Branch',  value:detailItem.branch?.name||'' },
              { icon:'', label:'Amount',  value:`Rs. ${Number(detailItem.service?.price||detailItem.amount||0).toLocaleString()}`, highlight:true },
            ].map(({icon,label,value,highlight})=>(
              <div key={label} style={{ display:'flex', alignItems:'center', padding:'12px 0', borderBottom:'1px solid #F2F4F7' }}>
                <span style={{ fontSize:16, width:28, flexShrink:0 }}>{icon}</span>
                <span style={{ fontSize:12, fontWeight:600, color:'#98A2B3', textTransform:'uppercase', width:80, flexShrink:0 }}>{label}</span>
                <span style={{ fontSize:14, color:highlight?'#059669':'#101828', fontWeight:highlight?700:500 }}>{value}</span>
              </div>
            ))}
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
