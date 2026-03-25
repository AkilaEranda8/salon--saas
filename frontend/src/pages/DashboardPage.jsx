import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { useAuth }       from '../context/AuthContext';
import api               from '../api/axios';
import PageWrapper       from '../components/layout/PageWrapper';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useToast }      from '../components/ui/Toast';
import { Select }        from '../components/ui/FormElements';

/*  helpers  */
const fmt   = n => `Rs. ${Number(n || 0).toLocaleString()}`;
const fmtN  = n => Number(n || 0).toLocaleString();
const today = () => new Date().toISOString().slice(0, 10);

/* design tokens */
const G900 = '#1B3A2D';   /* dark forest green – primary */
const G700 = '#2D6A4F';   /* mid green */
const G100 = '#D1FAE5';   /* light green tint */
const PAGE_BG = '#F0F2EF';

const STATUS_COLOR = {
  pending:   { dot: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  confirmed: { dot: '#3B82F6', bg: '#DBEAFE', text: '#1E40AF' },
  completed: { dot: '#10B981', bg: '#D1FAE5', text: '#065F46' },
  cancelled: { dot: '#EF4444', bg: '#FEE2E2', text: '#991B1B' },
};

const PIE_COLORS   = ['#F59E0B', '#3B82F6', '#10B981', '#EF4444'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/*─── sub-components ────────────────────────────────────────────*/

function Sk({ h = 20, w = '100%', mb = 0 }) {
  return <div style={{ height: h, width: w, background: '#E5E7EB', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite', marginBottom: mb }} />;
}

/* Featured (dark-green) KPI – first card */
function FeaturedKpi({ label, value, sub, loading }) {
  return (
    <div style={{
      background: G900, borderRadius: 18, padding: '22px 22px 18px',
      color: '#fff', position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ position:'absolute', top:-24, right:-24, width:110, height:110, borderRadius:'50%', background:'rgba(255,255,255,0.07)' }} />
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.75 }}>{label}</span>
        <span style={{ background:'rgba(255,255,255,0.15)', borderRadius:'50%', width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>↗</span>
      </div>
      {loading
        ? <div style={{ height:32, width:'55%', background:'rgba(255,255,255,0.2)', borderRadius:6 }} />
        : <div style={{ fontSize:32, fontWeight:800, letterSpacing:'-1.5px', lineHeight:1.1 }}>{value}</div>
      }
      {sub && !loading && (
        <div style={{ fontSize:11, opacity:0.65, display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ background:'rgba(255,255,255,0.18)', borderRadius:10, padding:'2px 8px' }}>↑ {sub}</span>
        </div>
      )}
    </div>
  );
}

/* Regular KPI card */
function KpiCard({ label, value, sub, loading }) {
  return (
    <div style={{
      background:'#fff', borderRadius:18, padding:'22px 22px 18px',
      display:'flex', flexDirection:'column', gap:7,
      boxShadow:'0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <span style={{ fontSize:13, fontWeight:600, color:'#6B7280' }}>{label}</span>
        <span style={{ border:'1.5px solid #E5E7EB', borderRadius:'50%', width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'#9CA3AF' }}>↗</span>
      </div>
      {loading
        ? <Sk h={28} w="60%" />
        : <div style={{ fontSize:28, fontWeight:800, color:'#111827', letterSpacing:'-0.5px', lineHeight:1.1 }}>{value}</div>
      }
      {sub && !loading && (
        <div style={{ fontSize:11, color:'#9CA3AF', display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ width:14, height:14, background:G100, borderRadius:3, display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, color:G700 }}>↑</span>
          {sub}
        </div>
      )}
    </div>
  );
}

/* Generic card shell */
function Card({ children, style }) {
  return (
    <div style={{ background:'#fff', borderRadius:18, padding:'20px 22px', boxShadow:'0 1px 4px rgba(0,0,0,0.05)', ...style }}>
      {children}
    </div>
  );
}

function CardHead({ title, action }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
      <span style={{ fontSize:15, fontWeight:700, color:'#111827' }}>{title}</span>
      {action}
    </div>
  );
}

/* bar tooltip */
function BarTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:10, padding:'8px 12px', fontSize:12, boxShadow:'0 4px 12px rgba(0,0,0,.08)' }}>
      <div style={{ fontWeight:700, color:'#111827', marginBottom:4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.fill || p.stroke }}>Rs. {Number(p.value).toLocaleString()}</div>
      ))}
    </div>
  );
}

