import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { useToast } from '../components/ui/Toast';
import AiInsightsPanel from '../components/ui/AiInsightsPanel';
import {
  IconPlus, IconDollar, IconCalendar, IconCheck, IconBell,
  StatCard, FilterBar, SearchBar, DataTable,
} from '../components/ui/PageKit';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

/* ── Constants ─────────────────────────────────────────────── */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const PIE_COLORS = ['#2563EB','#10b981','#F59E0B','#EF4444','#7C3AED','#0284C7','#D97706','#059669'];
const TABS = [
  { key:'overview',  label:'Overview' },
  { key:'revenue',   label:'Revenue' },
  { key:'services',  label:'Services' },
  { key:'staff',     label:'Staff' },
  { key:'customers', label:'Customers' },
  { key:'expenses',  label:'Expenses' },
];
const S = { fontFamily:"'Inter',sans-serif" };

/* ── Helpers ───────────────────────────────────────────────── */
const fmt = v => `Rs. ${Number(v||0).toLocaleString()}`;
const fmtK = v => `${(v/1000).toFixed(v>=10000?0:1)}k`;
const pct = (a,b) => b>0 ? ((a/b)*100).toFixed(1)+'%' : '0%';

function Card({ title, children, style: extra }) {
  return (
    <div style={{ background:'#fff', borderRadius:16, padding:24, border:'1px solid #E4E7EC', display:'flex', flexDirection:'column', gap:16, ...extra }}>
      {title && <div style={{ fontSize:15, fontWeight:700, color:'#101828', ...S }}>{title}</div>}
      {children}
    </div>
  );
}

const CTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#fff', border:'1px solid #E4E7EC', borderRadius:10, padding:'10px 14px', boxShadow:'0 4px 16px rgba(0,0,0,0.1)' }}>
      <div style={{ fontSize:12, fontWeight:700, color:'#64748B', marginBottom:4, ...S }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ fontSize:13, fontWeight:600, color:p.color, ...S }}>
          {p.name}: {fmt(p.value)}
        </div>
      ))}
    </div>
  );
};

/* ── Download Icon ───────────────────── */
const IconDownload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const IconChart = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
);

