import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import usePageTheme from '../hooks/usePageTheme';
import { useBranch } from '../context/BranchContext';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useToast } from '../components/ui/Toast';

/* ── helpers ─────────────────────────────────────────────────────────── */
const fmt = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;
const fmtN = (n) => Number(n || 0).toLocaleString();
const SL_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const today = () => new Date(Date.now() + SL_OFFSET_MS).toISOString().slice(0, 10);
const thisMonth = () => new Date(Date.now() + SL_OFFSET_MS).toISOString().slice(0, 7);
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const apptCustomerName = (a) => a?.customer?.name || a?.customer_name || 'Customer';
const sortApptsByTimeAsc = (rows) =>
  [...rows].sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));

const STATUS_STYLE = {
  pending: { bg: '#FFEDD5', color: '#C2410C', label: 'Pending' },
  confirmed: { bg: '#DCFCE7', color: '#15803D', label: 'Confirmed' },
  in_progress: { bg: '#DBEAFE', color: '#1D4ED8', label: 'In Progress' },
  completed: { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
  cancelled: { bg: '#FEE2E2', color: '#B91C1C', label: 'Cancelled' },
  no_show: { bg: '#F3F4F6', color: '#6B7280', label: 'No show' },
};

const PIE_COLORS = ['#1D4ED8', '#7C3AED', '#06B6D4', '#F97316', '#22C55E', '#EC4899', '#64748B'];

const CATEGORY_ALIASES = {
  hair: 'Hair Services',
  'hair cut': 'Hair Services',
  'hair styling': 'Hair Services',
  colour: 'Hair Services',
  color: 'Hair Services',
  skin: 'Skin Care',
  facial: 'Skin Care',
  nail: 'Nail Services',
  nails: 'Nail Services',
  spa: 'Spa & Massage',
  massage: 'Spa & Massage',
};

function normalizeCategory(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'Others';
  const key = s.toLowerCase();
  for (const [k, v] of Object.entries(CATEGORY_ALIASES)) {
    if (key.includes(k)) return v;
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatTime(t) {
  if (!t) return '—';
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

function Sk({ h = 20, w = '100%', mb = 0 }) {
  return (
    <div style={{
      height: h, width: w, marginBottom: mb, borderRadius: 10,
      background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)',
      backgroundSize: '200% 100%',
      animation: 'dashShimmer 1.4s ease-in-out infinite',
    }}
    />
  );
}

function DeltaBadge({ value, suffix = '', invert = false }) {
  const n = Number(value) || 0;
  const up = invert ? n < 0 : n > 0;
  const flat = n === 0;
  const color = flat ? '#64748B' : up ? '#16A34A' : '#DC2626';
  const bg = flat ? '#F1F5F9' : up ? '#DCFCE7' : '#FEE2E2';
  const sign = n > 0 ? '+' : '';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 6px', borderRadius: 999, fontSize: 10, fontWeight: 700,
      background: bg, color, lineHeight: 1.2,
    }}
    >
      {!flat && (
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path
            d={up ? 'M5 2L8.5 7H1.5L5 2Z' : 'M5 8L1.5 3H8.5L5 8Z'}
            fill="currentColor"
          />
        </svg>
      )}
      {sign}{n}{suffix}
    </span>
  );
}

