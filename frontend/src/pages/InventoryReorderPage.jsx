import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

/* ── Icons ──────────────────────────────────────────────────────────────── */
const IconPlus   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconSearch = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IconClose  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconRefresh= () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
const IconZap    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const IconEye    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;

/* ── Status config ──────────────────────────────────────────────────────── */
const STATUS_META = {
  draft:     { color: '#6B7280', bg: '#F9FAFB', label: 'Draft'     },
  ordered:   { color: '#2563EB', bg: '#EFF6FF', label: 'Ordered'   },
  partial:   { color: '#D97706', bg: '#FFFBEB', label: 'Partial'   },
  received:  { color: '#059669', bg: '#ECFDF5', label: 'Received'  },
  cancelled: { color: '#DC2626', bg: '#FEF2F2', label: 'Cancelled' },
};
const STATUSES = ['draft', 'ordered', 'partial', 'received', 'cancelled'];

/* ── Sub-components ─────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? STATUS_META.draft;
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
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background:dark?'#111827':'#fff', borderRadius:16, padding:'18px 20px', border:`1px solid ${dark?'#334155':'#EAECF0'}`, flex:1, minWidth:130, display:'flex', alignItems:'center', gap:14, boxShadow:hov?(dark?'0 8px 20px rgba(2,6,23,0.50)':'0 8px 24px rgba(16,24,40,0.10)'):(dark?'0 8px 20px rgba(2,6,23,0.35)':'0 1px 4px rgba(16,24,40,0.04)'), transform:hov?'translateY(-2px)':'translateY(0)', transition:'all 0.2s ease', cursor:'default' }}>
      <div style={{ width:46, height:46, borderRadius:12, background:`linear-gradient(135deg,${color}22 0%,${color}10 100%)`, display:'flex', alignItems:'center', justifyContent:'center', color, flexShrink:0, border:`1.5px solid ${color}20` }}>{icon}</div>
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
  const widths = { sm:420, md:580, lg:720 };
  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:900, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(16,24,40,0.45)', backdropFilter:'blur(2px)' }} />
      <div style={{ position:'relative', width:'100%', maxWidth:widths[size]??580, background:dark?'#111827':'#fff', borderRadius:16, display:'flex', flexDirection:'column', boxShadow:dark?'0 20px 60px rgba(2,6,23,0.55)':'0 20px 60px rgba(16,24,40,0.18)', maxHeight:'90vh', animation:'modal-pop 0.18s ease', border:dark?'1px solid #334155':'none' }}>
        <style>{'@keyframes modal-pop{from{opacity:0;transform:scale(0.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}'}</style>
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
        <style>{'@keyframes drawer-in{from{transform:translateX(100%)}to{transform:translateX(0)}}'}</style>
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
const inp = (dark) => ({ width:'100%', padding:'9px 12px', borderRadius:9, border:`1.5px solid ${dark?'#334155':'#E4E7EC'}`, fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', boxSizing:'border-box', color:dark?'#E2E8F0':'#101828', background:dark?'#0F172A':'#FAFAFA' });
const onFoc = e => e.target.style.borderColor='#2563EB';
const onBlr = (dark) => e => e.target.style.borderColor = dark?'#334155':'#E4E7EC';

export default function InventoryReorderPage() {
  const { addToast }   = useToast();
  const { isDark }     = useTheme();
  const { user }       = useAuth();
  const canManage      = ['superadmin','admin','manager'].includes(user?.role);

  const [tab, setTab]           = useState('alerts');
  const [loading, setLoading]   = useState(true);
  const [lowStock, setLowStock] = useState([]);
  const [reorders, setReorders] = useState([]);
  const [search, setSearch]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortKey, setSortKey]   = useState('createdAt');
  const [sortDir, setSortDir]   = useState('desc');
  const [saving, setSaving]     = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [detailItem, setDetailItem] = useState(null);

  const EMPTY_FORM = { inventory_id:'', quantity_requested:'', supplier_name:'', supplier_contact:'', unit_cost:'', notes:'' };
  const [form, setForm] = useState(EMPTY_FORM);

  /* ── Data ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lowRes, rRes] = await Promise.all([
        api.get('/inventory/low-stock'),
        api.get('/inventory/reorders'),
      ]);
      setLowStock(Array.isArray(lowRes.data) ? lowRes.data : (lowRes.data?.data ?? []));
      setReorders(Array.isArray(rRes.data) ? rRes.data : []);
    } catch { addToast('Failed to load data', 'error'); }
    setLoading(false);
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  /* ── Actions ── */
  const createReorder = async (e) => {
    e.preventDefault();
    if (!form.inventory_id) return addToast('Select an inventory item', 'error');
    setSaving(true);
    try {
      await api.post('/inventory/reorders', { ...form, quantity_requested: Number(form.quantity_requested||0), unit_cost: form.unit_cost ? Number(form.unit_cost) : null });
      addToast('Reorder created', 'success');
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
      setTab('reorders');
    } catch (err) { addToast(err.response?.data?.message || 'Failed to create reorder', 'error'); }
    setSaving(false);
  };

  const quickCreate = (item) => {
    const qty = Number(item.reorder_qty || item.min_quantity || 0) || Math.max(10, Number(item.min_quantity || 0));
    setForm({ inventory_id: String(item.id), quantity_requested: String(qty), supplier_name: item.supplier_name||'', supplier_contact: item.supplier_contact||'', unit_cost:'', notes:`Auto-suggested reorder for: ${item.product_name}` });
    setShowForm(true);
  };

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/inventory/reorders/${id}`, { status });
      addToast(`Marked as ${STATUS_META[status]?.label || status}`, 'success');
      load();
    } catch (err) { addToast(err.response?.data?.message || 'Failed to update', 'error'); }
  };

  /* ── Derived ── */
  const counts = STATUSES.reduce((acc, s) => { acc[s] = reorders.filter(r => r.status === s).length; return acc; }, {});

  const handleSort = (key) => { if (sortKey===key) setSortDir(d=>d==='asc'?'desc':'asc'); else { setSortKey(key); setSortDir('asc'); } };
  const SortIco = ({ col }) => sortKey!==col
    ? <span style={{ opacity:0.3, fontSize:10, marginLeft:4 }}>⇅</span>
    : <span style={{ fontSize:10, marginLeft:4, color:isDark?'#93C5FD':'#2563EB' }}>{sortDir==='asc'?'↑':'↓'}</span>;
  const Th = ({ children, col, align='left' }) => (
    <th onClick={col?()=>handleSort(col):undefined} style={{ padding:'12px 16px', textAlign:align, fontSize:11, fontWeight:700, color:isDark?'#94A3B8':'#667085', textTransform:'uppercase', letterSpacing:'0.06em', background:isDark?'#1E293B':'linear-gradient(180deg,#F8F9FC 0%,#F1F3F9 100%)', borderBottom:`1.5px solid ${isDark?'#334155':'#E4E7EC'}`, whiteSpace:'nowrap', cursor:col?'pointer':'default', userSelect:'none' }}>
      {children}{col&&<SortIco col={col} />}
    </th>
  );

  const displayedReorders = reorders
    .filter(r => {
      if (filterStatus && r.status !== filterStatus) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      const name = r.item?.product_name || r.inventory?.product_name || '';
      return name.toLowerCase().includes(q) || (r.supplier_name||'').toLowerCase().includes(q);
    })
    .sort((a,b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (av<bv) return sortDir==='asc'?-1:1;
      if (av>bv) return sortDir==='asc'?1:-1;
      return 0;
    });

  const displayedLow = lowStock.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (i.product_name||'').toLowerCase().includes(q) || (i.supplier_name||'').toLowerCase().includes(q);
  });

  return (
    <PageWrapper title="Inventory Reorders" subtitle="Track low stock and manage reorder lifecycle"
      actions={canManage && (
        <Button variant="primary" onClick={() => { setShowForm(true); setTab('reorders'); }} style={{ display:'flex', alignItems:'center', gap:6 }}>
          <IconPlus /> New Reorder
        </Button>
      )}>

      {/* ── Stat Cards ── */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        <StatCard label="Low Stock" value={lowStock.length} color="#DC2626" dark={isDark}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
        <StatCard label="Draft" value={counts.draft||0} color="#6B7280" dark={isDark}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>} />
        <StatCard label="Ordered" value={counts.ordered||0} color="#2563EB" dark={isDark}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>} />
        <StatCard label="Received" value={counts.received||0} color="#059669" dark={isDark}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>} />
      </div>

      {/* ── Tab + Filter Bar ── */}
      <div style={{ background:isDark?'#111827':'#fff', borderRadius:14, border:`1px solid ${isDark?'#334155':'#EAECF0'}`, padding:'14px 16px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', boxShadow:isDark?'0 8px 20px rgba(2,6,23,0.35)':'0 1px 4px rgba(16,24,40,0.04)' }}>
        {/* Search */}
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:isDark?'#94A3B8':'#98A2B3', pointerEvents:'none', display:'flex' }}><IconSearch /></span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search item, supplier…"
            style={{ width:'100%', padding:'8px 12px 8px 34px', borderRadius:9, border:`1.5px solid ${isDark?'#334155':'#E4E7EC'}`, fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', boxSizing:'border-box', color:isDark?'#E2E8F0':'#101828', background:isDark?'#0F172A':'#FAFAFA' }}
            onFocus={onFoc} onBlur={onBlr(isDark)} />
        </div>
        {/* Tab pills */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {[{val:'alerts',label:'⚠ Low Stock',cnt:lowStock.length},{val:'reorders',label:'📦 Reorders',cnt:reorders.length}].map(({val,label,cnt}) => {
            const active = tab===val;
            return (
              <button key={val} onClick={()=>setTab(val)}
                style={{ padding:'6px 14px', borderRadius:20, border:'1.5px solid', borderColor:active?'#2563EB':(isDark?'#334155':'#E4E7EC'), background:active?'#EFF6FF':(isDark?'#0F172A':'#fff'), color:active?'#2563EB':(isDark?'#CBD5E1':'#667085'), fontWeight:active?700:500, fontSize:12, cursor:'pointer', fontFamily:"'Inter',sans-serif", whiteSpace:'nowrap' }}>
                {label}{cnt>0?<span style={{ marginLeft:5, opacity:0.7 }}>({cnt})</span>:''}
              </button>
            );
          })}
        </div>
        {/* Status filter (reorders only) */}
        {tab==='reorders' && (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {[{val:'',label:'All'},...STATUSES.map(s=>({val:s,label:STATUS_META[s].label}))].map(({val,label}) => {
              const active = filterStatus===val;
              const m = val?STATUS_META[val]:null;
              const cnt = val?counts[val]:reorders.length;
              return (
                <button key={val} onClick={()=>setFilterStatus(val)}
                  style={{ padding:'6px 14px', borderRadius:20, border:'1.5px solid', borderColor:active?(m?.color??'#2563EB'):(isDark?'#334155':'#E4E7EC'), background:active?(m?.bg??'#EFF6FF'):(isDark?'#0F172A':'#fff'), color:active?(m?.color??'#2563EB'):(isDark?'#CBD5E1':'#667085'), fontWeight:active?700:500, fontSize:12, cursor:'pointer', fontFamily:"'Inter',sans-serif", whiteSpace:'nowrap' }}>
                  {label}{cnt>0?<span style={{ marginLeft:5, opacity:0.7 }}>({cnt})</span>:''}
                </button>
              );
            })}
          </div>
        )}
        {/* Refresh */}
        <button onClick={load} title="Refresh"
          style={{ width:34, height:34, borderRadius:9, border:`1.5px solid ${isDark?'#334155':'#E4E7EC'}`, background:isDark?'#0F172A':'#fff', color:isDark?'#94A3B8':'#667085', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
          <IconRefresh />
        </button>
      </div>

      {/* ── Tables ── */}
      {tab==='alerts' ? (
        /* LOW STOCK TABLE */
        <div style={{ background:isDark?'#111827':'#fff', borderRadius:14, border:`1px solid ${isDark?'#334155':'#EAECF0'}`, overflow:'hidden', boxShadow:isDark?'0 8px 20px rgba(2,6,23,0.35)':'0 1px 4px rgba(16,24,40,0.04)' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:"'Inter',sans-serif", tableLayout:'fixed' }}>
              <colgroup>
                <col style={{width:'26%'}}/><col style={{width:'12%'}}/><col style={{width:'12%'}}/><col style={{width:'12%'}}/><col style={{width:'20%'}}/><col style={{width:'18%'}}/>
              </colgroup>
              <thead><tr>
                <Th col="product_name">Product</Th>
                <Th col="quantity" align="right">Stock</Th>
                <Th col="min_quantity" align="right">Min</Th>
                <Th col="reorder_qty" align="right">Reorder Qty</Th>
                <Th>Supplier</Th>
                <Th align="center">Action</Th>
              </tr></thead>
              <tbody>
                {loading ? Array.from({length:4}).map((_,i)=>(
                  <tr key={i}>{Array.from({length:6}).map((_,j)=>(
                    <td key={j} style={{padding:'14px 16px'}}><div style={{height:13,borderRadius:6,width:`${50+(j*13)%40}%`,background:isDark?'linear-gradient(90deg,#1E293B 25%,#334155 50%,#1E293B 75%)':'linear-gradient(90deg,#F2F4F7 25%,#E8EAED 50%,#F2F4F7 75%)',backgroundSize:'200% 100%',animation:'shimmer 1.4s infinite'}}/></td>
                  ))}</tr>
                )) : displayedLow.length===0 ? (
                  <tr><td colSpan={6} style={{padding:'52px 16px',textAlign:'center'}}>
                    <div style={{fontSize:40,marginBottom:12}}>✅</div>
                    <div style={{color:isDark?'#E2E8F0':'#344054',fontWeight:600,fontSize:15}}>All good — no low stock alerts</div>
                    <div style={{color:isDark?'#94A3B8':'#98A2B3',fontSize:13,marginTop:4}}>Stock levels are above minimum thresholds</div>
                  </td></tr>
                ) : displayedLow.map((item,idx)=>{
                  const rowBg = isDark?(idx%2===0?'#0F172A':'#111827'):(idx%2===0?'#fff':'#FAFBFC');
                  return (
                    <tr key={item.id} style={{borderBottom:`1px solid ${isDark?'#334155':'#F2F4F7'}`,background:rowBg,transition:'background 0.15s'}}
                      onMouseEnter={e=>e.currentTarget.style.background=isDark?'#1E293B':'#EEF4FF'}
                      onMouseLeave={e=>e.currentTarget.style.background=rowBg}>
                      <td style={{padding:'13px 16px'}}>
                        <div style={{fontWeight:600,color:isDark?'#E2E8F0':'#101828',fontSize:14}}>{item.product_name}</div>
                        {item.category&&<div style={{fontSize:12,color:isDark?'#94A3B8':'#98A2B3',marginTop:1}}>{item.category}</div>}
                      </td>
                      <td style={{padding:'13px 16px',textAlign:'right'}}>
                        <span style={{fontWeight:800,color:'#DC2626',fontSize:15}}>{item.quantity}</span>
                        {item.unit&&<span style={{fontSize:12,color:isDark?'#94A3B8':'#98A2B3',marginLeft:4}}>{item.unit}</span>}
                      </td>
                      <td style={{padding:'13px 16px',textAlign:'right',color:isDark?'#94A3B8':'#98A2B3',fontSize:13}}>{item.min_quantity}</td>
                      <td style={{padding:'13px 16px',textAlign:'right',color:isDark?'#94A3B8':'#667085',fontSize:13}}>{item.reorder_qty||'—'}</td>
                      <td style={{padding:'13px 16px',color:isDark?'#94A3B8':'#667085',fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.supplier_name||'—'}</td>
                      <td style={{padding:'13px 16px',textAlign:'center'}}>
                        {canManage&&<ActionBtn onClick={()=>quickCreate(item)} title="Create Reorder" color="#2563EB"><IconZap /></ActionBtn>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <style>{'@keyframes shimmer{to{background-position:-200% 0}}'}</style>
          </div>
          <div style={{padding:'10px 16px',borderTop:`1px solid ${isDark?'#334155':'#F2F4F7'}`,fontSize:12,color:isDark?'#94A3B8':'#98A2B3'}}>
            {displayedLow.length} low stock item{displayedLow.length!==1?'s':''} requiring attention
          </div>
        </div>
      ) : (
        /* REORDER HISTORY TABLE */
        <div style={{background:isDark?'#111827':'#fff',borderRadius:14,border:`1px solid ${isDark?'#334155':'#EAECF0'}`,overflow:'hidden',boxShadow:isDark?'0 8px 20px rgba(2,6,23,0.35)':'0 1px 4px rgba(16,24,40,0.04)'}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'Inter',sans-serif",tableLayout:'fixed'}}>
              <colgroup>
                <col style={{width:'22%'}}/><col style={{width:'10%'}}/><col style={{width:'18%'}}/><col style={{width:'12%'}}/><col style={{width:'14%'}}/><col style={{width:'12%'}}/><col style={{width:'12%'}}/>
              </colgroup>
              <thead><tr>
                <Th col="inventory_id">Item</Th>
                <Th col="quantity_requested" align="right">Qty</Th>
                <Th>Supplier</Th>
                <Th col="unit_cost" align="right">Unit Cost</Th>
                <Th col="status">Status</Th>
                <Th col="createdAt">Date</Th>
                <Th align="center">Action</Th>
              </tr></thead>
              <tbody>
                {loading ? Array.from({length:5}).map((_,i)=>(
                  <tr key={i}>{Array.from({length:7}).map((_,j)=>(
                    <td key={j} style={{padding:'14px 16px'}}><div style={{height:13,borderRadius:6,width:`${50+(j*13)%40}%`,background:isDark?'linear-gradient(90deg,#1E293B 25%,#334155 50%,#1E293B 75%)':'linear-gradient(90deg,#F2F4F7 25%,#E8EAED 50%,#F2F4F7 75%)',backgroundSize:'200% 100%',animation:'shimmer 1.4s infinite'}}/></td>
                  ))}</tr>
                )) : displayedReorders.length===0 ? (
                  <tr><td colSpan={7} style={{padding:'52px 16px',textAlign:'center'}}>
                    <div style={{fontSize:40,marginBottom:12}}>📦</div>
                    <div style={{color:isDark?'#E2E8F0':'#344054',fontWeight:600,fontSize:15}}>No reorders found</div>
                    <div style={{color:isDark?'#94A3B8':'#98A2B3',fontSize:13,marginTop:4}}>Create a reorder from a low stock alert</div>
                  </td></tr>
                ) : displayedReorders.map((r,idx)=>{
                  const s = r.status;
                  const meta = STATUS_META[s]??STATUS_META.draft;
                  const rowBg = isDark?(idx%2===0?'#0F172A':'#111827'):(idx%2===0?'#fff':'#FAFBFC');
                  const itemName = r.item?.product_name||r.inventory?.product_name||`Item #${r.inventory_id}`;
                  return (
                    <tr key={r.id} style={{borderBottom:`1px solid ${isDark?'#334155':'#F2F4F7'}`,background:rowBg,transition:'background 0.15s'}}
                      onMouseEnter={e=>e.currentTarget.style.background=isDark?'#1E293B':'#EEF4FF'}
                      onMouseLeave={e=>e.currentTarget.style.background=rowBg}>
                      <td style={{padding:'13px 16px'}}>
                        <div style={{fontWeight:600,color:isDark?'#E2E8F0':'#101828',fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{itemName}</div>
                      </td>
                      <td style={{padding:'13px 16px',textAlign:'right',fontWeight:700,color:isDark?'#E2E8F0':'#101828',fontSize:15}}>{r.quantity_requested}</td>
                      <td style={{padding:'13px 16px',color:isDark?'#94A3B8':'#667085',fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {r.supplier_name||'—'}
                        {r.supplier_contact&&<div style={{fontSize:11,marginTop:1,color:isDark?'#64748B':'#98A2B3'}}>{r.supplier_contact}</div>}
                      </td>
                      <td style={{padding:'13px 16px',textAlign:'right',fontSize:13,color:isDark?'#94A3B8':'#667085'}}>{r.unit_cost?`Rs. ${Number(r.unit_cost).toFixed(2)}`:'—'}</td>
                      <td style={{padding:'13px 16px'}}>
                        {canManage && s!=='received' && s!=='cancelled' ? (
                          <select value={s} onChange={ev=>updateStatus(r.id,ev.target.value)}
                            style={{padding:'4px 10px',borderRadius:20,border:`1.5px solid ${meta.color}40`,background:meta.bg,color:meta.color,fontWeight:700,fontSize:12,fontFamily:"'Inter',sans-serif",outline:'none',cursor:'pointer'}}>
                            {STATUSES.filter(st=>st!=='received'||s==='received').map(st=><option key={st} value={st}>{STATUS_META[st].label}</option>)}
                          </select>
                        ):<StatusBadge status={s}/>}
                      </td>
                      <td style={{padding:'13px 16px',color:isDark?'#94A3B8':'#98A2B3',fontSize:12}}>
                        {new Date(r.created_at||r.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{padding:'13px 16px',textAlign:'center'}}>
                        <ActionBtn onClick={()=>setDetailItem(r)} title="View Details" color="#2563EB"><IconEye /></ActionBtn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{padding:'10px 16px',borderTop:`1px solid ${isDark?'#334155':'#F2F4F7'}`,fontSize:12,color:isDark?'#94A3B8':'#98A2B3',display:'flex',justifyContent:'space-between'}}>
            <span>Showing {displayedReorders.length} of {reorders.length} reorders</span>
            <span>Receiving a reorder auto-increases stock in inventory</span>
          </div>
        </div>
      )}

      {/* ── New Reorder Modal ── */}
      <Modal open={showForm} onClose={()=>setShowForm(false)} title="Create Reorder" size="md" dark={isDark}
        footer={<><Button variant="secondary" onClick={()=>setShowForm(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={createReorder}>{saving?'Saving…':'Create Reorder'}</Button></>}>
        <form onSubmit={createReorder}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            <Fld label="Inventory Item *" dark={isDark}>
              <select style={inp(isDark)} value={form.inventory_id} onChange={e=>setForm(p=>({...p,inventory_id:e.target.value}))} required>
                <option value="">Select item</option>
                {lowStock.map(item=><option key={item.id} value={item.id}>{item.product_name} ({item.quantity} left)</option>)}
              </select>
            </Fld>
            <Fld label="Qty Requested *" dark={isDark}>
              <input type="number" min="1" style={inp(isDark)} value={form.quantity_requested} onChange={e=>setForm(p=>({...p,quantity_requested:e.target.value}))} required onFocus={onFoc} onBlur={onBlr(isDark)} />
            </Fld>
            <Fld label="Supplier Name" dark={isDark}>
              <input style={inp(isDark)} value={form.supplier_name} onChange={e=>setForm(p=>({...p,supplier_name:e.target.value}))} placeholder="Supplier company name" onFocus={onFoc} onBlur={onBlr(isDark)} />
            </Fld>
            <Fld label="Supplier Contact" dark={isDark}>
              <input style={inp(isDark)} value={form.supplier_contact} onChange={e=>setForm(p=>({...p,supplier_contact:e.target.value}))} placeholder="Phone or email" onFocus={onFoc} onBlur={onBlr(isDark)} />
            </Fld>
            <Fld label="Unit Cost (Rs.)" dark={isDark}>
              <input type="number" min="0" step="0.01" style={inp(isDark)} value={form.unit_cost} onChange={e=>setForm(p=>({...p,unit_cost:e.target.value}))} placeholder="Optional" onFocus={onFoc} onBlur={onBlr(isDark)} />
            </Fld>
            <div style={{gridColumn:'1/-1'}}>
              <Fld label="Notes" dark={isDark}>
                <textarea style={{...inp(isDark),height:64,resize:'vertical'}} value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="Additional details…" />
              </Fld>
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Detail Drawer ── */}
      <Drawer open={!!detailItem} onClose={()=>setDetailItem(null)} title="Reorder Details" dark={isDark}>
        {detailItem && (
          <div style={{fontFamily:"'Inter',sans-serif"}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,padding:16,background:isDark?'#1E293B':'#F9FAFB',borderRadius:12,border:isDark?'1px solid #334155':'none'}}>
              <div>
                <div style={{fontSize:17,fontWeight:700,color:isDark?'#E2E8F0':'#101828'}}>{detailItem.item?.product_name||detailItem.inventory?.product_name||`Item #${detailItem.inventory_id}`}</div>
                <div style={{fontSize:13,color:isDark?'#94A3B8':'#667085',marginTop:2}}>Qty: {detailItem.quantity_requested}</div>
              </div>
              <StatusBadge status={detailItem.status} />
            </div>
            {[
              {label:'Supplier',    value: detailItem.supplier_name    || '—'},
              {label:'Contact',     value: detailItem.supplier_contact || '—'},
              {label:'Unit Cost',   value: detailItem.unit_cost ? `Rs. ${Number(detailItem.unit_cost).toFixed(2)}` : '—'},
              {label:'Created',     value: new Date(detailItem.created_at||detailItem.createdAt).toLocaleString()},
              {label:'Last Updated',value: detailItem.updated_at||detailItem.updatedAt ? new Date(detailItem.updated_at||detailItem.updatedAt).toLocaleString() : '—'},
            ].map(({label,value})=>(
              <div key={label} style={{display:'flex',alignItems:'center',padding:'12px 0',borderBottom:`1px solid ${isDark?'#334155':'#F2F4F7'}`}}>
                <span style={{fontSize:12,fontWeight:600,color:isDark?'#94A3B8':'#98A2B3',textTransform:'uppercase',width:110,flexShrink:0}}>{label}</span>
                <span style={{fontSize:14,color:isDark?'#E2E8F0':'#101828',fontWeight:500}}>{value}</span>
              </div>
            ))}
            {detailItem.notes&&(
              <div style={{marginTop:20,padding:'14px 16px',background:isDark?'#1E293B':'#F9FAFB',borderRadius:10,border:`1px solid ${isDark?'#334155':'#E4E7EC'}`}}>
                <div style={{fontSize:11,fontWeight:700,color:isDark?'#94A3B8':'#98A2B3',textTransform:'uppercase',marginBottom:6}}>📝 Notes</div>
                <div style={{fontSize:13,color:isDark?'#E2E8F0':'#475467',lineHeight:1.6}}>{detailItem.notes}</div>
              </div>
            )}
            {canManage&&detailItem.status!=='received'&&detailItem.status!=='cancelled'&&(
              <div style={{marginTop:24,display:'flex',gap:8,flexWrap:'wrap'}}>
                {STATUSES.filter(s=>s!==detailItem.status&&s!=='draft').map(s=>{
                  const m=STATUS_META[s];
                  return (
                    <button key={s} onClick={()=>{updateStatus(detailItem.id,s);setDetailItem(null);}}
                      style={{flex:1,padding:'10px 0',borderRadius:10,border:`1.5px solid ${m.color}40`,background:m.bg,color:m.color,fontWeight:700,fontSize:13,cursor:'pointer',minWidth:80}}>
                      {m.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Drawer>

    </PageWrapper>
  );
}