/*  main component  */
export default function DashboardPage() {
  const { user }        = useAuth();
  const navigate        = useNavigate();
  const { toast }       = useToast();
  const { isMobile }    = useBreakpoint();
  const isAdmin         = ['superadmin','admin','manager','staff'].includes(user?.role);
  const refreshTimerRef = useRef(null);

  /* state */
  const [stats,       setStats]       = useState(null);
  const [appts,       setAppts]       = useState([]);
  const [reminders,   setReminders]   = useState([]);
  const [services,    setServices]    = useState([]);
  const [branches,    setBranches]    = useState([]);
  const [branchId,    setBranchId]    = useState('');
  const [revenueData, setRevenueData] = useState([]);
  const [apptStatus,  setApptStatus]  = useState([]);
  const [staffData,   setStaffData]   = useState([]);
  const [loading,     setLoading]     = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const bq    = branchId ? `?branchId=${branchId}` : '';
      const bqAmp = branchId ? `&branchId=${branchId}` : '';

      const [dashRes, apptRes, remRes, svcRes, revRes, statusRes, staffRes] = await Promise.all([
        api.get(`/reports/dashboard${bq}`),
        api.get(`/appointments?limit=8&date=${today()}${bqAmp}&sort=time&order=asc`),
        api.get(`/reminders?done=false&limit=6${bqAmp}`),
        api.get(`/reports/services${bq}`),
        api.get(`/reports/revenue${bq}`),
        api.get(`/reports/appointments${bq}`),
        api.get(`/reports/staff${bq}`),
      ]);

      setStats(dashRes.data);
      setAppts(apptRes.data.data || apptRes.data || []);
      setReminders(Array.isArray(remRes.data) ? remRes.data.slice(0,6) : (remRes.data?.data||[]).slice(0,6));
      setServices((svcRes.data||[]).slice(0,8));

      /* revenue chart  last 7 months */
      const revRaw = Array.isArray(revRes.data) ? revRes.data : [];
      const revChart = revRaw.slice(-7).map(r => ({
        month: r.month ? MONTHS_SHORT[parseInt(r.month.split('-')[1],10)-1] : '',
        revenue: Number(r.revenue || r.dataValues?.revenue || 0),
        commission: Number(r.commission || r.dataValues?.commission || 0),
      }));
      setRevenueData(revChart);

      /* pie data */
      const statusRaw = Array.isArray(statusRes.data) ? statusRes.data : [];
      const pie = statusRaw.map(s => ({
        name: (s.status||s.dataValues?.status||'').charAt(0).toUpperCase() + (s.status||s.dataValues?.status||'').slice(1),
        value: Number(s.count||s.dataValues?.count||0),
      }));
      setApptStatus(pie);

      /* staff leaderboard top 5 */
      const staffRaw = Array.isArray(staffRes.data) ? staffRes.data : [];
      const topped = staffRaw
        .map(s => ({
          id:         s.id,
          name:       s.name,
          revenue:    Number(s.dataValues?.totalRevenue || s.totalRevenue || 0),
          commission: Number(s.dataValues?.totalCommission || s.totalCommission || 0),
          appts:      Number(s.dataValues?.apptCount || s.apptCount || 0),
          branch:     s.branch?.name || '',
        }))
        .sort((a,b) => b.revenue - a.revenue)
        .slice(0,5);
      setStaffData(topped);

    } catch (e) {
      if (!silent) toast('Failed to load dashboard.', 'error');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isAdmin) api.get('/branches').then(r => setBranches(r.data.data||r.data||[])).catch(()=>{});
  }, [isAdmin]);

  /* auto-refresh every 3 min */
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => load(true), 180000);
    return () => clearInterval(refreshTimerRef.current);
  }, [load]);

  /* derived */
  const branchStats     = stats?.branchStats || [];
  const nextReminder    = reminders[0];
  const totalAppts      = apptStatus.reduce((s, x) => s + x.value, 0) || 1;
  const completedPct    = Math.round(((apptStatus.find(x => x.name === 'Completed')?.value || 0) / totalAppts) * 100);

  const linkBtn = (label, path, pill) => (
    <button
      onClick={() => navigate(path)}
      style={{
        fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
        background: pill ? G100 : 'none',
        color: pill ? G700 : '#9CA3AF',
        padding: pill ? '5px 12px' : 0,
        borderRadius: pill ? 8 : 0,
      }}
    >{label}</button>
  );

  return (
    <PageWrapper
      title={`Welcome, ${user?.name?.split(' ')[0] || 'there'} 👋`}
      subtitle={`${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} — auto-refreshes every 3 min`}
      actions={
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          {isAdmin && branches.length > 0 && (
            <Select value={branchId} onChange={e => setBranchId(e.target.value)} style={{ width:160, borderRadius:10 }}>
              <option value="">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )}
          <button
            onClick={() => navigate('/appointments')}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 18px', borderRadius:12, background:G900, color:'#fff', border:'none', cursor:'pointer', fontSize:13, fontWeight:700 }}
          >+ New Appointment</button>
          <button
            onClick={() => load()}
            style={{ padding:'10px 16px', borderRadius:12, background:'#fff', color:'#374151', border:'1.5px solid #E5E7EB', cursor:'pointer', fontSize:13, fontWeight:600 }}
          >↻ Refresh</button>
        </div>
      }
    >

      {/* ── Row 1: KPI tiles ──────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap:14 }}>
        <FeaturedKpi label="Today's Appointments" value={stats ? fmtN(stats.todayAppts) : '—'}       sub="Bookings today"  loading={loading} />
        <KpiCard     label="Today's Revenue"      value={stats ? fmt(stats.todayRevenue)  : '—'}      sub="Collected today" loading={loading} />
        <KpiCard     label="Month Revenue"         value={stats ? fmt(stats.monthRevenue)  : '—'}      sub="This month"      loading={loading} />
        <KpiCard     label="Total Customers"       value={stats ? fmtN(stats.totalCustomers) : '—'}   sub="All time"        loading={loading} />
      </div>

      {/* ── Row 2: Bar chart  |  Reminder  |  Today's schedule ── */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1.05fr 1.05fr', gap:14 }}>

        {/* Revenue bar chart */}
        <Card>
          <CardHead title="Revenue Analytics" action={linkBtn('View Reports →', '/reports', true)} />
          {loading ? <Sk h={200} /> : revenueData.length === 0 ? (
            <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF', fontSize:13 }}>No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={revenueData} margin={{ top:5, right:5, left:-10, bottom:0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<BarTip />} cursor={{ fill:'#F9FAFB' }} />
                <Bar dataKey="revenue" name="Revenue" radius={[6,6,0,0]}>
                  {revenueData.map((_,i) => (
                    <Cell key={i} fill={
                      i === revenueData.length-1 ? G700 :
                      i === revenueData.length-2 ? G900 : '#C7DDD0'
                    } />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Reminder featured card */}
        <Card style={{ display:'flex', flexDirection:'column' }}>
          <CardHead title="Reminders" action={linkBtn('All →', '/reminders', false)} />
          {loading ? (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <Sk h={16} w="80%" /><Sk h={16} w="60%" /><Sk h={40} mb={0} />
            </div>
          ) : nextReminder ? (
            <div style={{ display:'flex', flexDirection:'column', gap:10, flex:1 }}>
              <div style={{ background:'#F6FAF8', borderRadius:12, padding:'14px 16px', flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700, color:'#111827', marginBottom:5, lineHeight:1.35 }}>{nextReminder.title}</div>
                {nextReminder.due_date && (
                  <div style={{ fontSize:12, color:'#6B7280' }}>📅 Due: {nextReminder.due_date}</div>
                )}
                {nextReminder.priority && (
                  <div style={{ marginTop:8 }}>
                    <span style={{
                      fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:700,
                      background: nextReminder.priority==='high'?'#FEE2E2':nextReminder.priority==='medium'?'#FEF3C7':'#D1FAE5',
                      color:      nextReminder.priority==='high'?'#991B1B':nextReminder.priority==='medium'?'#92400E':'#065F46',
                    }}>{nextReminder.priority.charAt(0).toUpperCase()+nextReminder.priority.slice(1)} Priority</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => navigate('/reminders')}
                style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'12px', borderRadius:12, background:G900, color:'#fff', border:'none', cursor:'pointer', fontSize:13, fontWeight:700 }}
              >📋 View Reminders</button>
              {reminders.length > 1 && (
                <div style={{ fontSize:11, color:'#9CA3AF', textAlign:'center' }}>+{reminders.length-1} more</div>
              )}
            </div>
          ) : (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, color:'#9CA3AF' }}>
              <span style={{ fontSize:32 }}>✅</span>
              <span style={{ fontSize:13 }}>All caught up!</span>
              <button onClick={() => navigate('/reminders')} style={{ marginTop:8, padding:'10px 20px', borderRadius:12, background:G900, color:'#fff', border:'none', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                + Add Reminder
              </button>
            </div>
          )}
        </Card>

        {/* Today's schedule mini */}
        <Card>
          <CardHead title="Today's Schedule" action={linkBtn('+ New', '/appointments', true)} />
          {loading ? (
            [1,2,3,4].map(i => <Sk key={i} h={46} mb={8} />)
          ) : appts.length === 0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:'#9CA3AF', fontSize:13 }}>No appointments today</div>
          ) : appts.slice(0,5).map(a => {
            const sc = STATUS_COLOR[a.status] || STATUS_COLOR.pending;
            return (
              <div key={a.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #F9FAFB' }}>
                <div style={{ width:36, height:36, borderRadius:10, background:G900+'18', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13, color:G900, flexShrink:0 }}>
                  {a.customer?.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.customer?.name || 'Customer'}</div>
                  <div style={{ fontSize:11, color:'#9CA3AF' }}>{a.service?.name || ''} · {a.time || ''}</div>
                </div>
                <span style={{ fontSize:10, padding:'3px 8px', borderRadius:20, background:sc.bg, color:sc.text, fontWeight:700, flexShrink:0, textTransform:'capitalize' }}>
                  {a.status}
                </span>
              </div>
            );
          })}
        </Card>
      </div>

      {/* ── Row 3: Team  |  Status donut  |  Top Services ──── */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr', gap:14 }}>

        {/* Team / Staff leaderboard */}
        <Card>
          <CardHead
            title="Team Performance"
            action={
              <button onClick={() => navigate('/staff')} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:10, background:'#F3F4F6', border:'none', cursor:'pointer', fontSize:12, fontWeight:700, color:'#374151' }}>
                + Add Member
              </button>
            }
          />
          {loading ? (
            [1,2,3,4].map(i => <Sk key={i} h={52} mb={8} />)
          ) : staffData.length === 0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:'#9CA3AF', fontSize:13 }}>No staff data</div>
          ) : staffData.map((s, i) => {
            const badge = i === 0
              ? { bg:'#D1FAE5', text:'#065F46', label:'Top Earner' }
              : { bg:'#DBEAFE', text:'#1E40AF', label:'Active' };
            return (
              <div key={s.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:12, background: i===0 ? '#F0F9F4' : '#F9FAFB', marginBottom:8 }}>
                <div style={{ width:38, height:38, borderRadius:'50%', background: i===0 ? G900 : '#E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:14, color: i===0 ? '#fff' : '#374151', flexShrink:0 }}>
                  {s.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name}</div>
                  <div style={{ fontSize:11, color:'#9CA3AF' }}>{s.appts} appointments · {s.branch || 'All branches'}</div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#111827' }}>Rs. {s.revenue.toLocaleString()}</div>
                  <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:badge.bg, color:badge.text, fontWeight:700 }}>{badge.label}</span>
                </div>
              </div>
            );
          })}
        </Card>

        {/* Appointment status donut */}
        <Card style={{ display:'flex', flexDirection:'column' }}>
          <CardHead title="Appointment Status" />
          {loading ? <Sk h={160} /> : apptStatus.length === 0 ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF', fontSize:13 }}>No data</div>
          ) : (
            <>
              <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={apptStatus} cx="50%" cy="50%" innerRadius={44} outerRadius={66} paddingAngle={4} dataKey="value" startAngle={90} endAngle={-270}>
                      {apptStatus.map((_,i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => [v, 'Count']} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position:'absolute', textAlign:'center', pointerEvents:'none' }}>
                  <div style={{ fontSize:22, fontWeight:800, color:'#111827' }}>{completedPct}%</div>
                  <div style={{ fontSize:10, color:'#9CA3AF', marginTop:1 }}>Completed</div>
                </div>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:10 }}>
                {apptStatus.map((s,i) => (
                  <div key={s.name} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#6B7280' }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:PIE_COLORS[i % PIE_COLORS.length], display:'inline-block' }} />
                    {s.name}
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Top Services */}
        <Card>
          <CardHead title="Top Services" action={linkBtn('All →', '/services', false)} />
          {loading ? (
            [1,2,3,4,5].map(i => <Sk key={i} h={36} mb={8} />)
          ) : services.length === 0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:'#9CA3AF', fontSize:13 }}>No data</div>
          ) : services.slice(0,5).map((s,i) => {
            const rev    = Number(s.revenue || s.dataValues?.revenue || 0);
            const maxRev = Number(services[0]?.revenue || services[0]?.dataValues?.revenue || 1);
            const pct    = Math.round((rev / maxRev) * 100);
            return (
              <div key={s.service_id || s.id || i} style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'60%' }}>{s.service?.name || s.name || ''}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:G700 }}>Rs. {rev.toLocaleString()}</span>
                </div>
                <div style={{ height:6, background:'#F3F4F6', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${G900},${G700})`, borderRadius:4, transition:'width 0.6s ease' }} />
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {/* ── Row 4: Recent Appointments table ─────────────── */}
      <Card style={{ padding:0, overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 22px', borderBottom:'1px solid #F3F4F6' }}>
          <span style={{ fontSize:15, fontWeight:700, color:'#111827' }}>Recent Appointments</span>
          {linkBtn('View all →', '/appointments', true)}
        </div>
        <div style={{ padding:'0 22px 22px' }}>
          {loading ? (
            <Sk h={120} mb={0} />
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, fontFamily:"'Inter',sans-serif" }}>
                <thead>
                  <tr>
                    {['Customer','Service','Staff','Date','Time','Status','Amount'].map(h => (
                      <th key={h} style={{ padding:'12px 10px', textAlign:'left', fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'2px solid #F3F4F6', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {appts.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding:'24px 0', textAlign:'center', color:'#9CA3AF' }}>No appointments today</td></tr>
                  ) : appts.map(a => {
                    const sc = STATUS_COLOR[a.status] || STATUS_COLOR.pending;
                    return (
                      <tr key={a.id} style={{ borderBottom:'1px solid #F9FAFB', transition:'background .1s' }}
                        onMouseEnter={e => e.currentTarget.style.background='#F6FAF8'}
                        onMouseLeave={e => e.currentTarget.style.background=''}
                      >
                        <td style={{ padding:'11px 10px', fontWeight:600, color:'#111827' }}>{a.customer?.name || ''}</td>
                        <td style={{ padding:'11px 10px', color:'#374151' }}>{a.service?.name || ''}</td>
                        <td style={{ padding:'11px 10px', color:'#6B7280' }}>{a.staff?.name || ''}</td>
                        <td style={{ padding:'11px 10px', color:'#6B7280', whiteSpace:'nowrap' }}>{a.date || ''}</td>
                        <td style={{ padding:'11px 10px', color:'#6B7280' }}>{a.time || ''}</td>
                        <td style={{ padding:'11px 10px' }}>
                          <span style={{ fontSize:11, padding:'4px 10px', borderRadius:20, background:sc.bg, color:sc.text, fontWeight:700, textTransform:'capitalize' }}>{a.status}</span>
                        </td>
                        <td style={{ padding:'11px 10px', fontWeight:700, color:G700, whiteSpace:'nowrap' }}>
                          {a.payment ? fmt(a.payment.total_amount) : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Branch Performance (admin only) */}
      {isAdmin && branchStats.length > 0 && (
        <Card>
          <CardHead title="Branch Performance" action={linkBtn('Manage →', '/branches', true)} />
          <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}>
            {branchStats.map(b => {
              const rev  = Number(b.dataValues?.monthRevenue   || b.monthRevenue   || 0);
              const apts = Number(b.dataValues?.todayAppts     || b.todayAppts     || 0);
              const com  = Number(b.dataValues?.monthCommission|| b.monthCommission|| 0);
              return (
                <div key={b.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'#F6FAF8', borderRadius:12 }}>
                  <div style={{ width:42, height:42, borderRadius:12, background:G900, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>🏢</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#111827' }}>{b.name}</div>
                    <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{apts} appt{apts!==1?'s':''} today</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:G700 }}>{fmt(rev)}</div>
                    <div style={{ fontSize:10, color:'#9CA3AF' }}>comm. {fmt(com)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1}50%{opacity:.45} }`}</style>
    </PageWrapper>
  );
}