/** Compact horizontal KPI — icon + value row, small footprint */
function MetricCard({
  label, value, delta, deltaSuffix, deltaHint, iconBg, iconColor, loading, icon, onClick,
}) {
  const { C } = usePageTheme();
  const [hov, setHov] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: C.cardBg || '#fff',
        borderRadius: 14,
        padding: '12px 14px',
        border: `1px solid ${hov ? (C.primary || '#2563EB') + '55' : (C.border || '#EEF2F6')}`,
        boxShadow: hov
          ? '0 6px 16px rgba(16,24,40,0.08)'
          : (C.shadow || '0 1px 2px rgba(16,24,40,0.04)'),
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 72,
        width: '100%',
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        transform: hov ? 'translateY(-1px)' : 'none',
        transition: 'all 0.15s ease',
        fontFamily: 'inherit',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: iconBg, color: iconColor,
        display: 'grid', placeItems: 'center', flexShrink: 0,
      }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: C.muted || '#64748B',
          marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
        >
          {label}
        </div>
        {loading ? <Sk h={20} w="60%" /> : (
          <div style={{
            fontSize: 18, fontWeight: 800, color: C.title || '#0F172A',
            letterSpacing: '-0.03em', lineHeight: 1.15,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
          >
            {value}
          </div>
        )}
        {!loading && (delta != null || deltaHint) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'nowrap' }}>
            {delta != null && <DeltaBadge value={delta} suffix={deltaSuffix} />}
            {deltaHint && (
              <span style={{
                fontSize: 10, color: C.muted || '#94A3B8',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
              >
                {deltaHint}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

function Card({ children, style }) {
  const { C } = usePageTheme();
  return (
    <div style={{
      background: C.cardBg || '#fff',
      borderRadius: 18,
      padding: '20px 22px',
      border: `1px solid ${C.border || '#EEF2F6'}`,
      boxShadow: C.shadow || '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.04)',
      ...style,
    }}
    >
      {children}
    </div>
  );
}

function CardHead({ title, action }) {
  const { C } = usePageTheme();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 16, gap: 10,
    }}
    >
      <span style={{ fontSize: 15, fontWeight: 700, color: C.title || '#0F172A' }}>{title}</span>
      {action}
    </div>
  );
}

function AreaTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#0F172A', color: '#fff', borderRadius: 10,
      padding: '8px 12px', fontSize: 12, boxShadow: '0 8px 20px rgba(15,23,42,0.25)',
    }}
    >
      <div style={{ opacity: 0.7, marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{fmt(payload[0].value)}</div>
    </div>
  );
}

function MultiTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#0F172A', color: '#fff', borderRadius: 10,
      padding: '8px 12px', fontSize: 12, boxShadow: '0 8px 20px rgba(15,23,42,0.25)',
    }}
    >
      <div style={{ opacity: 0.7, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ fontWeight: 700, color: p.color || '#fff', marginTop: 2 }}>
          {p.name}: {typeof p.value === 'number' && p.dataKey !== 'appts' && p.dataKey !== 'count' && p.dataKey !== 'value'
            ? fmt(p.value)
            : fmtN(p.value)}
        </div>
      ))}
    </div>
  );
}

function ChartEmpty({ h = 190, C }) {
  return (
    <div style={{ height: h, display: 'grid', placeItems: 'center', color: C.muted, fontSize: 13 }}>
      No data yet
    </div>
  );
}

/* ── icons (compact) ─────────────────────────────────────────────────── */
const IconCalendar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const IconCash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5c.5-1 1.5-1.5 2.5-1.5s2 .6 2 1.75-1 1.5-2.5 2-2.5.75-2.5 2 1 1.75 2.5 1.75 2-.5 2.5-1.5" />
  </svg>
);
const IconChart = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19V5M4 19h16" /><path d="M8 15v-4M12 15V8M16 15v-7" />
  </svg>
);
const IconUsers = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
  </svg>
);
const IconWarn = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
);
const IconBox = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /></svg>
);
const IconStack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
);
const IconProgress = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
);
const IconPending = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M8 12h4M12 8v4" />
  </svg>
);
const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
const IconBell = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);
const IconProfit = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

