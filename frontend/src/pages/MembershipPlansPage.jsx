import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';


const Rs = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;
const CYCLES = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly', one_time: 'One-time' };
const STATUS_COLOR = {
  active:    { bg: '#D1FAE5', text: '#065F46', border: '#A7F3D0' },
  expired:   { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
  cancelled: { bg: '#F3F4F6', text: '#374151', border: '#E5E7EB' },
  paused:    { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
};

const PLAN_COLORS = [
  { gradient: 'linear-gradient(135deg, #2563EB, #3B82F6)', light: '#EFF6FF', border: '#BFDBFE', text: '#2563EB', darkBg: '#1E3A8A22' },
  { gradient: 'linear-gradient(135deg, #7C3AED, #A855F7)', light: '#FAF5FF', border: '#DDD6FE', text: '#7C3AED', darkBg: '#4C1D9522' },
  { gradient: 'linear-gradient(135deg, #059669, #10B981)', light: '#ECFDF5', border: '#A7F3D0', text: '#059669', darkBg: '#06402022' },
  { gradient: 'linear-gradient(135deg, #DC2626, #EF4444)', light: '#FEF2F2', border: '#FECACA', text: '#DC2626', darkBg: '#7F1D1D22' },
  { gradient: 'linear-gradient(135deg, #D97706, #F59E0B)', light: '#FFFBEB', border: '#FDE68A', text: '#D97706', darkBg: '#78350F22' },
  { gradient: 'linear-gradient(135deg, #0891B2, #06B6D4)', light: '#ECFEFF', border: '#A5F3FC', text: '#0891B2', darkBg: '#16475822' },
];

const getPlanTheme = (color, idx) => {
  const hex = (color || '').toLowerCase();
  if (hex.includes('7c3aed') || hex.includes('6366f1') || hex.includes('8b5cf6')) return PLAN_COLORS[1];
  if (hex.includes('059669') || hex.includes('10b981') || hex.includes('22c55e')) return PLAN_COLORS[2];
  if (hex.includes('dc2626') || hex.includes('ef4444') || hex.includes('f43f5e')) return PLAN_COLORS[3];
  if (hex.includes('d97706') || hex.includes('f59e0b') || hex.includes('eab308')) return PLAN_COLORS[4];
  if (hex.includes('0891b2') || hex.includes('06b6d4') || hex.includes('0ea5e9')) return PLAN_COLORS[5];
  return PLAN_COLORS[idx % PLAN_COLORS.length];
};

/* ── Icons ── */
const IconClose  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconPlus   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconEdit   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IconTrash  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
const IconRefresh= () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
const IconSearch = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IconPlan   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
const IconStar   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
const IconUsers  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
const IconEye    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;

/* ── StatCard ── */
function StatCard({ label, value, color, icon, dark }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background:dark?'#111827':'#fff', borderRadius:16, padding:'18px 20px', border:`1px solid ${dark?'#334155':'#EAECF0'}`, flex:1, minWidth:130, display:'flex', alignItems:'center', gap:14, boxShadow:hov?(dark?'0 8px 20px rgba(2,6,23,0.50)':'0 8px 24px rgba(16,24,40,0.10)'):(dark?'0 8px 20px rgba(2,6,23,0.35)':'0 1px 4px rgba(16,24,40,0.04)'), transform:hov?'translateY(-2px)':'translateY(0)', transition:'all 0.2s ease', cursor:'default' }}>
      <div style={{ width:46, height:46, borderRadius:12, background:`linear-gradient(135deg,${color}22 0%,${color}10 100%)`, display:'flex', alignItems:'center', justifyContent:'center', color, flexShrink:0, border:`1.5px solid ${color}20` }}>{icon}</div>
      <div>
        <div style={{ fontSize:24, fontWeight:800, color:dark?'#E2E8F0':'#101828', lineHeight:1.1, letterSpacing:'-0.5px' }}>{value}</div>
        <div style={{ fontSize:11, color:dark?'#94A3B8':'#98A2B3', marginTop:3, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</div>
      </div>
    </div>
  );
}

/* ── Modal (createPortal) ── */
function Modal({ open, onClose, title, dark, children }) {
  useEffect(() => { if (!open) return; document.body.style.overflow='hidden'; return ()=>{ document.body.style.overflow=''; }; }, [open]);
  if (!open) return null;
  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(16,24,40,0.45)', backdropFilter:'blur(3px)' }} />
      <div style={{ position:'relative', width:'100%', maxWidth:560, background:dark?'#111827':'#fff', borderRadius:18, boxShadow:dark?'0 24px 60px rgba(2,6,23,0.7)':'0 24px 60px rgba(16,24,40,0.18)', border:dark?'1px solid #334155':'none', maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <style>{'@keyframes shimmer{to{background-position:-200% 0}}'}</style>
        <div style={{ padding:'18px 24px', borderBottom:`1px solid ${dark?'#1E293B':'#EAECF0'}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:800, color:dark?'#F1F5F9':'#101828', fontFamily:"'Inter',sans-serif" }}>{title}</h3>
          <button onClick={onClose} style={{ background:dark?'rgba(255,255,255,0.08)':'#F2F4F7', border:`1px solid ${dark?'rgba(255,255,255,0.12)':'#E4E7EC'}`, cursor:'pointer', color:dark?'#CBD5E1':'#667085', display:'flex', alignItems:'center', borderRadius:8, padding:6 }}><IconClose /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>{children}</div>
      </div>
    </div>,
    document.body
  );
}

/* ── Drawer ── */
function Drawer({ open, onClose, title, dark, children }) {
  useEffect(() => { if (!open) return; document.body.style.overflow='hidden'; return ()=>{ document.body.style.overflow=''; }; }, [open]);
  if (!open) return null;
  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:900, display:'flex', justifyContent:'flex-end' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(16,24,40,0.4)', backdropFilter:'blur(2px)' }} />
      <div style={{ position:'relative', width:440, maxWidth:'95vw', background:dark?'#111827':'#fff', display:'flex', flexDirection:'column', boxShadow:dark?'-8px 0 40px rgba(2,6,23,0.55)':'-8px 0 40px rgba(16,24,40,0.15)', animation:'slideIn 0.22s ease', borderLeft:dark?'1px solid #334155':'none' }}>
        <style>{'@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}'}</style>
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

/* ── ActionBtn ── */
function ActionBtn({ onClick, title, color, children }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} title={title} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width:30, height:30, borderRadius:8, border:`1.5px solid ${color}30`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all 0.15s', background:hov?`${color}20`:`${color}10`, color, transform:hov?'scale(1.1)':'scale(1)' }}>
      {children}
    </button>
  );
}

export default function MembershipPlansPage() {
  const { user }   = useAuth();
  const { toast } = useToast();
  const { isDark } = useTheme();
  const canAdmin   = ['superadmin', 'admin'].includes(user?.role);

  const [plans, setPlans]                 = useState([]);
  const [enrollments, setEnrollments]     = useState([]);
  const [customers, setCustomers]         = useState([]);
  const [tab, setTab]                     = useState('plans');
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState('all');
  const [sortBy, setSortBy]               = useState('createdAt');
  const [sortDir, setSortDir]             = useState('desc');
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editPlan, setEditPlan]           = useState(null);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [detailEnroll, setDetailEnroll]   = useState(null);

  const blankPlan = { name:'', description:'', price:'', billing_cycle:'monthly', discount_percent:0, free_services_count:0, bonus_loyalty_points:0, color:'#6366f1', sort_order:0 };
  const [planForm, setPlanForm]   = useState(blankPlan);
  const [enrollForm, setEnrollForm] = useState({ customer_id:'', plan_id:'', start_date:new Date().toISOString().slice(0,10), amount_paid:'', notes:'' });

  const loadPlans = useCallback(() => api.get('/membership/plans').then(r => setPlans(Array.isArray(r.data)?r.data:[])).catch(()=>{}), []);
  const loadEnrollments = useCallback(() => {
    setLoading(true);
    api.get('/membership/enrollments').then(r => setEnrollments(Array.isArray(r.data)?r.data:[])).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  useEffect(() => { loadPlans(); loadEnrollments(); }, [loadPlans, loadEnrollments]);
  useEffect(() => {
    api.get('/customers').then(r => {
      const list = Array.isArray(r.data?.data)?r.data.data:(Array.isArray(r.data)?r.data:[]);
      setCustomers(list);
    }).catch(()=>{});
  }, []);

  const savePlan = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editPlan) { await api.put(`/membership/plans/${editPlan.id}`, planForm); toast('Plan updated','success'); }
      else { await api.post('/membership/plans', planForm); toast('Plan created','success'); }
      setShowPlanModal(false); setEditPlan(null); setPlanForm(blankPlan); loadPlans();
    } catch(err) { toast(err.response?.data?.message||'Error','error'); }
    setSaving(false);
  };

  const deletePlan = async (id) => {
    if (!window.confirm('Delete or deactivate this plan?')) return;
    try { await api.delete(`/membership/plans/${id}`); toast('Plan removed','success'); loadPlans(); }
    catch { toast('Error','error'); }
  };

  const saveEnroll = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post('/membership/enroll', enrollForm);
      toast('Customer enrolled!','success');
      setShowEnrollModal(false);
      setEnrollForm({ customer_id:'', plan_id:'', start_date:new Date().toISOString().slice(0,10), amount_paid:'', notes:'' });
      loadEnrollments();
    } catch(err) { toast(err.response?.data?.message||'Error','error'); }
    setSaving(false);
  };

  const updateStatus = async (id, status) => {
    try { await api.patch(`/membership/enrollments/${id}/status`,{ status }); toast('Updated','success'); loadEnrollments(); }
    catch { toast('Error','error'); }
  };

  /* ── Derived ── */
  const activeEnrollments = enrollments.filter(e=>e.status==='active').length;
  const activePlans       = plans.filter(p=>p.is_active!==false).length;
  const expiredCount      = enrollments.filter(e=>e.status==='expired').length;
  const totalRevenue      = enrollments.reduce((s,e)=>s+Number(e.amount_paid||0),0);

  const filteredEnrollments = enrollments
    .filter(e => statusFilter==='all' || e.status===statusFilter)
    .filter(e => !search || e.customer?.name?.toLowerCase().includes(search.toLowerCase()) || e.plan?.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => {
      let av = sortBy==='amount' ? Number(a.amount_paid||0) : sortBy==='start_date' ? a.start_date : a.createdAt;
      let bv = sortBy==='amount' ? Number(b.amount_paid||0) : sortBy==='start_date' ? b.start_date : b.createdAt;
      return sortDir==='desc' ? (bv>av?1:-1) : (av>bv?1:-1);
    });

  const handleSort = (key) => {
    if (sortBy===key) setSortDir(d=>d==='desc'?'asc':'desc');
    else { setSortBy(key); setSortDir('desc'); }
  };
  const SortIco = ({ col }) => sortBy!==col
    ? <span style={{opacity:0.3,fontSize:10,marginLeft:3}}>⇅</span>
    : <span style={{fontSize:10,marginLeft:3,color:isDark?'#93C5FD':'#2563EB'}}>{sortDir==='desc'?'↓':'↑'}</span>;

  /* ── Colors ── */
  const C = { border:isDark?'#334155':'#EAECF0', card:isDark?'#111827':'#fff', text:isDark?'#E2E8F0':'#101828', sub:isDark?'#94A3B8':'#667085', muted:isDark?'#64748B':'#98A2B3' };
  const inp = { padding:'10px 14px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:13.5, width:'100%', boxSizing:'border-box', fontFamily:"'Inter',sans-serif", outline:'none', transition:'border-color 0.15s', background:isDark?'#1E293B':'#FAFBFC', color:C.text };
  const lbl = { fontSize:12, fontWeight:700, color:C.sub, marginBottom:6, display:'block', fontFamily:"'Inter',sans-serif" };

  return (
    <PageWrapper
      title="Membership Plans"
      subtitle="Create and manage customer loyalty membership plans"
      actions={
        <button onClick={()=>{loadPlans();loadEnrollments();}}
          style={{width:34,height:34,borderRadius:9,border:`1.5px solid ${C.border}`,background:C.card,color:C.sub,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
          <IconRefresh/>
        </button>
      }
    >

      {/* ── Stat Cards ── */}
      <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
        <StatCard label="Total Plans"     value={plans.length}           color="#2563EB" dark={isDark} icon={<IconPlan/>}/>
        <StatCard label="Active Plans"    value={activePlans}            color="#059669" dark={isDark} icon={<IconStar/>}/>
        <StatCard label="Active Members"  value={activeEnrollments}      color="#7C3AED" dark={isDark} icon={<IconUsers/>}/>
        <StatCard label="Total Enrolled"  value={enrollments.length}     color="#D97706" dark={isDark} icon={<IconUsers/>}/>
        <StatCard label="Total Revenue"   value={`Rs.${Math.round(totalRevenue/1000)}k`} color="#0891B2" dark={isDark} icon={<IconStar/>}/>
      </div>

      {/* ── Hero Banner ── */}
      <div style={{background:'linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)',borderRadius:18,padding:'28px 32px',boxShadow:'0 8px 32px rgba(37,99,235,0.22)',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',top:-40,right:-40,width:200,height:200,borderRadius:'50%',background:'rgba(255,255,255,0.06)',pointerEvents:'none'}}/>
        <div style={{position:'absolute',bottom:-30,right:80,width:120,height:120,borderRadius:'50%',background:'rgba(255,255,255,0.04)',pointerEvents:'none'}}/>
        <div style={{position:'relative',display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:16}}>
          <div>
            <span style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(255,255,255,0.18)',color:'#fff',fontSize:11,fontWeight:800,letterSpacing:'0.07em',textTransform:'uppercase',padding:'4px 12px',borderRadius:99,border:'1px solid rgba(255,255,255,0.25)',fontFamily:"'Inter',sans-serif"}}>
              Loyalty Memberships
            </span>
            <h2 style={{margin:'12px 0 2px',fontSize:28,fontWeight:900,color:'#fff',lineHeight:1.1,fontFamily:"'Sora','Manrope',sans-serif",letterSpacing:'-0.5px'}}>
              {plans.length===0?'Get Started':'Membership Overview'}
            </h2>
            <p style={{margin:0,fontSize:13.5,color:'rgba(255,255,255,0.72)',fontFamily:"'Inter',sans-serif",maxWidth:480}}>
              {plans.length===0
                ?'Create your first membership plan to reward loyal customers with exclusive benefits.'
                :`${activePlans} active plan${activePlans!==1?'s':''} · ${activeEnrollments} enrolled member${activeEnrollments!==1?'s':''} · ${expiredCount} expired`}
            </p>
            {enrollments.length>0 && (
              <div style={{marginTop:16,maxWidth:360}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                  <span style={{fontSize:12,color:'rgba(255,255,255,0.75)',fontWeight:600,fontFamily:"'Inter',sans-serif"}}>Active enrollment rate</span>
                  <span style={{fontSize:12,fontWeight:700,color:'#fff',fontFamily:"'Inter',sans-serif"}}>{activeEnrollments}/{enrollments.length}</span>
                </div>
                <div style={{height:6,background:'rgba(255,255,255,0.2)',borderRadius:99,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${Math.min(100,enrollments.length>0?(activeEnrollments/enrollments.length)*100:0)}%`,background:'rgba(255,255,255,0.85)',borderRadius:99,transition:'width 0.8s ease'}}/>
                </div>
              </div>
            )}
          </div>
          <div style={{background:activePlans>0?'rgba(16,185,129,0.2)':'rgba(255,255,255,0.15)',border:activePlans>0?'1px solid rgba(16,185,129,0.5)':'1px solid rgba(255,255,255,0.3)',borderRadius:99,padding:'6px 16px',fontSize:12,fontWeight:700,color:'#fff',textTransform:'uppercase',letterSpacing:'0.06em',fontFamily:"'Inter',sans-serif",alignSelf:'flex-start'}}>
            {activePlans} Active
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{display:'flex',gap:6,borderBottom:`1px solid ${C.border}`,paddingBottom:0}}>
        {[{k:'plans',label:'📋  Plans'},{k:'enrollments',label:'👥  Enrollments'}].map(({k,label})=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{padding:'9px 22px',borderRadius:'10px 10px 0 0',fontSize:13,fontWeight:700,cursor:'pointer',border:tab===k?`1.5px solid ${C.border}`:`1.5px solid transparent`,borderBottom:tab===k?`1.5px solid ${C.card}`:'none',background:tab===k?C.card:(isDark?'transparent':'transparent'),color:tab===k?'#2563EB':C.sub,transition:'all 0.15s',fontFamily:"'Inter',sans-serif",marginBottom:'-1px'}}>
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════ PLANS TAB ══════════════ */}
      {tab==='plans' && (
        <>
        {canAdmin && (
          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <button onClick={()=>{setEditPlan(null);setPlanForm(blankPlan);setShowPlanModal(true);}}
              style={{display:'flex',alignItems:'center',gap:6,padding:'9px 18px',background:'linear-gradient(135deg,#2563EB,#3B82F6)',border:'none',borderRadius:10,cursor:'pointer',fontSize:13,fontWeight:700,color:'#fff',boxShadow:'0 2px 10px rgba(37,99,235,0.35)',fontFamily:"'Inter',sans-serif"}}>
              <IconPlus/> New Plan
            </button>
          </div>
        )}
        <div style={{display:'flex',gap:18,flexWrap:'wrap',alignItems:'stretch'}}>
          {plans.length===0 ? (
            <div style={{width:'100%',textAlign:'center',padding:'50px 20px',background:isDark?C.card:'linear-gradient(135deg,#F9FAFB,#F3F4F6)',borderRadius:18,border:`2px dashed ${C.border}`}}>
              <div style={{fontSize:40,marginBottom:12}}>📋</div>
              <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:4,fontFamily:"'Sora',sans-serif"}}>No membership plans yet</div>
              <div style={{fontSize:13,color:C.sub,fontFamily:"'Inter',sans-serif"}}>Create your first plan to start enrolling customers.</div>
            </div>
          ) : plans.map((plan,i) => {
            const theme = getPlanTheme(plan.color,i);
            const features = [];
            if (plan.discount_percent>0) features.push(`${plan.discount_percent}% off all services`);
            if (plan.free_services_count>0) features.push(`${plan.free_services_count} free service credits`);
            if (plan.bonus_loyalty_points>0) features.push(`${plan.bonus_loyalty_points} bonus loyalty pts`);
            if (plan.billing_cycle) features.push(`Billed ${CYCLES[plan.billing_cycle]?.toLowerCase()||plan.billing_cycle}`);
            const isPremium = plans.length>1 && plan.price===Math.max(...plans.map(p=>Number(p.price||0)));
            return (
              <div key={plan.id}
                style={{flex:1,minWidth:240,background:isDark?(isPremium?theme.darkBg:C.card):(isPremium?`linear-gradient(160deg,${theme.light} 0%,${theme.light}CC 100%)`:'#fff'),border:`1.5px solid ${isPremium?theme.text:C.border}`,borderRadius:18,padding:'26px 22px',position:'relative',boxShadow:isPremium?`0 8px 32px ${theme.text}22`:(isDark?'0 8px 20px rgba(2,6,23,0.35)':'0 2px 8px rgba(16,24,40,0.06)'),display:'flex',flexDirection:'column',transition:'all 0.2s ease'}}
                onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-3px)';}}
                onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';}}>
                {isPremium && (
                  <div style={{position:'absolute',top:-13,left:'50%',transform:'translateX(-50%)',background:theme.gradient,color:'#fff',fontSize:11,fontWeight:800,padding:'3px 16px',borderRadius:99,letterSpacing:'0.07em',textTransform:'uppercase',boxShadow:`0 2px 8px ${theme.text}55`,whiteSpace:'nowrap',fontFamily:"'Inter',sans-serif"}}>
                    Most Popular
                  </div>
                )}
                {/* Plan header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                  <div>
                    <div style={{fontSize:17,fontWeight:800,color:theme.text,fontFamily:"'Sora','Manrope',sans-serif"}}>{plan.name}</div>
                    {plan.is_active===false && <span style={{fontSize:10,fontWeight:700,color:'#9CA3AF',background:'#F3F4F6',padding:'2px 8px',borderRadius:99,marginTop:4,display:'inline-block'}}>INACTIVE</span>}
                  </div>
                  {canAdmin && (
                    <div style={{display:'flex',gap:5}}>
                      <ActionBtn onClick={()=>{setEditPlan(plan);setPlanForm({...plan});setShowPlanModal(true);}} title="Edit" color="#2563EB"><IconEdit/></ActionBtn>
                      <ActionBtn onClick={()=>deletePlan(plan.id)} title="Delete" color="#DC2626"><IconTrash/></ActionBtn>
                    </div>
                  )}
                </div>
                {plan.description && <p style={{fontSize:12.5,color:C.sub,margin:'0 0 14px',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>{plan.description}</p>}
                {/* Price */}
                <div style={{marginBottom:18}}>
                  <span style={{fontSize:29,fontWeight:900,color:C.text,fontFamily:"'Sora',sans-serif"}}>{Rs(plan.price)}</span>
                  <span style={{fontSize:13.5,color:C.muted,fontWeight:500,fontFamily:"'Inter',sans-serif"}}>{' '}/ {CYCLES[plan.billing_cycle]||plan.billing_cycle}</span>
                </div>
                {/* Features */}
                <ul style={{listStyle:'none',padding:0,margin:'0 0 22px',flexGrow:1}}>
                  {features.length===0 && <li style={{fontSize:12.5,color:C.muted,fontFamily:"'Inter',sans-serif",padding:'4px 0'}}>No perks configured</li>}
                  {features.map(f=>(
                    <li key={f} style={{display:'flex',alignItems:'center',gap:9,padding:'6px 0',fontSize:13.5,color:C.text,borderBottom:`1px solid ${isDark?'#1E293B':'#F2F4F7'}`,fontFamily:"'Inter',sans-serif"}}>
                      <span style={{color:theme.text,flexShrink:0,fontWeight:700,fontSize:14}}>✓</span>{f}
                    </li>
                  ))}
                </ul>
                {/* Enroll CTA */}
                <button onClick={()=>{setEnrollForm(p=>({...p,plan_id:plan.id}));setShowEnrollModal(true);}} disabled={plan.is_active===false}
                  style={{width:'100%',padding:'11px 0',borderRadius:10,background:plan.is_active===false?C.border:theme.gradient,border:'none',cursor:plan.is_active===false?'not-allowed':'pointer',fontSize:13,fontWeight:700,color:'#fff',letterSpacing:'0.02em',transition:'all 0.15s',fontFamily:"'Inter',sans-serif",opacity:plan.is_active===false?0.5:1}}>
                  Enroll Customer
                </button>
              </div>
            );
          })}
        </div>
        </>
      )}

      {/* ══════════════ ENROLLMENTS TAB ══════════════ */}
      {tab==='enrollments' && (
        <>
          {/* Enroll button row */}
          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <button onClick={()=>setShowEnrollModal(true)}
              style={{display:'flex',alignItems:'center',gap:6,padding:'9px 18px',background:'linear-gradient(135deg,#7C3AED,#A855F7)',border:'none',borderRadius:10,cursor:'pointer',fontSize:13,fontWeight:700,color:'#fff',boxShadow:'0 2px 10px rgba(124,58,237,0.35)',fontFamily:"'Inter',sans-serif"}}>
              <IconPlus/> Enroll Customer
            </button>
          </div>
          {/* Filter bar */}
          <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:'12px 16px',display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',boxShadow:isDark?'0 8px 20px rgba(2,6,23,0.35)':'0 1px 4px rgba(16,24,40,0.04)'}}>
            <div style={{position:'relative',flex:1,minWidth:200}}>
              <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:C.muted,pointerEvents:'none'}}><IconSearch/></span>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search customer or plan…"
                style={{...inp,paddingLeft:34,background:isDark?'#0F172A':'#F9FAFB',border:`1.5px solid ${C.border}`}}/>
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {['all','active','expired','cancelled','paused'].map(s=>(
                <button key={s} onClick={()=>setStatusFilter(s)}
                  style={{padding:'5px 13px',borderRadius:20,fontSize:12,fontWeight:statusFilter===s?700:500,cursor:'pointer',fontFamily:"'Inter',sans-serif",transition:'all 0.15s',background:statusFilter===s?(isDark?'#2563EB':'#EFF6FF'):(isDark?'#0F172A':'#F9FAFB'),color:statusFilter===s?'#2563EB':(isDark?'#CBD5E1':'#667085'),border:`1.5px solid ${statusFilter===s?'#2563EB':C.border}`,textTransform:'capitalize'}}>
                  {s==='all'?'All':s}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,overflow:'hidden',boxShadow:isDark?'0 8px 20px rgba(2,6,23,0.35)':'0 1px 4px rgba(16,24,40,0.04)'}}>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'Inter',sans-serif",tableLayout:'fixed'}}>
                <colgroup><col style={{width:'20%'}}/><col style={{width:'16%'}}/><col style={{width:'11%'}}/><col style={{width:'11%'}}/><col style={{width:'8%'}}/><col style={{width:'13%'}}/><col style={{width:'12%'}}/><col style={{width:'9%'}}/></colgroup>
                <thead>
                  <tr>
                    {[
                      {col:'customer', label:'Customer'},
                      {col:null,       label:'Plan'},
                      {col:'start_date',label:'Start', align:'center'},
                      {col:null,       label:'Expires', align:'center'},
                      {col:null,       label:'Credits', align:'center'},
                      {col:'amount',   label:'Amount Paid', align:'right'},
                      {col:null,       label:'Status', align:'center'},
                      {col:null,       label:'', align:'center'},
                    ].map(({col,label,align='left'},hi)=>(
                      <th key={hi} onClick={col?()=>handleSort(col):undefined}
                        style={{padding:'12px 16px',textAlign:align,fontSize:11,fontWeight:700,color:C.sub,textTransform:'uppercase',letterSpacing:'0.06em',background:isDark?'#1E293B':'linear-gradient(180deg,#F8F9FC 0%,#F1F3F9 100%)',borderBottom:`1.5px solid ${C.border}`,whiteSpace:'nowrap',cursor:col?'pointer':'default',userSelect:'none'}}>
                        {label}{col&&<SortIco col={col}/>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? Array.from({length:5}).map((_,i)=>(
                    <tr key={i}>{Array.from({length:8}).map((_,j)=>(
                      <td key={j} style={{padding:'14px 16px'}}><div style={{height:13,borderRadius:6,width:`${50+(j*13)%42}%`,background:isDark?'linear-gradient(90deg,#1E293B 25%,#334155 50%,#1E293B 75%)':'linear-gradient(90deg,#F2F4F7 25%,#E8EAED 50%,#F2F4F7 75%)',backgroundSize:'200% 100%',animation:'shimmer 1.4s infinite'}}/></td>
                    ))}</tr>
                  )) : filteredEnrollments.length===0 ? (
                    <tr><td colSpan={8} style={{padding:'52px 16px',textAlign:'center'}}>
                      <div style={{fontSize:40,marginBottom:12}}>👥</div>
                      <div style={{fontWeight:600,fontSize:15,color:C.text}}>{search||statusFilter!=='all'?'No matching enrollments':'No enrollments yet'}</div>
                      <div style={{fontSize:13,marginTop:4,color:C.sub}}>{search||statusFilter!=='all'?'Try adjusting your filters.':'Enroll your first customer in a plan.'}</div>
                    </td></tr>
                  ) : filteredEnrollments.map((e, idx) => {
                    const sc = STATUS_COLOR[e.status]||STATUS_COLOR.active;
                    const rowBg = isDark?(idx%2===0?'#0F172A':'#111827'):(idx%2===0?'#fff':'#FAFBFC');
                    return (
                      <tr key={e.id} style={{borderBottom:`1px solid ${C.border}`,background:rowBg,transition:'background 0.15s'}}
                        onMouseEnter={ev=>ev.currentTarget.style.background=isDark?'#1E293B':'#EEF4FF'}
                        onMouseLeave={ev=>ev.currentTarget.style.background=rowBg}>
                        <td style={{padding:'13px 16px'}}>
                          <div style={{fontWeight:700,fontSize:14,color:C.text}}>{e.customer?.name||'—'}</div>
                          <div style={{fontSize:11,color:C.muted,marginTop:1}}>{e.customer?.phone}</div>
                        </td>
                        <td style={{padding:'13px 16px'}}>
                          <div style={{display:'inline-flex',alignItems:'center',gap:7}}>
                            <span style={{width:8,height:8,borderRadius:'50%',background:e.plan?.color||'#6366f1',flexShrink:0,display:'inline-block'}}/>
                            <span style={{fontWeight:600,fontSize:13,color:C.text}}>{e.plan?.name||'—'}</span>
                          </div>
                          <div style={{fontSize:11,color:C.muted,marginTop:1}}>{CYCLES[e.plan?.billing_cycle]||''}</div>
                        </td>
                        <td style={{padding:'13px 16px',textAlign:'center',color:C.sub,fontSize:13}}>{e.start_date}</td>
                        <td style={{padding:'13px 16px',textAlign:'center',color:e.end_date&&new Date(e.end_date)<new Date()?'#DC2626':C.sub,fontSize:13,fontWeight:e.end_date&&new Date(e.end_date)<new Date()?700:400}}>{e.end_date||'—'}</td>
                        <td style={{padding:'13px 16px',textAlign:'center'}}>
                          <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:32,height:32,borderRadius:10,background:isDark?'#1E293B':'#F5F3FF',border:'1px solid #DDD6FE',fontWeight:800,fontSize:15,color:'#7C3AED'}}>{e.free_credits_remaining||0}</span>
                        </td>
                        <td style={{padding:'13px 16px',textAlign:'right',fontWeight:700,color:C.text,fontSize:14}}>{Rs(e.amount_paid)}</td>
                        <td style={{padding:'13px 16px',textAlign:'center'}}>
                          <span style={{padding:'4px 12px',borderRadius:99,fontSize:11,fontWeight:700,background:sc.bg,color:sc.text,border:`1px solid ${sc.border}`,textTransform:'capitalize',whiteSpace:'nowrap'}}>
                            {e.status}
                          </span>
                        </td>
                        <td style={{padding:'13px 16px',textAlign:'center'}}>
                          <div style={{display:'flex',gap:5,justifyContent:'center'}}>
                            <ActionBtn onClick={()=>setDetailEnroll(e)} title="View" color="#2563EB"><IconEye/></ActionBtn>
                            {e.status==='active' && canAdmin && (
                              <ActionBtn onClick={()=>updateStatus(e.id,'cancelled')} title="Cancel" color="#DC2626"><IconTrash/></ActionBtn>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{padding:'10px 16px',borderTop:`1px solid ${C.border}`,fontSize:12,color:C.muted,display:'flex',justifyContent:'space-between',fontFamily:"'Inter',sans-serif"}}>
              <span>Showing {filteredEnrollments.length} of {enrollments.length} enrollments</span>
              <span>{activeEnrollments} active · {expiredCount} expired</span>
            </div>
          </div>
        </>
      )}

      {/* ── Footer ── */}
      <p style={{margin:0,fontSize:12,color:C.muted,textAlign:'center',fontFamily:"'Inter',sans-serif"}}>
        Membership plans help retain customers with exclusive benefits and rewards.
      </p>

      {/* ══ Plan Modal ══ */}
      <Modal open={showPlanModal} onClose={()=>{setShowPlanModal(false);setEditPlan(null);}} title={editPlan?'Edit Plan':'New Membership Plan'} dark={isDark}>
        <form onSubmit={savePlan}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            <div style={{gridColumn:'1/-1'}}>
              <label style={lbl}>Plan Name *</label>
              <input style={inp} value={planForm.name} onChange={e=>setPlanForm(p=>({...p,name:e.target.value}))} required placeholder="e.g. Gold Membership"/>
            </div>
            <div>
              <label style={lbl}>Price (Rs.) *</label>
              <input type="number" style={inp} value={planForm.price} onChange={e=>setPlanForm(p=>({...p,price:e.target.value}))} min="0" step="0.01" required placeholder="0.00"/>
            </div>
            <div>
              <label style={lbl}>Billing Cycle</label>
              <select style={inp} value={planForm.billing_cycle} onChange={e=>setPlanForm(p=>({...p,billing_cycle:e.target.value}))}>
                {Object.entries(CYCLES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Service Discount (%)</label>
              <input type="number" style={inp} value={planForm.discount_percent} onChange={e=>setPlanForm(p=>({...p,discount_percent:e.target.value}))} min="0" max="100" step="0.01" placeholder="0"/>
            </div>
            <div>
              <label style={lbl}>Free Service Credits</label>
              <input type="number" style={inp} value={planForm.free_services_count} onChange={e=>setPlanForm(p=>({...p,free_services_count:e.target.value}))} min="0" placeholder="0"/>
            </div>
            <div>
              <label style={lbl}>Bonus Loyalty Points</label>
              <input type="number" style={inp} value={planForm.bonus_loyalty_points} onChange={e=>setPlanForm(p=>({...p,bonus_loyalty_points:e.target.value}))} min="0" placeholder="0"/>
            </div>
            <div>
              <label style={lbl}>Color</label>
              <input type="color" style={{...inp,height:42,padding:4,cursor:'pointer'}} value={planForm.color||'#6366f1'} onChange={e=>setPlanForm(p=>({...p,color:e.target.value}))}/>
            </div>
            <div style={{gridColumn:'1/-1'}}>
              <label style={lbl}>Description</label>
              <textarea style={{...inp,height:72,resize:'vertical'}} value={planForm.description||''} onChange={e=>setPlanForm(p=>({...p,description:e.target.value}))} placeholder="Describe the benefits of this plan…"/>
            </div>
          </div>
          <div style={{display:'flex',gap:10,marginTop:20}}>
            <button type="submit" disabled={saving}
              style={{padding:'10px 24px',background:'linear-gradient(135deg,#2563EB,#3B82F6)',color:'#fff',border:'none',borderRadius:10,fontSize:13.5,fontWeight:700,cursor:saving?'not-allowed':'pointer',opacity:saving?0.6:1,boxShadow:'0 2px 10px rgba(37,99,235,0.35)',fontFamily:"'Inter',sans-serif"}}>
              {saving?'Saving…':editPlan?'Update Plan':'Create Plan'}
            </button>
            <button type="button" onClick={()=>{setShowPlanModal(false);setEditPlan(null);}}
              style={{padding:'10px 20px',borderRadius:10,border:`1.5px solid ${C.border}`,background:C.card,cursor:'pointer',fontSize:13,fontWeight:600,color:C.sub,fontFamily:"'Inter',sans-serif"}}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* ══ Enroll Modal ══ */}
      <Modal open={showEnrollModal} onClose={()=>setShowEnrollModal(false)} title="Enroll Customer" dark={isDark}>
        <form onSubmit={saveEnroll}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            <div>
              <label style={lbl}>Customer *</label>
              <select style={inp} value={enrollForm.customer_id} onChange={e=>setEnrollForm(p=>({...p,customer_id:e.target.value}))} required>
                <option value="">Select customer</option>
                {customers.map(c=><option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Plan *</label>
              <select style={inp} value={enrollForm.plan_id} onChange={e=>setEnrollForm(p=>({...p,plan_id:e.target.value}))} required>
                <option value="">Select plan</option>
                {plans.filter(p=>p.is_active!==false).map(p=><option key={p.id} value={p.id}>{p.name} — {Rs(p.price)}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Start Date *</label>
              <input type="date" style={inp} value={enrollForm.start_date} onChange={e=>setEnrollForm(p=>({...p,start_date:e.target.value}))} required/>
            </div>
            <div>
              <label style={lbl}>Amount Paid (Rs.)</label>
              <input type="number" style={inp} value={enrollForm.amount_paid} onChange={e=>setEnrollForm(p=>({...p,amount_paid:e.target.value}))} min="0" step="0.01" placeholder="0.00"/>
            </div>
            <div style={{gridColumn:'1/-1'}}>
              <label style={lbl}>Notes</label>
              <input style={inp} value={enrollForm.notes} onChange={e=>setEnrollForm(p=>({...p,notes:e.target.value}))} placeholder="Optional notes…"/>
            </div>
          </div>
          <div style={{display:'flex',gap:10,marginTop:20}}>
            <button type="submit" disabled={saving}
              style={{padding:'10px 24px',background:'linear-gradient(135deg,#7C3AED,#A855F7)',color:'#fff',border:'none',borderRadius:10,fontSize:13.5,fontWeight:700,cursor:saving?'not-allowed':'pointer',opacity:saving?0.6:1,boxShadow:'0 2px 10px rgba(124,58,237,0.35)',fontFamily:"'Inter',sans-serif"}}>
              {saving?'Saving…':'Enroll'}
            </button>
            <button type="button" onClick={()=>setShowEnrollModal(false)}
              style={{padding:'10px 20px',borderRadius:10,border:`1.5px solid ${C.border}`,background:C.card,cursor:'pointer',fontSize:13,fontWeight:600,color:C.sub,fontFamily:"'Inter',sans-serif"}}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* ══ Enrollment Detail Drawer ══ */}
      <Drawer open={!!detailEnroll} onClose={()=>setDetailEnroll(null)} title={detailEnroll?.customer?.name||'Enrollment Detail'} dark={isDark}>
        {detailEnroll && (() => {
          const sc = STATUS_COLOR[detailEnroll.status]||STATUS_COLOR.active;
          return (
            <div style={{fontFamily:"'Inter',sans-serif"}}>
              <div style={{background:isDark?'#1E293B':'#F9FAFB',borderRadius:12,padding:16,marginBottom:20,border:isDark?'1px solid #334155':'none',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:700,fontSize:16,color:isDark?'#E2E8F0':'#101828'}}>{detailEnroll.customer?.name}</div>
                  <div style={{fontSize:12,color:isDark?'#94A3B8':'#98A2B3',marginTop:2}}>{detailEnroll.customer?.phone} · {detailEnroll.customer?.email}</div>
                </div>
                <span style={{padding:'5px 14px',borderRadius:99,fontSize:12,fontWeight:700,background:sc.bg,color:sc.text,border:`1px solid ${sc.border}`,textTransform:'capitalize'}}>{detailEnroll.status}</span>
              </div>
              {[
                {label:'Plan',        value: <span style={{display:'inline-flex',alignItems:'center',gap:7}}><span style={{width:10,height:10,borderRadius:'50%',background:detailEnroll.plan?.color||'#6366f1',display:'inline-block'}}/>{detailEnroll.plan?.name}</span>},
                {label:'Billing',     value: CYCLES[detailEnroll.plan?.billing_cycle]||'—'},
                {label:'Plan Price',  value: Rs(detailEnroll.plan?.price)},
                {label:'Amount Paid', value: Rs(detailEnroll.amount_paid)},
                {label:'Start Date',  value: detailEnroll.start_date},
                {label:'End Date',    value: detailEnroll.end_date||'—'},
                {label:'Free Credits',value: detailEnroll.free_credits_remaining||0},
                {label:'Reference',   value: detailEnroll.payment_reference||'—'},
                {label:'Notes',       value: detailEnroll.notes||'—'},
              ].map(({label,value})=>(
                <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 0',borderBottom:`1px solid ${isDark?'#334155':'#F2F4F7'}`}}>
                  <span style={{fontSize:12,color:isDark?'#94A3B8':'#98A2B3',fontWeight:600}}>{label}</span>
                  <span style={{fontSize:14,fontWeight:700,color:isDark?'#E2E8F0':'#101828'}}>{value}</span>
                </div>
              ))}
              {detailEnroll.status==='active' && canAdmin && (
                <div style={{marginTop:24,display:'flex',gap:8}}>
                  {['paused','cancelled'].map(s=>(
                    <button key={s} onClick={()=>{updateStatus(detailEnroll.id,s);setDetailEnroll(null);}}
                      style={{flex:1,padding:'10px 0',borderRadius:10,border:`1.5px solid ${s==='cancelled'?'#FECACA':'#FDE68A'}`,background:s==='cancelled'?'#FEF2F2':'#FFFBEB',color:s==='cancelled'?'#DC2626':'#D97706',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:"'Inter',sans-serif",textTransform:'capitalize'}}>
                      {s==='cancelled'?'Cancel Membership':'Pause Membership'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </Drawer>
    </PageWrapper>
  );
}
