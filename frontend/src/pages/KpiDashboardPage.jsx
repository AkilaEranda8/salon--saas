import { useState, useEffect, useCallback, createPortal } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const Rs = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;

const PERIODS = [
  { k: 'today', label: 'Today' },
  { k: 'week',  label: 'Week'  },
  { k: 'month', label: 'Month' },
];
const RANK_COLORS = ['#F59E0B', '#94A3B8', '#CD7F32'];
const MEDAL = ['🥇', '🥈', '🥉'];

/* ── Icons ── */
const IconRefresh = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
const IconClose   = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconEye     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconTrend   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
const IconCal     = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IconBranch  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IconUser    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;

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

/* ── Drawer ── */
function Drawer({ open, onClose, title, children, dark }) {
  useEffect(() => { if (!open) return; document.body.style.overflow='hidden'; return () => { document.body.style.overflow=''; }; }, [open]);
  if (!open) return null;
  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:900, display:'flex', justifyContent:'flex-end' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(16,24,40,0.4)', backdropFilter:'blur(2px)' }} />
      <div style={{ position:'relative', width:460, maxWidth:'95vw', background:dark?'#111827':'#fff', display:'flex', flexDirection:'column', boxShadow:dark?'-8px 0 40px rgba(2,6,23,0.55)':'-8px 0 40px rgba(16,24,40,0.15)', animation:'drawer-in 0.22s ease', borderLeft:dark?'1px solid #334155':'none' }}>
        <style>{'@keyframes drawer-in{from{transform:translateX(100%)}to{transform:translateX(0)}} @keyframes shimmer{to{background-position:-200% 0}}'}</style>
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

/* ── Util progress bar ── */
const UtilBar = ({ value, color, dark }) => (
  <div style={{ height:5, background:dark?'#334155':'#F2F4F7', borderRadius:99, overflow:'hidden', marginTop:5 }}>
    <div style={{ width:`${Math.min(100,value)}%`, height:'100%', background:color, borderRadius:99, transition:'width 0.6s ease' }} />
  </div>
);

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

export default function KpiDashboardPage() {
  const { user }    = useAuth();
  const { isDark }  = useTheme();
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [period, setPeriod]     = useState('today');
  const [branchFilter, setBranchFilter] = useState('all');
  const [sortBy, setSortBy]     = useState('revenue');
  const [sortDir, setSortDir]   = useState('desc');
  const [detailBranch, setDetailBranch] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/kpi/summary')
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Derived data ── */
  const branches = data?.branches || [];
  const summary  = data?.summary  || {};

  // Pick the right revenue field based on period
  const revKey = period === 'today' ? 'revenue_today' : period === 'week' ? 'revenue_week' : 'revenue_month';

  const enriched = branches.map(b => ({ ...b, _revenue: Number(b[revKey] || 0) }));

  const filtered = branchFilter === 'all'
    ? enriched
    : enriched.filter(b => String(b.id) === branchFilter);

  const sorted = [...filtered].sort((a, b) => {
    const av = sortBy === 'revenue' ? a._revenue : sortBy === 'appointments' ? a.appointments_today : a.utilization_rate;
    const bv = sortBy === 'revenue' ? b._revenue : sortBy === 'appointments' ? b.appointments_today : b.utilization_rate;
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const totalRevenue  = filtered.reduce((s, b) => s + b._revenue, 0);
  const totalAppts    = filtered.reduce((s, b) => s + (b.appointments_today || 0), 0);
  const totalWalkins  = filtered.reduce((s, b) => s + (b.walkin_today || 0), 0);
  const totalCustomers= filtered.reduce((s, b) => s + (b.customer_count || 0), 0);

  const handleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(key); setSortDir('desc'); }
  };
  const SortIco = ({ col }) => sortBy !== col
    ? <span style={{ opacity:0.3, fontSize:10, marginLeft:3 }}>⇅</span>
    : <span style={{ fontSize:10, marginLeft:3, color:isDark?'#93C5FD':'#2563EB' }}>{sortDir==='desc'?'↓':'↑'}</span>;

  const chartData = sorted.map(b => ({
    name: b.name?.length > 12 ? b.name.slice(0,12)+'…' : b.name,
    Revenue: b._revenue,
    Appts: b.appointments_today || 0,
    'Walk-ins': b.walkin_today || 0,
  }));

  const C = { border: isDark?'#334155':'#EAECF0', card: isDark?'#111827':'#fff', text: isDark?'#E2E8F0':'#101828', sub: isDark?'#94A3B8':'#667085', muted: isDark?'#64748B':'#98A2B3', hover: isDark?'#1E293B':'#F8FAFF' };

  return (
    <PageWrapper title="Multi-Branch KPI Dashboard" subtitle="Real-time performance metrics across all branches"
      actions={
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          {PERIODS.map(({ k, label }) => (
            <button key={k} onClick={() => setPeriod(k)}
              style={{ padding:'7px 16px', borderRadius:20, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif", transition:'all 0.15s', background:period===k?(isDark?'#2563EB':'linear-gradient(135deg,#2563EB,#3B82F6)'):(isDark?'#1E293B':'#F9FAFB'), color:period===k?'#fff':(isDark?'#CBD5E1':'#667085'), border:period===k?'none':`1.5px solid ${C.border}`, boxShadow:period===k?'0 2px 8px rgba(37,99,235,0.25)':'none' }}>
              {label}
            </button>
          ))}
          <button onClick={load}
            style={{ width:34, height:34, borderRadius:9, border:`1.5px solid ${C.border}`, background:C.card, color:C.sub, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <IconRefresh />
          </button>
        </div>
      }>

      {/* ── Stat Cards ── */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        <StatCard label="Revenue" value={Rs(totalRevenue)} color="#2563EB" dark={isDark} icon={<IconTrend />} />
        <StatCard label="Appointments" value={totalAppts} color="#059669" dark={isDark} icon={<IconCal />} />
        <StatCard label="Walk-ins" value={totalWalkins} color="#D97706" dark={isDark} icon={<IconUser />} />
        <StatCard label="Customers" value={totalCustomers.toLocaleString()} color="#7C3AED" dark={isDark} icon={<IconUser />} />
        <StatCard label="Branches" value={filtered.length} color="#0891B2" dark={isDark} icon={<IconBranch />} />
      </div>

      {/* ── Hero Banner ── */}
      <div style={{ background:'linear-gradient(135deg,#0F172A 0%,#1E40AF 50%,#2563EB 100%)', borderRadius:18, padding:'28px 32px', boxShadow:'0 8px 32px rgba(37,99,235,0.22)', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.06)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-30, right:80, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.04)', pointerEvents:'none' }} />
        <div style={{ position:'relative', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:16 }}>
          <div>
            <span style={{ display:'inline-flex', alignItems:'center', background:'rgba(255,255,255,0.18)', color:'#fff', fontSize:11, fontWeight:800, letterSpacing:'0.07em', textTransform:'uppercase', padding:'4px 12px', borderRadius:99, border:'1px solid rgba(255,255,255,0.25)', fontFamily:"'Inter',sans-serif" }}>
              {PERIODS.find(p=>p.k===period)?.label}
            </span>
            <h2 style={{ margin:'12px 0 2px', fontSize:28, fontWeight:900, color:'#fff', lineHeight:1.1, fontFamily:"'Sora','Manrope',sans-serif", letterSpacing:'-0.5px' }}>{Rs(totalRevenue)}</h2>
            <p style={{ margin:0, fontSize:13.5, color:'rgba(255,255,255,0.72)', fontFamily:"'Inter',sans-serif" }}>
              {totalAppts} appointments · {totalWalkins} walk-ins · {filtered.length} branches
            </p>
            <div style={{ marginTop:16, maxWidth:360 }}>
              <div style={{ height:6, background:'rgba(255,255,255,0.2)', borderRadius:99, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${Math.min(100,totalAppts>0?Math.round((totalAppts/(totalAppts+10))*100):0)}%`, background:'rgba(255,255,255,0.85)', borderRadius:99, transition:'width 0.8s ease' }} />
              </div>
            </div>
          </div>
          <div style={{ background:totalRevenue>0?'rgba(16,185,129,0.2)':'rgba(255,255,255,0.15)', border:totalRevenue>0?'1px solid rgba(16,185,129,0.5)':'1px solid rgba(255,255,255,0.3)', borderRadius:99, padding:'6px 16px', fontSize:12, fontWeight:700, color:'#fff', textTransform:'uppercase', letterSpacing:'0.06em', fontFamily:"'Inter',sans-serif", alignSelf:'flex-start' }}>
            {totalRevenue>0?'Active':'No Data'}
          </div>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:'12px 16px', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', boxShadow:isDark?'0 8px 20px rgba(2,6,23,0.35)':'0 1px 4px rgba(16,24,40,0.04)' }}>
        <span style={{ fontSize:12, fontWeight:700, color:C.sub, fontFamily:"'Inter',sans-serif", flexShrink:0 }}>Branch:</span>
        {[{id:'all',name:'All Branches'},...branches].map(b => {
          const active = branchFilter === String(b.id);
          return (
            <button key={b.id} onClick={() => setBranchFilter(String(b.id))}
              style={{ padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:active?700:500, cursor:'pointer', fontFamily:"'Inter',sans-serif", transition:'all 0.15s', background:active?(isDark?'#2563EB':'#EFF6FF'):(isDark?'#0F172A':'#F9FAFB'), color:active?'#2563EB':(isDark?'#CBD5E1':'#667085'), border:`1.5px solid ${active?'#2563EB':C.border}` }}>
              {b.name}
            </button>
          );
        })}
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          {[{k:'revenue',l:'Revenue'},{k:'appointments',l:'Appts'},{k:'utilization',l:'Utilization'}].map(({k,l}) => (
            <button key={k} onClick={() => handleSort(k)}
              style={{ padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:sortBy===k?700:500, cursor:'pointer', fontFamily:"'Inter',sans-serif", transition:'all 0.15s', background:sortBy===k?(isDark?'#1E3A8A':'#DBEAFE'):(isDark?'#0F172A':'#F9FAFB'), color:sortBy===k?'#2563EB':(isDark?'#94A3B8':'#667085'), border:`1.5px solid ${sortBy===k?'#93C5FD':C.border}` }}>
              {l}<SortIco col={k} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Bar Chart ── */}
      {!loading && chartData.length > 1 && (
        <div style={{ background:C.card, borderRadius:16, border:`1px solid ${C.border}`, padding:'22px 20px', boxShadow:isDark?'0 8px 20px rgba(2,6,23,0.35)':'0 1px 4px rgba(16,24,40,0.04)' }}>
          <div style={{ fontSize:15, fontWeight:800, color:C.text, marginBottom:18, fontFamily:"'Sora','Manrope',sans-serif" }}>Branch Comparison</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top:0, right:16, left:0, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark?'#334155':'#F2F4F7'} />
              <XAxis dataKey="name" tick={{ fontSize:11, fill:isDark?'#94A3B8':'#667085', fontFamily:"'Inter',sans-serif" }} />
              <YAxis tick={{ fontSize:11, fill:isDark?'#94A3B8':'#667085', fontFamily:"'Inter',sans-serif" }} tickFormatter={v => v>=1000?`${(v/1000).toFixed(0)}k`:v} />
              <Tooltip formatter={(v,n) => [n==='Revenue'?Rs(v):v, n]}
                contentStyle={{ borderRadius:10, border:`1.5px solid ${C.border}`, boxShadow:'0 4px 16px rgba(16,24,40,0.1)', fontFamily:"'Inter',sans-serif", fontSize:12, background:C.card, color:C.text }} />
              <Legend iconSize={10} wrapperStyle={{ fontSize:12, fontFamily:"'Inter',sans-serif" }} />
              <Bar dataKey="Revenue" fill="#2563EB" radius={[6,6,0,0]} />
              <Bar dataKey="Appts"   fill="#059669" radius={[6,6,0,0]} />
              <Bar dataKey="Walk-ins" fill="#D97706" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Branch Cards / Table ── */}
      {loading ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ background:C.card, borderRadius:16, border:`1px solid ${C.border}`, padding:22, height:220 }}>
              {[90,60,40,70,50].map((w,j) => <div key={j} style={{ height:14, borderRadius:6, marginBottom:12, width:`${w}%`, background:isDark?'linear-gradient(90deg,#1E293B 25%,#334155 50%,#1E293B 75%)':'linear-gradient(90deg,#F2F4F7 25%,#E8EAED 50%,#F2F4F7 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s infinite' }} />)}
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, border:`2px dashed ${C.border}`, borderRadius:14, fontFamily:"'Inter',sans-serif" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
          <div style={{ fontWeight:700, fontSize:15, color:C.text }}>No branch data</div>
          <div style={{ fontSize:13, marginTop:4, color:C.sub }}>Select a different branch or check that branches are active.</div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
          {sorted.map((b, idx) => {
            const utilColor = b.utilization_rate >= 70 ? '#059669' : b.utilization_rate < 30 ? '#EF4444' : '#D97706';
            const branchColor = b.color || '#2563EB';
            return (
              <div key={b.id}
                style={{ background:C.card, border:`1.5px solid ${C.border}`, borderRadius:16, padding:22, boxShadow:isDark?'0 8px 20px rgba(2,6,23,0.35)':'0 1px 4px rgba(16,24,40,0.04)', transition:'all 0.2s ease', cursor:'default' }}
                onMouseEnter={e => { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow=isDark?'0 16px 32px rgba(2,6,23,0.5)':'0 8px 24px rgba(16,24,40,0.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow=isDark?'0 8px 20px rgba(2,6,23,0.35)':'0 1px 4px rgba(16,24,40,0.04)'; }}>

                {/* Header */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:`${branchColor}18`, border:`1.5px solid ${branchColor}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                      {idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':'🏢'}
                    </div>
                    <div>
                      <div style={{ fontWeight:800, fontSize:14, color:C.text, fontFamily:"'Sora','Manrope',sans-serif" }}>{b.name}</div>
                      <div style={{ fontSize:11, color:C.muted, marginTop:1, fontFamily:"'Inter',sans-serif" }}>Branch #{b.id}</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ background:`${branchColor}14`, border:`1.5px solid ${branchColor}30`, borderRadius:10, padding:'6px 12px', textAlign:'right' }}>
                      <div style={{ fontSize:15, fontWeight:800, color:branchColor, fontFamily:"'Sora','Manrope',sans-serif" }}>{Rs(b._revenue)}</div>
                      <div style={{ fontSize:9, color:branchColor, fontWeight:700, fontFamily:"'Inter',sans-serif", textTransform:'uppercase' }}>{period==='today'?'Today':period==='week'?'Week':'Month'}</div>
                    </div>
                    <ActionBtn onClick={() => setDetailBranch(b)} title="View Details" color="#2563EB"><IconEye /></ActionBtn>
                  </div>
                </div>

                {/* KPI Grid */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                  {[
                    { label:'Appts',     value: b.appointments_today || 0, color:'#059669', bg:'#ECFDF5', dbg:'#059669' + '18' },
                    { label:'Walk-ins',  value: b.walkin_today       || 0, color:'#D97706', bg:'#FFFBEB', dbg:'#D97706' + '18' },
                    { label:'Customers', value: b.customer_count     || 0, color:'#7C3AED', bg:'#F5F3FF', dbg:'#7C3AED' + '18' },
                  ].map(({ label, value, color, bg, dbg }) => (
                    <div key={label} style={{ background:isDark?dbg:bg, borderRadius:10, padding:'10px 6px', textAlign:'center', border:`1px solid ${color}20` }}>
                      <div style={{ fontSize:18, fontWeight:800, color, fontFamily:"'Inter',sans-serif" }}>{value}</div>
                      <div style={{ fontSize:9, color:isDark?color+'cc':color, fontWeight:700, marginTop:2, fontFamily:"'Inter',sans-serif", textTransform:'uppercase', letterSpacing:'0.04em' }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Utilization bar */}
                <div style={{ marginTop:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                    <span style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Inter',sans-serif" }}>Completion Rate</span>
                    <span style={{ fontSize:12, fontWeight:800, color:utilColor }}>{b.utilization_rate || 0}%</span>
                  </div>
                  <UtilBar value={b.utilization_rate || 0} color={utilColor} dark={isDark} />
                </div>

                {/* Appointment breakdown */}
                {b.appointments_breakdown && Object.keys(b.appointments_breakdown).length > 0 && (
                  <div style={{ marginTop:12, display:'flex', gap:4, flexWrap:'wrap' }}>
                    {Object.entries(b.appointments_breakdown).map(([status, count]) => {
                      const sColor = status==='completed'?'#059669':status==='confirmed'?'#2563EB':status==='cancelled'?'#DC2626':status==='in_service'?'#7C3AED':'#D97706';
                      return (
                        <span key={status} style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:`${sColor}14`, color:sColor, border:`1px solid ${sColor}25`, fontFamily:"'Inter',sans-serif", textTransform:'capitalize' }}>
                          {status} {count}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Top staff */}
                {b.top_staff && b.top_staff.length > 0 && (
                  <div style={{ marginTop:14, borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
                    <div style={{ fontSize:10, fontWeight:800, color:C.muted, marginBottom:8, letterSpacing:'0.06em', fontFamily:"'Inter',sans-serif" }}>TOP STAFF</div>
                    {b.top_staff.slice(0,3).map((s, i) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, padding:'5px 0', borderBottom:i<b.top_staff.length-1?`1px solid ${C.border}`:'none', fontFamily:"'Inter',sans-serif" }}>
                        <span style={{ display:'flex', alignItems:'center', gap:7 }}>
                          <span style={{ width:20, height:20, borderRadius:6, background:`${RANK_COLORS[i]}18`, border:`1.5px solid ${RANK_COLORS[i]}35`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:RANK_COLORS[i] }}>{MEDAL[i]}</span>
                          <span style={{ fontWeight:600, color:C.text }}>{s.name}</span>
                        </span>
                        <span style={{ fontWeight:700, color:C.sub, background:isDark?'#1E293B':'#F2F4F7', borderRadius:6, padding:'2px 7px', fontSize:10 }}>{Rs(s.revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Footer ── */}
      <p style={{ margin:0, fontSize:12, color:C.muted, textAlign:'center', fontFamily:"'Inter',sans-serif" }}>
        Live KPI data — click Refresh or switch period to update
      </p>

      {/* ── Branch Detail Drawer ── */}
      <Drawer open={!!detailBranch} onClose={() => setDetailBranch(null)} title={detailBranch?.name || 'Branch Details'} dark={isDark}>
        {detailBranch && (
          <div style={{ fontFamily:"'Inter',sans-serif" }}>
            <div style={{ background:isDark?'#1E293B':'#F9FAFB', borderRadius:12, padding:16, marginBottom:20, border:isDark?'1px solid #334155':'none' }}>
              <div style={{ fontSize:22, fontWeight:800, color:isDark?'#E2E8F0':'#101828' }}>{Rs(detailBranch._revenue)}</div>
              <div style={{ fontSize:12, color:isDark?'#94A3B8':'#98A2B3', marginTop:2 }}>{PERIODS.find(p=>p.k===period)?.label} Revenue</div>
            </div>
            {[
              { label:'Revenue Today',     value: Rs(detailBranch.revenue_today) },
              { label:'Revenue This Week', value: Rs(detailBranch.revenue_week) },
              { label:'Revenue This Month',value: Rs(detailBranch.revenue_month) },
              { label:'Appointments Today',value: detailBranch.appointments_today || 0 },
              { label:'Walk-ins Today',    value: detailBranch.walkin_today || 0 },
              { label:'Total Customers',   value: detailBranch.customer_count || 0 },
              { label:'Transactions (week)',value: detailBranch.tx_week || 0 },
              { label:'Completion Rate',   value: `${detailBranch.utilization_rate || 0}%` },
            ].map(({label,value}) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 0', borderBottom:`1px solid ${isDark?'#334155':'#F2F4F7'}` }}>
                <span style={{ fontSize:12, color:isDark?'#94A3B8':'#98A2B3', fontWeight:600 }}>{label}</span>
                <span style={{ fontSize:14, fontWeight:700, color:isDark?'#E2E8F0':'#101828' }}>{value}</span>
              </div>
            ))}
            {detailBranch.appointments_breakdown && Object.keys(detailBranch.appointments_breakdown).length > 0 && (
              <div style={{ marginTop:20 }}>
                <div style={{ fontSize:11, fontWeight:800, color:isDark?'#94A3B8':'#98A2B3', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Appointment Breakdown (Today)</div>
                {Object.entries(detailBranch.appointments_breakdown).map(([status, count]) => {
                  const sColor = status==='completed'?'#059669':status==='confirmed'?'#2563EB':status==='cancelled'?'#DC2626':status==='in_service'?'#7C3AED':'#D97706';
                  return (
                    <div key={status} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:`1px solid ${isDark?'#334155':'#F2F4F7'}` }}>
                      <span style={{ fontSize:13, fontWeight:600, color:sColor, textTransform:'capitalize' }}>{status.replace('_',' ')}</span>
                      <span style={{ fontSize:13, fontWeight:700, color:isDark?'#E2E8F0':'#101828' }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {detailBranch.top_staff?.length > 0 && (
              <div style={{ marginTop:20 }}>
                <div style={{ fontSize:11, fontWeight:800, color:isDark?'#94A3B8':'#98A2B3', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Top Performers (This Month)</div>
                {detailBranch.top_staff.map((s, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:i<detailBranch.top_staff.length-1?`1px solid ${isDark?'#334155':'#F2F4F7'}`:'none' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:18 }}>{MEDAL[i]||'🏅'}</span>
                      <span style={{ fontWeight:600, color:isDark?'#E2E8F0':'#344054', fontSize:14 }}>{s.name}</span>
                    </span>
                    <span style={{ fontWeight:700, color:'#2563EB', fontSize:13 }}>{Rs(s.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </PageWrapper>
  );
}