export default function DashboardPage() {
  const { C, isDark } = usePageTheme();
  const { user } = useAuth();
  const { branchFilterKey } = useBranch();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isMobile } = useBreakpoint();
  const refreshTimerRef = useRef(null);

  const [stats, setStats] = useState(null);
  const [appts, setAppts] = useState([]);
  const [services, setServices] = useState([]);
  const [month, setMonth] = useState(thisMonth());
  const [revenueData, setRevenueData] = useState([]);
  const [revCommData, setRevCommData] = useState([]);
  const [categoryPie, setCategoryPie] = useState([]);
  const [statusPie, setStatusPie] = useState([]);
  const [staffBars, setStaffBars] = useState([]);
  const [serviceBars, setServiceBars] = useState([]);
  const [monthExpenses, setMonthExpenses] = useState(0);
  const [statusCounts, setStatusCounts] = useState({});
  const [lastRefresh, setLastRefresh] = useState(null);
  const [loading, setLoading] = useState(true);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const isAdmin = ['superadmin', 'admin', 'manager'].includes(user?.role);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const reportParams = new URLSearchParams();
      if (month) reportParams.set('month', month);
      const reportQ = reportParams.toString() ? `?${reportParams.toString()}` : '';
      const expQ = reportParams.toString()
        ? `?${reportParams.toString()}&limit=1`
        : `?month=${month || thisMonth()}&limit=1`;

      const [dashRes, apptRes, svcRes, revRes, statusRes, expRes, staffRes] = await Promise.all([
        api.get(`/reports/dashboard${reportQ}`),
        api.get(`/appointments?limit=8&date=${today()}&sort=time&order=asc`),
        api.get(`/reports/services${reportQ}`),
        api.get(`/reports/revenue${reportQ}`),
        api.get(`/reports/appointments${reportQ}`).catch(() => ({ data: [] })),
        api.get(`/expenses${expQ}`).catch(() => ({ data: {} })),
        api.get(`/reports/staff${reportQ}`).catch(() => ({ data: [] })),
      ]);

      setStats(dashRes.data);

      const apptRows = apptRes.data.data || apptRes.data || [];
      setAppts(sortApptsByTimeAsc(Array.isArray(apptRows) ? apptRows : []).slice(0, 6));

      const svcRaw = Array.isArray(svcRes.data) ? svcRes.data : [];
      setServices(svcRaw.slice(0, 5));
      setServiceBars(
        svcRaw.slice(0, 6).map((s) => ({
          name: String(s.service?.name || s.name || 'Service').slice(0, 14),
          revenue: Number(s.revenue || s.dataValues?.revenue || 0),
          count: Number(s.count || s.dataValues?.count || 0),
        })),
      );

      /* category donut from services */
      const catMap = {};
      let catTotal = 0;
      for (const s of svcRaw) {
        const rev = Number(s.revenue || s.dataValues?.revenue || 0);
        const cat = normalizeCategory(s.service?.category || s.category);
        catMap[cat] = (catMap[cat] || 0) + rev;
        catTotal += rev;
      }
      const pie = Object.entries(catMap)
        .map(([name, value]) => ({
          name,
          value,
          pct: catTotal > 0 ? Math.round((value / catTotal) * 100) : 0,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
      setCategoryPie(pie);

      const revRaw = Array.isArray(revRes.data) ? revRes.data : [];
      const revChart = revRaw.slice(-6).map((r) => ({
        month: r.month ? MONTHS_SHORT[parseInt(r.month.split('-')[1], 10) - 1] : '',
        revenue: Number(r.revenue || r.dataValues?.revenue || 0),
      }));
      setRevenueData(revChart);
      setRevCommData(
        revRaw.slice(-6).map((r) => ({
          month: r.month ? MONTHS_SHORT[parseInt(r.month.split('-')[1], 10) - 1] : '',
          revenue: Number(r.revenue || r.dataValues?.revenue || 0),
          commission: Number(r.commission || r.dataValues?.commission || 0),
        })),
      );

      const statusRaw = Array.isArray(statusRes.data) ? statusRes.data : [];
      const sc = {};
      const statusChart = [];
      for (const row of statusRaw) {
        const key = String(row.status || row.dataValues?.status || '').toLowerCase();
        const count = Number(row.count || row.dataValues?.count || 0);
        sc[key] = count;
        if (count > 0) {
          const st = STATUS_STYLE[key] || { label: key, color: '#64748B' };
          statusChart.push({ name: st.label, value: count, fill: st.color });
        }
      }
      setStatusCounts(sc);
      setStatusPie(statusChart);

      const staffRaw = Array.isArray(staffRes.data) ? staffRes.data : [];
      setStaffBars(
        staffRaw
          .map((s) => ({
            name: String(s.name || 'Staff').split(' ')[0].slice(0, 10),
            revenue: Number(s.dataValues?.totalRevenue || s.totalRevenue || 0),
            appts: Number(s.dataValues?.apptCount || s.apptCount || 0),
          }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 6),
      );

      setMonthExpenses(Number(expRes.data?.totalAmount || 0));
      setLastRefresh(new Date());
    } catch {
      if (!silent) toast('Failed to load dashboard.', 'error');
    } finally {
      setLoading(false);
    }
  }, [month, branchFilterKey, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    refreshTimerRef.current = setInterval(() => load(true), 180000);
    return () => clearInterval(refreshTimerRef.current);
  }, [load]);

  const deltas = stats?.deltas || {};
  const monthRevenue = Number(stats?.monthRevenue || 0);
  const monthCommission = Number(stats?.monthCommission || 0);
  const netProfit = monthRevenue - monthCommission - monthExpenses;
  const topServiceMax = Number(services[0]?.revenue || services[0]?.dataValues?.revenue || 1) || 1;
  const completedToday = appts.filter((a) => a.status === 'completed').length;
  const pendingToday = appts.filter((a) => a.status === 'pending').length;
  const inProgressToday = appts.filter((a) => a.status === 'in_progress').length;

  const linkMuted = (label, path) => (
    <button
      type="button"
      onClick={() => navigate(path)}
      style={{
        border: 'none', background: 'none', cursor: 'pointer',
        fontSize: 12.5, fontWeight: 600, color: '#2563EB', padding: 0,
      }}
    >
      {label}
    </button>
  );

  const refreshedLabel = lastRefresh
    ? `Updated ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Live';

  return (
    <PageWrapper
      title={`Welcome, ${firstName} 👋`}
      subtitle={`Here's what's happening at your salon today · ${refreshedLabel}`}
      actions={(
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{
              width: 140, borderRadius: 10,
              border: `1.5px solid ${C.border || '#E5E7EB'}`,
              padding: '8px 10px', fontSize: 12.5,
              color: C.text || '#374151',
              background: C.cardBg || '#fff',
            }}
          />
          <button
            type="button"
            onClick={() => navigate('/appointments')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 10,
              background: 'linear-gradient(135deg, #1D4ED8, #2563EB)',
              color: '#fff', border: 'none', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 700,
              boxShadow: '0 3px 10px rgba(37,99,235,0.25)',
            }}
          >
            + New Appointment
          </button>
          <button
            type="button"
            onClick={() => load()}
            style={{
              padding: '8px 12px', borderRadius: 10,
              background: C.cardBg || '#fff', color: C.text || '#374151',
              border: `1.5px solid ${C.border || '#E5E7EB'}`,
              cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
            }}
          >
            Refresh
          </button>
        </div>
      )}
    >
      <div style={{ display: 'grid', gap: isMobile ? 12 : 14, background: 'transparent' }}>

        {/* Compact KPI row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: 10,
        }}
        >
          <MetricCard
            label="Today's Appointments"
            value={stats ? fmtN(stats.todayAppts) : '—'}
            delta={deltas.apptsVsYesterday}
            deltaHint="vs yesterday"
            loading={loading}
            iconBg="#DBEAFE"
            iconColor="#2563EB"
            icon={<IconCalendar />}
            onClick={() => navigate('/appointments')}
          />
          <MetricCard
            label="Today's Revenue"
            value={stats ? fmt(stats.todayRevenue) : '—'}
            delta={deltas.revenueVsYesterdayPct}
            deltaSuffix="%"
            deltaHint="vs yesterday"
            loading={loading}
            iconBg="#DCFCE7"
            iconColor="#16A34A"
            icon={<IconCash />}
            onClick={() => navigate('/payments')}
          />
          <MetricCard
            label="Monthly Revenue"
            value={stats ? fmt(stats.monthRevenue) : '—'}
            delta={deltas.revenueVsLastMonthPct}
            deltaSuffix="%"
            deltaHint="vs last month"
            loading={loading}
            iconBg="#EDE9FE"
            iconColor="#7C3AED"
            icon={<IconChart />}
            onClick={() => navigate('/reports')}
          />
          <MetricCard
            label="Total Customers"
            value={stats ? fmtN(stats.totalCustomers) : '—'}
            delta={stats?.newCustomersThisMonth || 0}
            deltaHint="this month"
            loading={loading}
            iconBg="#FFEDD5"
            iconColor="#EA580C"
            icon={<IconUsers />}
            onClick={() => navigate('/customers')}
          />
        </div>

        {/* Second KPI row — same card style as top metrics */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : (isAdmin ? 'repeat(6, 1fr)' : 'repeat(4, 1fr)'),
          gap: 10,
        }}
        >
          <MetricCard
            label="In Progress"
            value={loading ? '—' : fmtN(inProgressToday)}
            delta={inProgressToday}
            deltaHint="live now"
            loading={loading}
            iconBg="#DBEAFE"
            iconColor="#2563EB"
            icon={<IconProgress />}
            onClick={() => navigate('/appointments')}
          />
          <MetricCard
            label="Pending Today"
            value={loading ? '—' : fmtN(pendingToday)}
            delta={pendingToday}
            deltaHint="need confirm"
            loading={loading}
            iconBg="#FEF3C7"
            iconColor="#D97706"
            icon={<IconPending />}
            onClick={() => navigate('/appointments')}
          />
          <MetricCard
            label="Completed Today"
            value={loading ? '—' : fmtN(completedToday)}
            delta={completedToday}
            deltaHint="done today"
            loading={loading}
            iconBg="#DCFCE7"
            iconColor="#16A34A"
            icon={<IconCheck />}
            onClick={() => navigate('/appointments')}
          />
          <MetricCard
            label="Reminders"
            value={loading ? '—' : fmtN(stats?.pendingReminders || 0)}
            delta={stats?.pendingReminders || 0}
            deltaHint="open tasks"
            loading={loading}
            iconBg="#F1F5F9"
            iconColor="#475569"
            icon={<IconBell />}
            onClick={() => navigate('/reminders')}
          />
          {isAdmin && (
            <MetricCard
              label="Net Profit"
              value={loading ? '—' : fmt(netProfit)}
              delta={monthRevenue > 0 ? Math.round((netProfit / monthRevenue) * 100) : 0}
              deltaSuffix="%"
              deltaHint="margin"
              loading={loading}
              iconBg={netProfit >= 0 ? '#DCFCE7' : '#FEE2E2'}
              iconColor={netProfit >= 0 ? '#16A34A' : '#DC2626'}
              icon={<IconProfit />}
              onClick={() => navigate('/reports')}
            />
          )}
          {isAdmin && (
            <MetricCard
              label="Low Stock"
              value={loading ? '—' : fmtN(stats?.lowStockCount || 0)}
              delta={stats?.lowStockCount || 0}
              deltaHint="need restock"
              loading={loading}
              iconBg={(stats?.lowStockCount || 0) > 0 ? '#FEE2E2' : '#DCFCE7'}
              iconColor={(stats?.lowStockCount || 0) > 0 ? '#DC2626' : '#16A34A'}
              icon={<IconWarn />}
              onClick={() => navigate('/inventory')}
            />
          )}
        </div>

        {/* Month status snapshot */}
        {!loading && Object.keys(statusCounts).length > 0 && (
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
            padding: '8px 12px', borderRadius: 12,
            background: C.cardBg || '#fff',
            border: `1px solid ${C.border || '#EEF2F6'}`,
          }}
          >
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted || '#64748B', marginRight: 4 }}>
              This month
            </span>
            {Object.entries(statusCounts).map(([key, count]) => {
              const st = STATUS_STYLE[key] || { bg: '#F1F5F9', color: '#475569', label: key };
              return (
                <span
                  key={key}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                    background: st.bg, color: st.color,
                  }}
                >
                  {st.label} · {count}
                </span>
              );
            })}
          </div>
        )}

        {/* Charts row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.55fr 1fr',
          gap: 14,
        }}
        >
          <Card>
            <CardHead
              title="Revenue Analytics"
              action={(
                <span style={{ fontSize: 12, fontWeight: 600, color: C.muted || '#94A3B8' }}>
                  Last 6 Months
                </span>
              )}
            />
            {loading ? <Sk h={210} /> : revenueData.length === 0 ? (
              <div style={{ height: 210, display: 'grid', placeItems: 'center', color: C.muted, fontSize: 13 }}>
                No revenue data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={revenueData} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563EB" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#EEF2F7'} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                  />
                  <Tooltip content={<AreaTip />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#2563EB"
                    strokeWidth={3}
                    fill="url(#revFill)"
                    dot={{ r: 4, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#1D4ED8', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card>
            <CardHead title="Service Performance" />
            {loading ? <Sk h={210} /> : categoryPie.length === 0 ? (
              <div style={{ height: 210, display: 'grid', placeItems: 'center', color: C.muted, fontSize: 13 }}>
                No service sales yet
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8, alignItems: 'center' }}>
                <div style={{ position: 'relative', height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryPie}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                        startAngle={90}
                        endAngle={-270}
                      >
                        {categoryPie.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{
                    position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                    pointerEvents: 'none', textAlign: 'center',
                  }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: C.title || '#0F172A', lineHeight: 1.2 }}>
                        {fmt(monthRevenue)}
                      </div>
                      <div style={{ fontSize: 10.5, color: C.muted || '#94A3B8', marginTop: 2 }}>Total Revenue</div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {categoryPie.map((c, i) => (
                    <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 9, height: 9, borderRadius: 3, flexShrink: 0,
                        background: PIE_COLORS[i % PIE_COLORS.length],
                      }}
                      />
                      <span style={{ flex: 1, fontSize: 12.5, color: C.text || '#334155', fontWeight: 500 }}>
                        {c.name}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.title || '#0F172A' }}>
                        {c.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Extra charts — 4 panels */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 14,
        }}
        >
          {/* 1. Appointment Status */}
          <Card>
            <CardHead
              title="Appointment Status"
              action={<span style={{ fontSize: 12, fontWeight: 600, color: C.muted || '#94A3B8' }}>This month</span>}
            />
            {loading ? <Sk h={200} /> : statusPie.length === 0 ? (
              <ChartEmpty C={C} />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1fr', gap: 8, alignItems: 'center' }}>
                <div style={{ height: 190 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusPie}
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={68}
                        paddingAngle={3}
                        dataKey="value"
                        startAngle={90}
                        endAngle={-270}
                      >
                        {statusPie.map((s, i) => (
                          <Cell key={s.name} fill={s.fill || PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [fmtN(v), 'Count']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {statusPie.map((s, i) => (
                    <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 9, height: 9, borderRadius: 3, flexShrink: 0,
                        background: s.fill || PIE_COLORS[i % PIE_COLORS.length],
                      }}
                      />
                      <span style={{ flex: 1, fontSize: 12.5, color: C.text || '#334155', fontWeight: 500 }}>{s.name}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: C.title || '#0F172A' }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* 2. Staff Performance */}
          <Card>
            <CardHead
              title="Staff Performance"
              action={<span style={{ fontSize: 12, fontWeight: 600, color: C.muted || '#94A3B8' }}>Top earners</span>}
            />
            {loading ? <Sk h={200} /> : staffBars.length === 0 ? (
              <ChartEmpty C={C} />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={staffBars} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#EEF2F7'} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={56}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<MultiTip />} />
                  <Bar dataKey="revenue" name="Revenue" fill="#7C3AED" radius={[0, 6, 6, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* 3. Top Services bar */}
          <Card>
            <CardHead
              title="Top Services Chart"
              action={<span style={{ fontSize: 12, fontWeight: 600, color: C.muted || '#94A3B8' }}>By revenue</span>}
            />
            {loading ? <Sk h={200} /> : serviceBars.length === 0 ? (
              <ChartEmpty C={C} />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={serviceBars} margin={{ top: 8, right: 8, left: -8, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#EEF2F7'} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                    height={40}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                  />
                  <Tooltip content={<MultiTip />} />
                  <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]} barSize={22}>
                    {serviceBars.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* 4. Revenue vs Commission */}
          <Card>
            <CardHead
              title="Revenue vs Commission"
              action={<span style={{ fontSize: 12, fontWeight: 600, color: C.muted || '#94A3B8' }}>Last 6 months</span>}
            />
            {loading ? <Sk h={200} /> : revCommData.length === 0 ? (
              <ChartEmpty C={C} />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={revCommData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#EEF2F7'} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                  />
                  <Tooltip content={<MultiTip />} />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    iconType="circle"
                    wrapperStyle={{ fontSize: 11, color: '#64748B' }}
                  />
                  <Bar dataKey="revenue" name="Revenue" fill="#2563EB" radius={[5, 5, 0, 0]} barSize={16} />
                  <Bar dataKey="commission" name="Commission" fill="#F59E0B" radius={[5, 5, 0, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        {/* Bottom operational row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.35fr 1fr 0.9fr',
          gap: 14,
          alignItems: 'stretch',
        }}
        >
          {/* Today's Schedule */}
          <Card style={{ display: 'flex', flexDirection: 'column' }}>
            <CardHead
              title="Today's Schedule"
              action={linkMuted('View Full Schedule →', '/appointments')}
            />
            <div style={{ display: 'grid', gap: 0, flex: 1 }}>
              {loading && [1, 2, 3, 4].map((i) => <Sk key={i} h={52} mb={10} />)}
              {!loading && appts.length === 0 && (
                <div style={{
                  flex: 1, display: 'grid', placeItems: 'center',
                  color: C.muted, fontSize: 13, padding: '28px 0',
                }}
                >
                  No appointments today
                </div>
              )}
              {!loading && appts.map((a, idx) => {
                const st = STATUS_STYLE[a.status] || STATUS_STYLE.pending;
                const name = apptCustomerName(a);
                const initial = (name[0] || '?').toUpperCase();
                return (
                  <div
                    key={a.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '64px 40px 1fr auto',
                      gap: 10,
                      alignItems: 'center',
                      padding: '12px 0',
                      borderBottom: idx === appts.length - 1 ? 'none' : `1px solid ${C.border || '#F1F5F9'}`,
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: C.muted || '#64748B' }}>
                      {formatTime(a.time)}
                    </div>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #DBEAFE, #E0E7FF)',
                      color: '#1D4ED8', fontWeight: 800, fontSize: 13,
                      display: 'grid', placeItems: 'center',
                    }}
                    >
                      {initial}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 13.5, fontWeight: 700, color: C.title || '#0F172A',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                      >
                        {name}
                      </div>
                      <div style={{
                        fontSize: 12, color: C.muted || '#94A3B8', marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                      >
                        {a.service?.name || 'Service'}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                      background: st.bg, color: st.color, whiteSpace: 'nowrap',
                    }}
                    >
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Top Services */}
          <Card>
            <CardHead
              title="Top Services"
              action={<span style={{ fontSize: 12, color: C.muted || '#94A3B8', fontWeight: 600 }}>This Month</span>}
            />
            {loading && [1, 2, 3, 4, 5].map((i) => <Sk key={i} h={40} mb={10} />)}
            {!loading && services.length === 0 && (
              <div style={{ textAlign: 'center', padding: '28px 0', color: C.muted, fontSize: 13 }}>No data</div>
            )}
            {!loading && services.map((s, i) => {
              const rev = Number(s.revenue || s.dataValues?.revenue || 0);
              const pctOfTop = Math.round((rev / topServiceMax) * 100);
              const pctOfMonth = monthRevenue > 0 ? Math.round((rev / monthRevenue) * 100) : pctOfTop;
              const name = s.service?.name || s.name || 'Service';
              return (
                <div key={s.service_id || s.id || i} style={{ marginBottom: i === services.length - 1 ? 0 : 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                      background: '#EFF6FF', color: '#2563EB',
                      display: 'grid', placeItems: 'center',
                      fontSize: 11, fontWeight: 800,
                    }}
                    >
                      {i + 1}
                    </span>
                    <span style={{
                      flex: 1, fontSize: 13, fontWeight: 600, color: C.title || '#0F172A',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                    >
                      {name}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: C.title || '#0F172A' }}>
                      {fmt(rev)}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', minWidth: 34, textAlign: 'right' }}>
                      {pctOfMonth}%
                    </span>
                  </div>
                  <div style={{
                    height: 7, background: isDark ? '#1E293B' : '#EEF2F7',
                    borderRadius: 99, overflow: 'hidden', marginLeft: 32,
                  }}
                  >
                    <div style={{
                      height: '100%', width: `${pctOfTop}%`,
                      background: 'linear-gradient(90deg, #1D4ED8, #60A5FA)',
                      borderRadius: 99,
                    }}
                    />
                  </div>
                </div>
              );
            })}
          </Card>

          {/* Inventory Status */}
          <Card style={{ display: 'flex', flexDirection: 'column' }}>
            <CardHead
              title="Inventory Status"
              action={linkMuted('View Inventory →', '/inventory')}
            />
            <div style={{ display: 'grid', gap: 12, flex: 1 }}>
              {[
                {
                  label: 'Low Stock Items',
                  value: stats?.lowStockCount ?? 0,
                  bg: '#FEF2F2',
                  color: '#DC2626',
                  icon: <IconWarn />,
                },
                {
                  label: 'In Stock Items',
                  value: stats?.inventoryInStock ?? 0,
                  bg: '#F0FDF4',
                  color: '#16A34A',
                  icon: <IconBox />,
                },
                {
                  label: 'Total Items',
                  value: stats?.inventoryTotal ?? 0,
                  bg: '#EFF6FF',
                  color: '#2563EB',
                  icon: <IconStack />,
                },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 14px', borderRadius: 14,
                    background: isDark ? `${row.color}18` : row.bg,
                    border: `1px solid ${isDark ? `${row.color}33` : 'transparent'}`,
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: isDark ? `${row.color}22` : '#fff',
                    color: row.color, display: 'grid', placeItems: 'center',
                  }}
                  >
                    {row.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.muted || '#64748B' }}>{row.label}</div>
                    {loading ? <Sk h={22} w={48} /> : (
                      <div style={{ fontSize: 22, fontWeight: 800, color: row.color, letterSpacing: '-0.02em' }}>
                        {fmtN(row.value)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <style>{`
        @keyframes dashShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </PageWrapper>
  );
}