/* ── Main Page ─────────────────────────────────────────────── */
export default function ReportsPage() {
  const { user }  = useAuth();
  const toast     = useToast();
  const isAdmin   = ['superadmin','admin'].includes(user?.role);

  const today    = new Date().toISOString().slice(0,10);
  const curMonth = today.slice(0,7);
  const monthStart = curMonth + '-01';
  const monthEnd   = curMonth + '-31';

  /* ── State ── */
  const [tab, setTab]             = useState('overview');
  const [branchId, setBranchId]   = useState('');
  const [branches, setBranches]   = useState([]);
  const [dateFrom, setDateFrom]   = useState(monthStart);
  const [dateTo, setDateTo]       = useState(monthEnd);
  const [loading, setLoading]     = useState(false);
  const [downloading, setDown]    = useState(false);

  // Data
  const [revenue, setRevenue]     = useState([]);
  const [services, setServices]   = useState([]);
  const [staffRep, setStaffRep]   = useState([]);
  const [apptStats, setApptStats] = useState([]);
  const [expSummary, setExpSummary] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [expenses, setExpenses]   = useState([]);

  /* ── Load branches ── */
  useEffect(() => {
    if (isAdmin) api.get('/branches').then(r => setBranches(r.data.data || r.data || [])).catch(() => {});
  }, [isAdmin]);

  /* ── Load data ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const bq = branchId ? { branchId } : {};
      const month = dateFrom.slice(0,7);
      const year = dateFrom.slice(0,4);

      const results = await Promise.allSettled([
        api.get('/reports/revenue', { params: bq }),
        api.get('/reports/services', { params: { month, ...bq } }),
        api.get('/reports/staff', { params: { month, ...bq } }),
        api.get('/reports/appointments', { params: { month, ...bq } }),
        api.get('/expenses/summary', { params: { year, ...bq } }),
        api.get('/payments', { params: { limit: 500, from: dateFrom, to: dateTo, ...bq } }),
        api.get('/customers', { params: { limit: 500, ...bq } }),
        api.get('/expenses', { params: { limit: 500, from: dateFrom, to: dateTo, ...bq } }),
      ]);

      const val = (i) => results[i].status === 'fulfilled' ? results[i].value.data : null;

      setRevenue(Array.isArray(val(0)) ? val(0) : []);

      const svcRows = Array.isArray(val(1)) ? val(1) : [];
      setServices(svcRows.map(r => ({
        service: r.service?.name || 'Unknown',
        category: r.service?.category || '',
        revenue: Number(r.revenue || r.dataValues?.revenue || 0),
        count: Number(r.count || r.dataValues?.count || 0),
      })));

      const stRows = Array.isArray(val(2)) ? val(2) : [];
      setStaffRep(stRows.map((r, i) => ({
        rank: i + 1,
        name: r.name || r.dataValues?.name || 'Staff',
        branch: r.branch?.name || '',
        commission: Number(r.dataValues?.totalCommission || r.totalCommission || 0),
        revenue: Number(r.dataValues?.totalRevenue || r.totalRevenue || 0),
        appts: Number(r.dataValues?.apptCount || r.apptCount || 0),
      })));

      const aRows = Array.isArray(val(3)) ? val(3) : [];
      setApptStats(aRows.map(r => ({
        name: r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : 'Unknown',
        value: Number(r.dataValues?.count || r.count || 0),
      })));

      setExpSummary(Array.isArray(val(4)) ? val(4) : (val(4)?.data || []));

      const payRaw = val(5);
      // not used directly in charts for now

      const custRaw = val(6);
      setCustomers(Array.isArray(custRaw) ? custRaw : (custRaw?.data || []));

      const expRaw = val(7);
      setExpenses(Array.isArray(expRaw) ? expRaw : (expRaw?.data || []));
    } catch {
      toast('Failed to load report data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [branchId, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  /* ── Download Excel ── */
  const downloadExcel = async () => {
    setDown(true);
    try {
      const params = { from: dateFrom, to: dateTo };
      if (branchId) params.branchId = branchId;
      const res = await api.get('/reports/export', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `HexaSalon_Report_${dateFrom}_${dateTo}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast('Report downloaded!', 'success');
    } catch {
      toast('Download failed.', 'error');
    }
    setDown(false);
  };

  /* ── Chart Data ── */
  const revenueChart = useMemo(() => revenue.map(r => {
    const [, mo] = (r.dataValues?.month || r.month || '').split('-');
    return {
      month: MONTHS[(parseInt(mo,10)-1)] || r.month,
      revenue: Number(r.dataValues?.revenue || r.revenue || 0),
      commission: Number(r.dataValues?.commission || r.commission || 0),
    };
  }), [revenue]);

  const maxSvcRevenue = useMemo(() => services.length > 0 ? Math.max(...services.map(s => s.revenue)) : 1, [services]);

  const revExpData = useMemo(() => {
    const map = {};
    revenueChart.forEach(r => { map[r.month] = { month: r.month, revenue: r.revenue, expenses: 0 }; });
    expSummary.forEach(e => {
      const mo = MONTHS[(parseInt(e.dataValues?.month || e.month || '0',10)-1)] || String(e.month);
      if (map[mo]) map[mo].expenses = Number(e.dataValues?.total || e.total || 0);
    });
    return Object.values(map);
  }, [revenueChart, expSummary]);

  // Totals
  const totalRevenue    = revenueChart.reduce((s,r) => s + r.revenue, 0);
  const totalCommission = revenueChart.reduce((s,r) => s + r.commission, 0);
  const totalExpenses   = revExpData.reduce((s,r) => s + r.expenses, 0);
  const grossProfit     = totalRevenue - totalExpenses;
  const totalAppts      = apptStats.reduce((s,a) => s + a.value, 0);

  // Service category breakdown
  const catBreakdown = useMemo(() => {
    const map = {};
    services.forEach(s => {
      const c = s.category || 'Other';
      if (!map[c]) map[c] = { name: c, revenue: 0, count: 0 };
      map[c].revenue += s.revenue;
      map[c].count += s.count;
    });
    return Object.values(map).sort((a,b) => b.revenue - a.revenue);
  }, [services]);

  // Expense category breakdown
  const expCatBreakdown = useMemo(() => {
    const map = {};
    expenses.forEach(e => {
      const c = e.category || 'Other';
      if (!map[c]) map[c] = { name: c, total: 0, count: 0 };
      map[c].total += Number(e.amount || 0);
      map[c].count += 1;
    });
    return Object.values(map).sort((a,b) => b.total - a.total);
  }, [expenses]);

  const totalExpFromList = expCatBreakdown.reduce((s,e) => s + e.total, 0);

  // Top customers
  const topCustomers = useMemo(() => [...customers].sort((a,b) => Number(b.total_spent||0) - Number(a.total_spent||0)).slice(0,20), [customers]);

  /* ── Tab rendering ── */
  const renderTab = () => {
    switch(tab) {
      case 'overview': return renderOverview();
      case 'revenue': return renderRevenue();
      case 'services': return renderServices();
      case 'staff': return renderStaff();
      case 'customers': return renderCustomers();
      case 'expenses': return renderExpenses();
      default: return null;
    }
  };

  /* ── OVERVIEW TAB ── */
  const renderOverview = () => (
    <>
      {/* KPI Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16 }}>
        <StatCard label="Total Revenue" value={fmt(totalRevenue)} icon={<IconDollar />} color="#2563EB" />
        <StatCard label="Gross Profit" value={fmt(grossProfit)} icon={<IconChart />} color="#059669" />
        <StatCard label="Commission" value={fmt(totalCommission)} icon={<IconDollar />} color="#D97706" />
        <StatCard label="Expenses" value={fmt(totalExpenses)} icon={<IconDollar />} color="#EF4444" />
        <StatCard label="Appointments" value={totalAppts} icon={<IconCalendar />} color="#7C3AED" />
        <StatCard label="Customers" value={customers.length} icon={<IconCheck />} color="#0284C7" />
      </div>

      {/* Charts Grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {/* Revenue Trend */}
        <Card title="Revenue Trend (12 Months)">
          {revenueChart.length === 0
            ? <div style={{ textAlign:'center', padding:'32px 0', color:'#64748B', ...S }}>No data</div>
            : <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={revenueChart} margin={{ top:8, right:8, left:-16, bottom:0 }}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7"/>
                  <XAxis dataKey="month" tick={{ fontSize:11, fill:'#64748B' }}/>
                  <YAxis tick={{ fontSize:11, fill:'#64748B' }} tickFormatter={fmtK}/>
                  <Tooltip content={<CTooltip/>}/>
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#2563EB" strokeWidth={2.5} fill="url(#revFill)"/>
                  <Area type="monotone" dataKey="commission" name="Commission" stroke="#D97706" strokeWidth={2} fill="transparent"/>
                </AreaChart>
              </ResponsiveContainer>
          }
        </Card>

        {/* Appointment Status */}
        <Card title="Appointment Status">
          {apptStats.length === 0
            ? <div style={{ textAlign:'center', padding:'32px 0', color:'#64748B', ...S }}>No data</div>
            : <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={apptStats} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {apptStats.map((_,i) => <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                    </Pie>
                    <Tooltip formatter={v => [v,'']}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
                  {apptStats.map((s,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, ...S }}>
                      <div style={{ width:10, height:10, borderRadius:3, background:PIE_COLORS[i%PIE_COLORS.length], flexShrink:0 }}/>
                      <span style={{ flex:1, color:'#344054' }}>{s.name}</span>
                      <span style={{ fontWeight:700, color:'#101828' }}>{s.value}</span>
                      <span style={{ fontSize:11, color:'#98A2B3' }}>{pct(s.value, totalAppts)}</span>
                    </div>
                  ))}
                </div>
              </div>
          }
        </Card>

        {/* Revenue vs Expenses */}
        <Card title="Revenue vs Expenses">
          {revExpData.length === 0
            ? <div style={{ textAlign:'center', padding:'32px 0', color:'#64748B', ...S }}>No data</div>
            : <ResponsiveContainer width="100%" height={240}>
                <BarChart data={revExpData} margin={{ top:8, right:8, left:-16, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7"/>
                  <XAxis dataKey="month" tick={{ fontSize:11, fill:'#64748B' }}/>
                  <YAxis tick={{ fontSize:11, fill:'#64748B' }} tickFormatter={fmtK}/>
                  <Tooltip content={<CTooltip/>}/>
                  <Legend wrapperStyle={{ fontSize:12 }}/>
                  <Bar dataKey="revenue" name="Revenue" fill="#2563EB" radius={[4,4,0,0]}/>
                  <Bar dataKey="expenses" name="Expenses" fill="#EF4444" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
          }
        </Card>

        {/* Service Category Breakdown */}
        <Card title="Revenue by Category">
          {catBreakdown.length === 0
            ? <div style={{ textAlign:'center', padding:'32px 0', color:'#64748B', ...S }}>No data</div>
            : <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={catBreakdown} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="revenue" nameKey="name">
                      {catBreakdown.map((_,i) => <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                    </Pie>
                    <Tooltip formatter={v => [fmt(v),'']}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
                  {catBreakdown.map((c,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, ...S }}>
                      <div style={{ width:10, height:10, borderRadius:3, background:PIE_COLORS[i%PIE_COLORS.length], flexShrink:0 }}/>
                      <span style={{ flex:1, color:'#344054' }}>{c.name}</span>
                      <span style={{ fontWeight:700, color:'#101828' }}>{fmt(c.revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>
          }
        </Card>
      </div>

      {/* AI Insights */}
      <AiInsightsPanel reportData={{
        revenue:      revenue,
        services:     services,
        staff:        staffRep,
        appointments: apptStats,
        expenses:     expenses,
        customers:    customers,
      }} />
    </>
  );

  /* ── REVENUE TAB ── */
  const renderRevenue = () => (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16 }}>
        <StatCard label="Total Revenue" value={fmt(totalRevenue)} icon={<IconDollar />} color="#2563EB" />
        <StatCard label="Total Commission" value={fmt(totalCommission)} icon={<IconDollar />} color="#D97706" />
        <StatCard label="Total Expenses" value={fmt(totalExpenses)} icon={<IconDollar />} color="#EF4444" />
        <StatCard label="Net Profit" value={fmt(grossProfit - totalCommission)} icon={<IconChart />} color="#059669" />
      </div>

      <Card title="Monthly Revenue & Commission">
        {revenueChart.length === 0
          ? <div style={{ textAlign:'center', padding:'32px 0', color:'#64748B', ...S }}>No data</div>
          : <ResponsiveContainer width="100%" height={320}>
              <BarChart data={revenueChart} margin={{ top:8, right:16, left:-8, bottom:0 }}>
                <defs>
                  <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={1}/><stop offset="100%" stopColor="#7C3AED" stopOpacity={0.7}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7"/>
                <XAxis dataKey="month" tick={{ fontSize:11, fill:'#64748B' }}/>
                <YAxis tick={{ fontSize:11, fill:'#64748B' }} tickFormatter={fmtK}/>
                <Tooltip content={<CTooltip/>}/>
                <Legend wrapperStyle={{ fontSize:12 }}/>
                <Bar dataKey="revenue" name="Revenue" fill="url(#revGrad2)" radius={[6,6,0,0]}/>
                <Bar dataKey="commission" name="Commission" fill="#D97706" radius={[6,6,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
        }
      </Card>

      <Card title="Profit Trend">
        {revExpData.length === 0
          ? <div style={{ textAlign:'center', padding:'32px 0', color:'#64748B', ...S }}>No data</div>
          : <ResponsiveContainer width="100%" height={280}>
              <LineChart data={revExpData.map(d => ({ ...d, profit: d.revenue - d.expenses }))} margin={{ top:8, right:16, left:-8, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7"/>
                <XAxis dataKey="month" tick={{ fontSize:11, fill:'#64748B' }}/>
                <YAxis tick={{ fontSize:11, fill:'#64748B' }} tickFormatter={fmtK}/>
                <Tooltip content={<CTooltip/>}/>
                <Legend wrapperStyle={{ fontSize:12 }}/>
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#2563EB" strokeWidth={2.5} dot={{ r:4 }}/>
                <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#EF4444" strokeWidth={2.5} dot={{ r:4 }}/>
                <Line type="monotone" dataKey="profit" name="Profit" stroke="#059669" strokeWidth={2.5} dot={{ r:4 }} strokeDasharray="5 5"/>
              </LineChart>
            </ResponsiveContainer>
        }
      </Card>
    </>
  );

  /* ── SERVICES TAB ── */
  const svcColumns = useMemo(() => [
    { accessorKey:'service', header:'Service', cell: v => <span style={{ fontWeight:600, color:'#101828', ...S }}>{v.getValue()}</span> },
    { accessorKey:'category', header:'Category', cell: v => <span style={{ padding:'2px 10px', borderRadius:8, fontSize:11, fontWeight:700, background:'#EFF6FF', color:'#2563EB', ...S }}>{v.getValue()||'—'}</span> },
    { accessorKey:'count', header:'Orders', cell: v => <span style={{ fontWeight:700, color:'#344054', ...S }}>{v.getValue()}</span> },
    { accessorKey:'revenue', header:'Revenue', cell: v => <span style={{ fontWeight:700, color:'#059669', ...S }}>{fmt(v.getValue())}</span> },
    { id:'avg', header:'Avg/Order', accessorFn: r => r.count > 0 ? (r.revenue/r.count).toFixed(0) : 0, cell: v => <span style={{ color:'#64748B', ...S }}>{fmt(v.getValue())}</span> },
    { id:'share', header:'Share', accessorFn: r => totalRevenue > 0 ? ((r.revenue/totalRevenue)*100).toFixed(1) : 0, cell: v => (
      <div style={{ display:'flex', alignItems:'center', gap:8, ...S }}>
        <div style={{ width:60, height:6, background:'#F2F4F7', borderRadius:3, overflow:'hidden' }}>
          <div style={{ width:`${Math.min(v.getValue(),100)}%`, height:'100%', background:'#2563EB', borderRadius:3 }}/>
        </div>
        <span style={{ fontSize:11, color:'#64748B' }}>{v.getValue()}%</span>
      </div>
    )},
  ], [totalRevenue]);

  const renderServices = () => (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        <Card title="Top Services">
          <div style={{ display:'flex', flexDirection:'column', gap:10, maxHeight:300, overflowY:'auto' }}>
            {services.slice(0,12).map((s,i) => {
              const p = maxSvcRevenue > 0 ? (s.revenue/maxSvcRevenue)*100 : 0;
              return (
                <div key={i}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:12, ...S }}>
                    <span style={{ fontWeight:600, color:'#344054', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.service}</span>
                    <span style={{ fontWeight:700, color:'#059669', flexShrink:0, marginLeft:8 }}>{fmt(s.revenue)}</span>
                  </div>
                  <div style={{ height:7, background:'#F2F4F7', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${p}%`, background:`hsl(${220-i*18},70%,55%)`, borderRadius:4, transition:'width 0.4s' }}/>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Category Revenue">
          {catBreakdown.length === 0
            ? <div style={{ textAlign:'center', padding:'32px 0', color:'#64748B', ...S }}>No data</div>
            : <ResponsiveContainer width="100%" height={280}>
                <BarChart data={catBreakdown} layout="vertical" margin={{ top:4, right:16, left:0, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7"/>
                  <XAxis type="number" tick={{ fontSize:11, fill:'#64748B' }} tickFormatter={fmtK}/>
                  <YAxis type="category" dataKey="name" tick={{ fontSize:11, fill:'#64748B' }} width={80}/>
                  <Tooltip content={<CTooltip/>}/>
                  <Bar dataKey="revenue" name="Revenue" fill="#2563EB" radius={[0,6,6,0]}/>
                </BarChart>
              </ResponsiveContainer>
          }
        </Card>
      </div>

      <Card title="Service Details">
        <DataTable data={services} columns={svcColumns} pageSize={10}/>
      </Card>
    </>
  );

  /* ── STAFF TAB ── */
  const staffColumns = useMemo(() => [
    { accessorKey:'rank', header:'#', size:50, cell: v => {
      const r = v.getValue();
      const colors = ['#F59E0B','#9CA3AF','#92400E'];
      const bg = r<=3 ? colors[r-1] : '#E4E7EC';
      const tc = r<=3 ? '#fff' : '#64748B';
      return <div style={{ width:28, height:28, borderRadius:'50%', background:bg, color:tc, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800 }}>{r}</div>;
    }},
    { accessorKey:'name', header:'Staff', cell: v => <span style={{ fontWeight:600, color:'#101828', ...S }}>{v.getValue()}</span> },
    { accessorKey:'branch', header:'Branch' },
    { accessorKey:'appts', header:'Appointments', cell: v => <span style={{ fontWeight:700, color:'#344054', ...S }}>{v.getValue()}</span> },
    { accessorKey:'revenue', header:'Revenue', cell: v => <span style={{ fontWeight:700, color:'#2563EB', ...S }}>{fmt(v.getValue())}</span> },
    { accessorKey:'commission', header:'Commission', cell: v => <span style={{ fontWeight:700, color:'#059669', ...S }}>{fmt(v.getValue())}</span> },
    { id:'efficiency', header:'Avg/Appt', accessorFn: r => r.appts > 0 ? (r.revenue/r.appts).toFixed(0) : 0, cell: v => <span style={{ color:'#64748B', ...S }}>{fmt(v.getValue())}</span> },
  ], []);

  const renderStaff = () => (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        <Card title="Staff Performance Ranking">
          <div style={{ display:'flex', flexDirection:'column', gap:10, overflowY:'auto', maxHeight:300 }}>
            {staffRep.slice(0,10).map((s,i) => {
              const rankColors = ['#F59E0B','#9CA3AF','#92400E'];
              const rc = i<3 ? rankColors[i] : '#E4E7EC';
              const rtc = i<3 ? '#fff' : '#64748B';
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'#F8FAFC', borderRadius:10 }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', background:rc, color:rtc, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, flexShrink:0 }}>{s.rank}</div>
                  <div style={{ width:32, height:32, borderRadius:'50%', background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#2563EB', flexShrink:0 }}>{(s.name||'?')[0].toUpperCase()}</div>
                  <div style={{ flex:1, ...S }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#101828' }}>{s.name}</div>
                    <div style={{ fontSize:11, color:'#64748B' }}>{s.appts} appts • {s.branch}</div>
                  </div>
                  <div style={{ textAlign:'right', ...S }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#059669' }}>{fmt(s.commission)}</div>
                    <div style={{ fontSize:10, color:'#64748B' }}>commission</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Staff Revenue Comparison">
          {staffRep.length === 0
            ? <div style={{ textAlign:'center', padding:'32px 0', color:'#64748B', ...S }}>No data</div>
            : <ResponsiveContainer width="100%" height={280}>
                <BarChart data={staffRep.slice(0,10)} margin={{ top:4, right:16, left:-8, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7"/>
                  <XAxis dataKey="name" tick={{ fontSize:10, fill:'#64748B' }} interval={0} angle={-20} textAnchor="end" height={50}/>
                  <YAxis tick={{ fontSize:11, fill:'#64748B' }} tickFormatter={fmtK}/>
                  <Tooltip content={<CTooltip/>}/>
                  <Legend wrapperStyle={{ fontSize:12 }}/>
                  <Bar dataKey="revenue" name="Revenue" fill="#2563EB" radius={[4,4,0,0]}/>
                  <Bar dataKey="commission" name="Commission" fill="#059669" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
          }
        </Card>
      </div>

      <Card title="Staff Details">
        <DataTable data={staffRep} columns={staffColumns} pageSize={10}/>
      </Card>
    </>
  );

  /* ── CUSTOMERS TAB ── */
  const custColumns = useMemo(() => [
    { accessorKey:'name', header:'Customer', cell: v => <span style={{ fontWeight:600, color:'#101828', ...S }}>{v.getValue()}</span> },
    { accessorKey:'phone', header:'Phone' },
    { accessorKey:'email', header:'Email' },
    { accessorFn: r => r.branch?.name || '', id: 'branch', header:'Branch' },
    { accessorKey:'visits', header:'Visits', cell: v => <span style={{ fontWeight:700, color:'#344054', ...S }}>{v.getValue()||0}</span> },
    { accessorKey:'total_spent', header:'Total Spent', cell: v => <span style={{ fontWeight:700, color:'#059669', ...S }}>{fmt(v.getValue())}</span> },
    { accessorKey:'loyalty_points', header:'Points', cell: v => <span style={{ fontWeight:700, color:'#7C3AED', ...S }}>{v.getValue()||0}</span> },
    { accessorKey:'last_visit', header:'Last Visit', cell: v => v.getValue() ? new Date(v.getValue()).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'}) : '—' },
  ], []);

  const renderCustomers = () => {
    const totalSpent = customers.reduce((s,c) => s + Number(c.total_spent||0), 0);
    const totalVisits = customers.reduce((s,c) => s + Number(c.visits||0), 0);
    const avgSpend = customers.length > 0 ? totalSpent / customers.length : 0;

    return (
      <>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16 }}>
          <StatCard label="Total Customers" value={customers.length} icon={<IconCheck />} color="#2563EB" />
          <StatCard label="Total Revenue" value={fmt(totalSpent)} icon={<IconDollar />} color="#059669" />
          <StatCard label="Total Visits" value={totalVisits} icon={<IconCalendar />} color="#7C3AED" />
          <StatCard label="Avg Spend" value={fmt(avgSpend.toFixed(0))} icon={<IconDollar />} color="#D97706" />
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <Card title="Top 10 Customers by Spend">
            <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:300, overflowY:'auto' }}>
              {topCustomers.slice(0,10).map((c,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'#F8FAFC', borderRadius:10, ...S }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#2563EB', flexShrink:0 }}>{i+1}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#101828' }}>{c.name}</div>
                    <div style={{ fontSize:11, color:'#64748B' }}>{c.visits||0} visits • {c.phone||'—'}</div>
                  </div>
                  <div style={{ fontWeight:700, color:'#059669', fontSize:13 }}>{fmt(c.total_spent)}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Customer Visit Frequency">
            {(() => {
              const buckets = [
                { label:'1 visit', min:0, max:1 },
                { label:'2-5', min:2, max:5 },
                { label:'6-10', min:6, max:10 },
                { label:'11-20', min:11, max:20 },
                { label:'20+', min:21, max:Infinity },
              ];
              const data = buckets.map(b => ({
                name: b.label,
                count: customers.filter(c => (c.visits||0) >= b.min && (c.visits||0) <= b.max).length,
              }));
              return (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data} margin={{ top:8, right:16, left:-8, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7"/>
                    <XAxis dataKey="name" tick={{ fontSize:11, fill:'#64748B' }}/>
                    <YAxis tick={{ fontSize:11, fill:'#64748B' }}/>
                    <Tooltip/>
                    <Bar dataKey="count" name="Customers" fill="#7C3AED" radius={[6,6,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </Card>
        </div>

        <Card title="All Customers">
          <DataTable data={customers} columns={custColumns} pageSize={15}/>
        </Card>
      </>
    );
  };

  /* ── EXPENSES TAB ── */
  const expColumns = useMemo(() => [
    { accessorKey:'date', header:'Date', cell: v => v.getValue() ? new Date(v.getValue()).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'}) : '—' },
    { accessorKey:'category', header:'Category', cell: v => {
      const CAT_COLOR = { Rent:'#2563EB', Utilities:'#7C3AED', Supplies:'#D97706', Salary:'#059669', Marketing:'#EA580C', Maintenance:'#0284C7', Other:'#64748B' };
      const c = v.getValue();
      return <span style={{ padding:'2px 10px', borderRadius:8, fontSize:11, fontWeight:700, background:`${CAT_COLOR[c]||'#64748B'}15`, color:CAT_COLOR[c]||'#64748B', ...S }}>{c}</span>;
    }},
    { accessorKey:'title', header:'Title', cell: v => <span style={{ fontWeight:600, color:'#101828', ...S }}>{v.getValue()}</span> },
    { accessorKey:'amount', header:'Amount', cell: v => <span style={{ fontWeight:700, color:'#EF4444', ...S }}>{fmt(v.getValue())}</span> },
    { accessorKey:'paid_to', header:'Paid To' },
    { accessorKey:'payment_method', header:'Method' },
    { accessorFn: r => r.branch?.name || '', id: 'expBranch', header:'Branch' },
  ], []);

  const renderExpenses = () => (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16 }}>
        <StatCard label="Total Expenses" value={fmt(totalExpFromList)} icon={<IconDollar />} color="#EF4444" />
        <StatCard label="Categories" value={expCatBreakdown.length} icon={<IconChart />} color="#7C3AED" />
        <StatCard label="Transactions" value={expenses.length} icon={<IconCalendar />} color="#D97706" />
        <StatCard label="Avg/Transaction" value={fmt(expenses.length > 0 ? (totalExpFromList/expenses.length).toFixed(0) : 0)} icon={<IconDollar />} color="#0284C7" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        <Card title="Expenses by Category">
          {expCatBreakdown.length === 0
            ? <div style={{ textAlign:'center', padding:'32px 0', color:'#64748B', ...S }}>No data</div>
            : <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={expCatBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="total" nameKey="name">
                    {expCatBreakdown.map((_,i) => <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                  </Pie>
                  <Tooltip formatter={v => [fmt(v),'']}/>
                  <Legend wrapperStyle={{ fontSize:12 }}/>
                </PieChart>
              </ResponsiveContainer>
          }
        </Card>

        <Card title="Category Breakdown">
          <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:260, overflowY:'auto' }}>
            {expCatBreakdown.map((c,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, ...S }}>
                <div style={{ width:10, height:10, borderRadius:3, background:PIE_COLORS[i%PIE_COLORS.length], flexShrink:0 }}/>
                <span style={{ flex:1, fontSize:13, color:'#344054' }}>{c.name}</span>
                <span style={{ fontSize:12, color:'#98A2B3' }}>{c.count} txns</span>
                <span style={{ fontSize:13, fontWeight:700, color:'#101828' }}>{fmt(c.total)}</span>
                <span style={{ fontSize:11, color:'#64748B', width:45, textAlign:'right' }}>{pct(c.total, totalExpFromList)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="All Expenses">
        <DataTable data={expenses} columns={expColumns} pageSize={15}/>
      </Card>
    </>
  );

  /* ── Render ── */
  return (
    <PageWrapper
      title="Advanced Reports"
      subtitle="Comprehensive business analytics & data export"
      actions={
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {isAdmin && (
            <select value={branchId} onChange={e => setBranchId(e.target.value)}
              style={{ padding:'8px 12px', borderRadius:10, border:'1.5px solid #D0D5DD', fontSize:13, color:'#101828', ...S, background:'#fff' }}>
              <option value="">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:10, border:'1.5px solid #D0D5DD', fontSize:13, color:'#101828', ...S }}/>
          <span style={{ color:'#98A2B3', fontSize:13, ...S }}>to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:10, border:'1.5px solid #D0D5DD', fontSize:13, color:'#101828', ...S }}/>
          <button onClick={load} style={{ padding:'8px 16px', borderRadius:10, border:'1.5px solid #D0D5DD', background:'#fff', color:'#344054', fontWeight:600, cursor:'pointer', fontSize:13, ...S }}>
            Refresh
          </button>
          <button onClick={downloadExcel} disabled={downloading}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:10, border:'none', background: downloading ? '#93C5FD' : '#059669', color:'#fff', fontWeight:700, cursor: downloading ? 'not-allowed' : 'pointer', fontSize:13, ...S }}>
            <IconDownload/>
            <span>{downloading ? 'Downloading...' : 'Export Excel'}</span>
          </button>
        </div>
      }
    >
      {/* Tab Bar */}
      <div style={{ display:'flex', gap:4, background:'#F8FAFC', borderRadius:12, padding:4, border:'1px solid #E4E7EC' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding:'8px 18px', borderRadius:10, border:'none', cursor:'pointer',
              fontSize:13, fontWeight:600, ...S,
              background: tab === t.key ? '#fff' : 'transparent',
              color: tab === t.key ? '#2563EB' : '#64748B',
              boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition:'all 0.15s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#64748B', fontSize:14, ...S }}>Loading reports...</div>
      ) : renderTab()}
    </PageWrapper>
  );
}
