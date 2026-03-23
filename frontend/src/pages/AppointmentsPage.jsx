import { useState, useEffect, useCallback } from 'react';
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

const APPT_STATUSES = ['pending','confirmed','in_service','completed','cancelled','no_show'];
const STATUS_META = {
  pending:    { color:'#D97706', bg:'#FFFBEB', label:'Pending'    },
  confirmed:  { color:'#2563EB', bg:'#EFF6FF', label:'Confirmed'  },
  in_service: { color:'#7C3AED', bg:'#F5F3FF', label:'In Service' },
  completed:  { color:'#059669', bg:'#ECFDF5', label:'Completed'  },
  cancelled:  { color:'#DC2626', bg:'#FEF2F2', label:'Cancelled'  },
  no_show:    { color:'#64748B', bg:'#F8FAFC', label:'No Show'    },
};
const EMPTY = { branch_id:'', customer_name:'', phone:'', service_id:'', staff_id:'', date:'', time:'', amount:'', notes:'', status:'pending' };
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
        <span style={{ background:'#F2F4F7', padding:'3px 9px', borderRadius:6, fontSize:13, fontWeight:500, color:'#475467' }}>{row.service?.name||''}</span>
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

  const openAdd    = () => { setEditItem(null); setForm({...EMPTY, branch_id:user?.branch_id||'', date:today}); setFormErr(''); setShowForm(true); };
  const openEdit   = row => { setEditItem(row); setForm({...row, service_id:row.service?.id||row.service_id, staff_id:row.staff?.id||row.staff_id, date:row.date?.slice(0,10)||''}); setFormErr(''); setShowForm(true); };
  const openDetail = row => { setDetailItem(row); setShowDetail(true); };

  const handleSave = async () => {
    if (!form.customer_name||!form.service_id||!form.date||!form.time) return setFormErr('Customer, service, date and time are required');
    setSaving(true);
    try {
      editItem ? await api.put(`/appointments/${editItem.id}`, form) : await api.post('/appointments', form);
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
      <Modal open={showForm} onClose={()=>setShowForm(false)} title={editItem?'Edit Appointment':'New Appointment'} size="md"
        footer={<><Button variant="secondary" onClick={()=>setShowForm(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSave}>{editItem?'Save Changes':'Create Appointment'}</Button></>}>
        {formErr && <div style={{ background:'#FEF2F2', color:'#DC2626', padding:'9px 13px', borderRadius:9, marginBottom:16, fontSize:13, border:'1px solid #FEE2E2' }}> {formErr}</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FormGroup label="Customer Name" required><Input value={form.customer_name||''} onChange={e=>setForm(f=>({...f,customer_name:e.target.value}))} placeholder="Full name" /></FormGroup>
            <FormGroup label="Phone"><Input value={form.phone||''} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="0300-0000000" /></FormGroup>
          </div>
          {isSuperAdmin && <FormGroup label="Branch"><Select value={form.branch_id||''} onChange={e=>setForm(f=>({...f,branch_id:e.target.value,staff_id:''}))}>
            <option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </Select></FormGroup>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FormGroup label="Service" required><Select value={form.service_id||''} onChange={e=>{const sid=e.target.value; const svc=services.find(x=>Number(x.id)===Number(sid)); setForm(f=>({...f,service_id:sid,amount:svc?Number(svc.price):f.amount}));}}>
              <option value="">Select service</option>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </Select></FormGroup>
            <FormGroup label="Staff"><Select value={form.staff_id||''} onChange={e=>setForm(f=>({...f,staff_id:e.target.value}))}>
              <option value="">Any available</option>{filteredStaff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </Select></FormGroup>
          </div>
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
