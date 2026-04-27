import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

/* â”€â”€ Icons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const IconPlus    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconSearch  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IconBell    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>;
const IconCheck   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IconX       = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconTrash   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>;
const IconEye     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconClose   = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;

/* â”€â”€ Status config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const STATUS_META = {
  waiting:   { color: '#D97706', bg: '#FFFBEB', label: 'Waiting'   },
  notified:  { color: '#2563EB', bg: '#EFF6FF', label: 'Notified'  },
  booked:    { color: '#059669', bg: '#ECFDF5', label: 'Booked'    },
  cancelled: { color: '#DC2626', bg: '#FEF2F2', label: 'Cancelled' },
};
const STATUSES = ['waiting', 'notified', 'booked', 'cancelled'];

/* â”€â”€ Shared sub-components (identical to AppointmentsPage) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? STATUS_META.waiting;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, fontSize:12, fontWeight:600, background:m.bg, color:m.color, whiteSpace:'nowrap' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:m.color, flexShrink:0 }} />
      {m.label}
    </span>
  );
}

function StatCard({ label, value, color, icon, dark = false }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background:dark?'#111827':'#fff', borderRadius:16, padding:'18px 20px', border:`1px solid ${dark?'#334155':'#EAECF0'}`, flex:1, minWidth:130, display:'flex', alignItems:'center', gap:14, boxShadow:hov?(dark?'0 8px 20px rgba(2,6,23,0.50)':'0 8px 24px rgba(16,24,40,0.10)'):(dark?'0 8px 20px rgba(2,6,23,0.35)':'0 1px 4px rgba(16,24,40,0.04)'), transform:hov?'translateY(-2px)':'translateY(0)', transition:'all 0.2s ease', cursor:'default' }}>
      <div style={{ width:46, height:46, borderRadius:12, background:`linear-gradient(135deg, ${color}22 0%, ${color}10 100%)`, display:'flex', alignItems:'center', justifyContent:'center', color, flexShrink:0, border:`1.5px solid ${color}20` }}>{icon}</div>
      <div>
        <div style={{ fontSize:26, fontWeight:800, color:dark?'#E2E8F0':'#101828', lineHeight:1.1, letterSpacing:'-0.5px' }}>{value}</div>
        <div style={{ fontSize:11, color:dark?'#94A3B8':'#98A2B3', marginTop:3, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</div>
      </div>
    </div>
  );
}

function Modal({ open, onClose, title, children, footer, size = 'md', dark = false }) {
  useEffect(() => { if (!open) return; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, [open]);
  if (!open) return null;
  const widths = { sm:420, md:560, lg:720 };
  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:900, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(16,24,40,0.45)', backdropFilter:'blur(2px)' }} />
      <div style={{ position:'relative', width:'100%', maxWidth:widths[size]??560, background:dark?'#111827':'#fff', borderRadius:16, display:'flex', flexDirection:'column', boxShadow:dark?'0 20px 60px rgba(2,6,23,0.55)':'0 20px 60px rgba(16,24,40,0.18)', maxHeight:'90vh', animation:'modal-pop 0.18s ease', border:dark?'1px solid #334155':'none' }}>
        <style>{'@keyframes modal-pop { from { opacity:0; transform:scale(0.96) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }'}</style>
        <div style={{ padding:'16px 24px', borderBottom:`1px solid ${dark?'#1E293B':'#EAECF0'}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, background:dark?'#0F172A':'#fff', borderRadius:'16px 16px 0 0' }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:dark?'#F1F5F9':'#101828', fontFamily:"'Inter',sans-serif" }}>{title}</h3>
          <button onClick={onClose} style={{ background:dark?'rgba(255,255,255,0.08)':'#F2F4F7', border:`1px solid ${dark?'rgba(255,255,255,0.12)':'#E4E7EC'}`, cursor:'pointer', color:dark?'#CBD5E1':'#667085', display:'flex', alignItems:'center', borderRadius:8, padding:6 }}><IconClose /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>{children}</div>
        {footer && <div style={{ padding:'16px 24px', borderTop:`1px solid ${dark?'#334155':'#EAECF0'}`, display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0, background:dark?'#111827':'#FAFBFC' }}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

function Drawer({ open, onClose, title, children, dark = false }) {
  useEffect(() => { if (!open) return; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, [open]);
  if (!open) return null;
  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:900, display:'flex', justifyContent:'flex-end' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(16,24,40,0.4)', backdropFilter:'blur(2px)' }} />
      <div style={{ position:'relative', width:440, maxWidth:'95vw', background:dark?'#111827':'#fff', display:'flex', flexDirection:'column', boxShadow:dark?'-8px 0 40px rgba(2,6,23,0.55)':'-8px 0 40px rgba(16,24,40,0.15)', animation:'drawer-in 0.22s ease', borderLeft:dark?'1px solid #334155':'none' }}>
        <style>{'@keyframes drawer-in { from { transform:translateX(100%); } to { transform:translateX(0); } }'}</style>
        <div style={{ padding:'16px 24px', borderBottom:`1px solid ${dark?'#1E293B':'#EAECF0'}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, background:dark?'#0F172A':'#fff' }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:dark?'#F1F5F9':'#101828', fontFamily:"'Inter',sans-serif" }}>{title}</h3>
          <button onClick={onClose} style={{ background:dark?'rgba(255,255,255,0.08)':'#F2F4F7', border:`1px solid ${dark?'rgba(255,255,255,0.12)':'#E4E7EC'}`, cursor:'pointer', color:dark?'#CBD5E1':'#667085', display:'flex', alignItems:'center', borderRadius:8, padding:6 }}><IconClose /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>{children}</div>
      </div>
    </div>,
    document.body
  );
}

function ActionBtn({ onClick, title, color, children }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} title={title} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width:30, height:30, borderRadius:8, border:`1.5px solid ${color}30`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all 0.15s', background:hov?`${color}20`:`${color}10`, color, transform:hov?'scale(1.1)':'scale(1)' }}>
      {children}
    </button>
  );
}

function Fld({ label, children, dark }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:'block', fontSize:12, fontWeight:700, color:dark?'#94A3B8':'#667085', marginBottom:6, fontFamily:"'Inter',sans-serif" }}>{label}</label>
      {children}
    </div>
  );
}

const inp = (dark) => ({
  width:'100%', padding:'9px 12px', borderRadius:9, border:`1.5px solid ${dark?'#334155':'#E4E7EC'}`,
  fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', boxSizing:'border-box',
  color:dark?'#E2E8F0':'#101828', background:dark?'#0F172A':'#FAFAFA',
});

/* â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export default function WaitlistPage() {
  const { user }     = useAuth();
  const { isDark }   = useTheme();
  const { addToast } = useToast();
  const isSuperAdmin = user?.role === 'superadmin';
  const canManage    = ['superadmin','admin','manager','staff'].includes(user?.role);

  const [entries, setEntries]       = useState([]);
  const [allEntries, setAllEntries] = useState([]);
  const [services, setServices]     = useState([]);
  const [staff, setStaff]           = useState([]);
  const [branches, setBranches]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterStatus, setFilterStatus]   = useState('');
  const [filterBranch, setFilterBranch]   = useState(user?.branch_id || '');
  const [sortKey, setSortKey]   = useState('createdAt');
  const [sortDir, setSortDir]   = useState('desc');
  const [showForm, setShowForm]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [deleteId, setDeleteId]     = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [form, setForm] = useState({
    customer_name: '', phone: '', service_id: '', staff_id: '',
    preferred_date: '', preferred_time: '', notes: '',
    branch_id: user?.branch_id || '',
  });

  /* â”€â”€ Data loading â”€â”€ */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        ...(filterStatus ? { status: filterStatus } : {}),
        ...(filterBranch ? { branchId: filterBranch } : {}),
      };
      const r = await api.get('/waitlist', { params });
      setEntries(Array.isArray(r.data) ? r.data : []);
    } catch { setEntries([]); }
    setLoading(false);
  }, [filterStatus, filterBranch]);

  const loadAll = useCallback(async () => {
    try {
      const params = filterBranch ? { branchId: filterBranch } : {};
      const r = await api.get('/waitlist', { params });
      setAllEntries(Array.isArray(r.data) ? r.data : []);
    } catch { setAllEntries([]); }
  }, [filterBranch]);

  useEffect(() => { load(); loadAll(); }, [load, loadAll]);

  useEffect(() => {
    api.get('/branches').then((r) => {
      const d = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
      setBranches(d);
    }).catch(() => {});
    api.get('/services').then((r) => setServices(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))).catch(() => {});
    api.get('/staff').then((r) => setStaff(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))).catch(() => {});
  }, []);

  /* â”€â”€ Actions â”€â”€ */
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.customer_name.trim()) return addToast('Customer name required', 'error');
    setSaving(true);
    try {
      await api.post('/waitlist', form);
      addToast('Added to waitlist', 'success');
      setShowForm(false);
      setForm({ customer_name:'', phone:'', service_id:'', staff_id:'', preferred_date:'', preferred_time:'', notes:'', branch_id: user?.branch_id || '' });
      load(); loadAll();
    } catch (err) { addToast(err.response?.data?.message || 'Error adding entry', 'error'); }
    setSaving(false);
  };

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/waitlist/${id}/status`, { status });
      addToast(`Marked as ${STATUS_META[status]?.label || status}`, 'success');
      load(); loadAll();
    } catch { addToast('Failed to update status', 'error'); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/waitlist/${deleteId}`);
      addToast('Entry removed', 'success');
      setDeleteId(null);
      load(); loadAll();
    } catch { addToast('Failed to remove', 'error'); }
  };

  /* â”€â”€ Derived â”€â”€ */
  const counts = STATUSES.reduce((acc, s) => { acc[s] = allEntries.filter(e => e.status === s).length; return acc; }, {});

  const handleSort = (key) => { if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('asc'); } };
  const SortIco = ({ col }) => sortKey !== col
    ? <span style={{ opacity:0.3, fontSize:10, marginLeft:4 }}>â‡…</span>
    : <span style={{ fontSize:10, marginLeft:4, color:isDark?'#93C5FD':'#2563EB' }}>{sortDir==='asc'?'â†‘':'â†“'}</span>;
  const Th = ({ children, col, align = 'left' }) => (
    <th onClick={col ? () => handleSort(col) : undefined}
      style={{ padding:'12px 16px', textAlign:align, fontSize:11, fontWeight:700, color:isDark?'#94A3B8':'#667085', textTransform:'uppercase', letterSpacing:'0.06em', background:isDark?'#1E293B':'linear-gradient(180deg,#F8F9FC 0%,#F1F3F9 100%)', borderBottom:`1.5px solid ${isDark?'#334155':'#E4E7EC'}`, whiteSpace:'nowrap', cursor:col?'pointer':'default', userSelect:'none' }}>
      {children}{col && <SortIco col={col} />}
    </th>
  );

  const displayed = entries
    .filter(e => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (e.customer_name||'').toLowerCase().includes(q)
        || (e.phone||'').toLowerCase().includes(q)
        || (e.service?.name||'').toLowerCase().includes(q)
        || (e.staff?.name||'').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  return (
    <PageWrapper title="Smart Waitlist" subtitle={`${allEntries.length} total entries`}
      actions={canManage && (
        <Button variant="primary" onClick={() => setShowForm(true)} style={{ display:'flex', alignItems:'center', gap:6 }}>
          <IconPlus /> Add to Waitlist
        </Button>
      )}>

      {/* â”€â”€ Stat Cards â”€â”€ */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        <StatCard label="Waiting"  value={counts.waiting||0}  color="#D97706" dark={isDark}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} />
        <StatCard label="Notified" value={counts.notified||0} color="#2563EB" dark={isDark}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>} />
        <StatCard label="Booked"   value={counts.booked||0}   color="#059669" dark={isDark}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>} />
        <StatCard label="Cancelled" value={counts.cancelled||0} color="#DC2626" dark={isDark}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>} />
      </div>

      {/* â”€â”€ Filter Bar â”€â”€ */}
      <div style={{ background:isDark?'#111827':'#fff', borderRadius:14, border:`1px solid ${isDark?'#334155':'#EAECF0'}`, padding:'14px 16px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', boxShadow:isDark?'0 8px 20px rgba(2,6,23,0.35)':'0 1px 4px rgba(16,24,40,0.04)' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:isDark?'#94A3B8':'#98A2B3', pointerEvents:'none', display:'flex' }}><IconSearch /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, service, staffâ€¦"
            style={{ width:'100%', padding:'8px 12px 8px 34px', borderRadius:9, border:`1.5px solid ${isDark?'#334155':'#E4E7EC'}`, fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', boxSizing:'border-box', color:isDark?'#E2E8F0':'#101828', background:isDark?'#0F172A':'#FAFAFA' }}
            onFocus={e=>e.target.style.borderColor='#2563EB'} onBlur={e=>e.target.style.borderColor=isDark?'#334155':'#E4E7EC'} />
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {[{val:'',label:'All'},...STATUSES.map(s=>({val:s,label:STATUS_META[s].label}))].map(({val,label}) => {
            const active = filterStatus === val;
            const meta = val ? STATUS_META[val] : null;
            const cnt = val ? counts[val] : allEntries.length;
            return (
              <button key={val} onClick={() => setFilterStatus(val)}
                style={{ padding:'6px 14px', borderRadius:20, border:'1.5px solid', borderColor:active?(meta?.color??'#2563EB'):(isDark?'#334155':'#E4E7EC'), background:active?(meta?.bg??'#EFF6FF'):(isDark?'#0F172A':'#fff'), color:active?(meta?.color??'#2563EB'):(isDark?'#CBD5E1':'#667085'), fontWeight:active?700:500, fontSize:12, cursor:'pointer', fontFamily:"'Inter',sans-serif", whiteSpace:'nowrap' }}>
                {label}{cnt > 0 ? <span style={{ marginLeft:5, opacity:0.7 }}>({cnt})</span> : ''}
              </button>
            );
          })}
        </div>
        {(isSuperAdmin || branches.length > 1) && (
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
            style={{ padding:'7px 12px', borderRadius:9, border:`1.5px solid ${isDark?'#334155':'#E4E7EC'}`, fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:isDark?'#E2E8F0':'#344054', background:isDark?'#0F172A':'#fff' }}>
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {/* â”€â”€ Table â”€â”€ */}
      <div style={{ background:isDark?'#111827':'#fff', borderRadius:14, border:`1px solid ${isDark?'#334155':'#EAECF0'}`, overflow:'hidden', boxShadow:isDark?'0 8px 20px rgba(2,6,23,0.35)':'0 1px 4px rgba(16,24,40,0.04)' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:"'Inter',sans-serif", tableLayout:'fixed' }}>
            <colgroup>
              <col style={{ width:'22%' }} /><col style={{ width:'16%' }} /><col style={{ width:'14%' }} />
              <col style={{ width:'18%' }} /><col style={{ width:'14%' }} /><col style={{ width:'16%' }} />
            </colgroup>
            <thead>
              <tr>
                <Th col="customer_name">Customer</Th>
                <Th>Service</Th>
                <Th>Staff</Th>
                <Th col="preferred_date">Preference</Th>
                <Th col="status">Status</Th>
                <Th align="center">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length:5 }).map((_,i) => (
                <tr key={i}>{Array.from({ length:6 }).map((_,j) => (
                  <td key={j} style={{ padding:'14px 16px' }}>
                    <div style={{ height:13, borderRadius:6, width:`${50+(j*13)%40}%`, background:isDark?'linear-gradient(90deg,#1E293B 25%,#334155 50%,#1E293B 75%)':'linear-gradient(90deg,#F2F4F7 25%,#E8EAED 50%,#F2F4F7 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s infinite' }} />
                  </td>
                ))}</tr>
              )) : displayed.length === 0 ? (
                <tr><td colSpan={6} style={{ padding:'52px 16px', textAlign:'center' }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>â³</div>
                  <div style={{ color:isDark?'#E2E8F0':'#344054', fontWeight:600, fontSize:15 }}>No waitlist entries found</div>
                  <div style={{ color:isDark?'#94A3B8':'#98A2B3', fontSize:13, marginTop:4 }}>Try adjusting filters or add a customer</div>
                </td></tr>
              ) : displayed.map((row, idx) => {
                const s = row.status;
                const meta = STATUS_META[s] ?? STATUS_META.waiting;
                const rowBg = isDark
                  ? (idx % 2 === 0 ? '#0F172A' : '#111827')
                  : (idx % 2 === 0 ? '#fff' : '#FAFBFC');
                return (
                  <tr key={row.id} style={{ borderBottom:`1px solid ${isDark?'#334155':'#F2F4F7'}`, background:rowBg, transition:'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = isDark?'#1E293B':'#EEF4FF'}
                    onMouseLeave={e => e.currentTarget.style.background = rowBg}>

                    {/* Customer */}
                    <td style={{ padding:'13px 16px' }}>
                      <div style={{ fontWeight:600, color:isDark?'#E2E8F0':'#101828', fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.customer_name}</div>
                      {row.phone && <div style={{ fontSize:12, color:isDark?'#94A3B8':'#98A2B3', marginTop:1 }}>{row.phone}</div>}
                    </td>

                    {/* Service */}
                    <td style={{ padding:'13px 16px' }}>
                      {row.service
                        ? <span style={{ background:isDark?'#1E293B':'#F2F4F7', padding:'3px 9px', borderRadius:6, fontSize:13, fontWeight:500, color:isDark?'#CBD5E1':'#475467' }}>{row.service.name}</span>
                        : <span style={{ fontSize:13, color:isDark?'#64748B':'#D0D5DD' }}>Any</span>
                      }
                    </td>

                    {/* Staff */}
                    <td style={{ padding:'13px 16px' }}>
                      {row.staff
                        ? <span style={{ fontSize:13, fontWeight:500, color:isDark?'#CBD5E1':'#344054' }}>{row.staff.name}</span>
                        : <span style={{ fontSize:13, color:isDark?'#64748B':'#D0D5DD' }}>Any</span>
                      }
                    </td>

                    {/* Preference */}
                    <td style={{ padding:'13px 16px' }}>
                      {row.preferred_date
                        ? <div style={{ fontWeight:600, color:isDark?'#E2E8F0':'#101828', fontSize:13 }}>{row.preferred_date}</div>
                        : null}
                      {row.preferred_time
                        ? <div style={{ fontSize:12, color:isDark?'#94A3B8':'#98A2B3', marginTop:1 }}>{row.preferred_time}</div>
                        : null}
                      {!row.preferred_date && !row.preferred_time && <span style={{ fontSize:13, color:isDark?'#64748B':'#D0D5DD' }}>â€”</span>}
                    </td>

                    {/* Status */}
                    <td style={{ padding:'13px 16px' }}>
                      {canManage && s !== 'booked' && s !== 'cancelled' ? (
                        <select value={s} onChange={ev => updateStatus(row.id, ev.target.value)}
                          style={{ padding:'4px 10px', borderRadius:20, border:`1.5px solid ${meta.color}40`, background:meta.bg, color:meta.color, fontWeight:700, fontSize:12, fontFamily:"'Inter',sans-serif", outline:'none', cursor:'pointer' }}>
                          {STATUSES.filter(st => st !== 'booked').map(st => <option key={st} value={st}>{STATUS_META[st].label}</option>)}
                        </select>
                      ) : <StatusBadge status={s} />}
                    </td>

                    {/* Actions */}
                    <td style={{ padding:'13px 16px', textAlign:'center' }}>
                      <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                        <ActionBtn onClick={() => setDetailItem(row)} title="View" color="#2563EB"><IconEye /></ActionBtn>
                        {canManage && s === 'waiting' && (
                          <ActionBtn onClick={() => updateStatus(row.id, 'notified')} title="Notify" color="#2563EB"><IconBell /></ActionBtn>
                        )}
                        {canManage && (s === 'waiting' || s === 'notified') && (
                          <ActionBtn onClick={() => updateStatus(row.id, 'booked')} title="Mark Booked" color="#059669"><IconCheck /></ActionBtn>
                        )}
                        {canManage && s !== 'cancelled' && s !== 'booked' && (
                          <ActionBtn onClick={() => updateStatus(row.id, 'cancelled')} title="Cancel" color="#DC2626"><IconX /></ActionBtn>
                        )}
                        {canManage && (
                          <ActionBtn onClick={() => setDeleteId(row.id)} title="Delete" color="#DC2626"><IconTrash /></ActionBtn>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <style>{'@keyframes shimmer { to { background-position:-200% 0; } }'}</style>
        </div>
        <div style={{ padding:'10px 16px', borderTop:`1px solid ${isDark?'#334155':'#F2F4F7'}`, fontSize:12, color:isDark?'#94A3B8':'#98A2B3' }}>
          Showing {displayed.length} of {allEntries.length} entries
        </div>
      </div>

      {/* â”€â”€ Add Modal â”€â”€ */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add to Waitlist" size="md" dark={isDark}
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleAdd}>{saving ? 'Savingâ€¦' : 'Add to Waitlist'}</Button></>}>
        <form onSubmit={handleAdd} style={{ display:'flex', flexDirection:'column', gap:0 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Fld label="Customer Name *" dark={isDark}>
              <input style={inp(isDark)} value={form.customer_name} onChange={e => setForm(p=>({...p,customer_name:e.target.value}))} required placeholder="Full name"
                onFocus={e=>e.target.style.borderColor='#2563EB'} onBlur={e=>e.target.style.borderColor=isDark?'#334155':'#E4E7EC'} />
            </Fld>
            <Fld label="Phone" dark={isDark}>
              <input style={inp(isDark)} value={form.phone} onChange={e => setForm(p=>({...p,phone:e.target.value}))} placeholder="07X XXX XXXX"
                onFocus={e=>e.target.style.borderColor='#2563EB'} onBlur={e=>e.target.style.borderColor=isDark?'#334155':'#E4E7EC'} />
            </Fld>
            <Fld label="Service" dark={isDark}>
              <select style={inp(isDark)} value={form.service_id} onChange={e => setForm(p=>({...p,service_id:e.target.value}))}>
                <option value="">Any service</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Fld>
            <Fld label="Branch" dark={isDark}>
              <select style={inp(isDark)} value={form.branch_id} onChange={e => setForm(p=>({...p,branch_id:e.target.value,staff_id:''}))} required>
                <option value="">Select branch</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Fld>
            <Fld label="Preferred Staff" dark={isDark}>
              <select style={inp(isDark)} value={form.staff_id} onChange={e => setForm(p=>({...p,staff_id:e.target.value}))}>
                <option value="">Any staff</option>
                {staff.filter(s => !form.branch_id || Number(s.branch_id) === Number(form.branch_id))
                  .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Fld>
            <Fld label="Preferred Date" dark={isDark}>
              <input type="date" style={inp(isDark)} value={form.preferred_date} onChange={e => setForm(p=>({...p,preferred_date:e.target.value}))}
                onFocus={e=>e.target.style.borderColor='#2563EB'} onBlur={e=>e.target.style.borderColor=isDark?'#334155':'#E4E7EC'} />
            </Fld>
            <Fld label="Preferred Time" dark={isDark}>
              <input type="time" style={inp(isDark)} value={form.preferred_time} onChange={e => setForm(p=>({...p,preferred_time:e.target.value}))}
                onFocus={e=>e.target.style.borderColor='#2563EB'} onBlur={e=>e.target.style.borderColor=isDark?'#334155':'#E4E7EC'} />
            </Fld>
            <Fld label="Notes" dark={isDark} style={{ gridColumn:'1/-1' }}>
              <textarea style={{ ...inp(isDark), height:64, resize:'vertical' }} value={form.notes} onChange={e => setForm(p=>({...p,notes:e.target.value}))} placeholder="Special requestsâ€¦" />
            </Fld>
          </div>
        </form>
      </Modal>

      {/* â”€â”€ Delete Confirm Modal â”€â”€ */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Remove Entry" size="sm" dark={isDark}
        footer={<><Button variant="secondary" onClick={() => setDeleteId(null)}>No, Keep</Button><Button variant="danger" onClick={handleDelete} style={{ background:'#DC2626', color:'#fff' }}>Yes, Remove</Button></>}>
        <div style={{ textAlign:'center', padding:'12px 0' }}>
          <div style={{ width:56, height:56, borderRadius:'50%', background:'#FEF2F2', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </div>
          <div style={{ fontSize:15, fontWeight:600, color:isDark?'#E2E8F0':'#101828', marginBottom:6 }}>Remove this entry?</div>
          <div style={{ fontSize:13, color:isDark?'#94A3B8':'#667085' }}>This waitlist entry will be permanently deleted.</div>
        </div>
      </Modal>

      {/* â”€â”€ Detail Drawer â”€â”€ */}
      <Drawer open={!!detailItem} onClose={() => setDetailItem(null)} title="Waitlist Details" dark={isDark}>
        {detailItem && (
          <div style={{ fontFamily:"'Inter',sans-serif" }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, padding:16, background:isDark?'#1E293B':'#F9FAFB', borderRadius:12, border:isDark?'1px solid #334155':'none' }}>
              <div>
                <div style={{ fontSize:18, fontWeight:700, color:isDark?'#E2E8F0':'#101828' }}>{detailItem.customer_name}</div>
                {detailItem.phone && <div style={{ fontSize:13, color:isDark?'#94A3B8':'#667085', marginTop:2 }}>{detailItem.phone}</div>}
              </div>
              <StatusBadge status={detailItem.status} />
            </div>
            {[
              { label:'Service',   value: detailItem.service?.name || 'Any' },
              { label:'Staff',     value: detailItem.staff?.name   || 'Any' },
              { label:'Pref. Date',value: detailItem.preferred_date || 'â€”' },
              { label:'Pref. Time',value: detailItem.preferred_time || 'â€”' },
              { label:'Added',     value: detailItem.createdAt ? new Date(detailItem.createdAt).toLocaleString() : 'â€”' },
              { label:'Notified',  value: detailItem.notified_at ? new Date(detailItem.notified_at).toLocaleString() : 'â€”' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display:'flex', alignItems:'center', padding:'12px 0', borderBottom:`1px solid ${isDark?'#334155':'#F2F4F7'}` }}>
                <span style={{ fontSize:12, fontWeight:600, color:isDark?'#94A3B8':'#98A2B3', textTransform:'uppercase', width:100, flexShrink:0 }}>{label}</span>
                <span style={{ fontSize:14, color:isDark?'#E2E8F0':'#101828', fontWeight:500 }}>{value}</span>
              </div>
            ))}
            {detailItem.notes && (
              <div style={{ marginTop:20, padding:'14px 16px', background:isDark?'#422006':'#FFFBEB', borderRadius:10, border:`1px solid ${isDark?'#92400E':'#FDE68A'}` }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#D97706', textTransform:'uppercase', marginBottom:6 }}>ðŸ“ Notes</div>
                <div style={{ fontSize:13, color:isDark?'#FDE68A':'#475467', lineHeight:1.6 }}>{detailItem.notes}</div>
              </div>
            )}
            {canManage && detailItem.status !== 'booked' && detailItem.status !== 'cancelled' && (
              <div style={{ marginTop:24, display:'flex', gap:8, flexWrap:'wrap' }}>
                {detailItem.status === 'waiting' && (
                  <button onClick={() => { updateStatus(detailItem.id, 'notified'); setDetailItem(null); }}
                    style={{ flex:1, padding:'10px 0', borderRadius:10, border:'1.5px solid #BFDBFE', background:'#EFF6FF', color:'#1D4ED8', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                    <IconBell /> Notify Customer
                  </button>
                )}
                <button onClick={() => { updateStatus(detailItem.id, 'booked'); setDetailItem(null); }}
                  style={{ flex:1, padding:'10px 0', borderRadius:10, border:'1.5px solid #A7F3D0', background:'#ECFDF5', color:'#065F46', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <IconCheck /> Mark as Booked
                </button>
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
