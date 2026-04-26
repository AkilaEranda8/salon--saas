import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart, Cell, PieChart, Pie, Legend,
} from 'recharts';
import api from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';

// ── Constants ──────────────────────────────────────────────────────────────────
const ALERT_PALETTE = {
  critical: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5', dot: '#DC2626' },
  high:     { bg: '#FFEDD5', text: '#9A3412', border: '#FDBA74', dot: '#EA580C' },
  medium:   { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D', dot: '#D97706' },
  info:     { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD', dot: '#2563EB' },
};
const ALERT_PALETTE_DARK = {
  critical: { bg: 'rgba(220,38,38,0.15)', text: '#FCA5A5', border: '#7F1D1D', dot: '#EF4444' },
  high:     { bg: 'rgba(234,88,12,0.15)',  text: '#FDBA74', border: '#7C2D12', dot: '#F97316' },
  medium:   { bg: 'rgba(217,119,6,0.12)',  text: '#FCD34D', border: '#78350F', dot: '#FBBF24' },
  info:     { bg: 'rgba(37,99,235,0.15)',  text: '#93C5FD', border: '#1E3A8A', dot: '#60A5FA' },
};
const PIE_COLORS = ['#10B981', '#F59E0B', '#EF4444'];
const REFRESH_INTERVAL = 30;

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let s = b, i = 0;
  while (s >= 1024 && i < u.length - 1) { s /= 1024; i++; }
  return `${s.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}
function formatUptime(s) {
  if (!s && s !== 0) return '0m';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function labelHour(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:00`;
}
function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length * p / 100)] || 0;
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Surface({ title, subtitle, children, dark, rightAction, style = {} }) {
  return (
    <section style={{
      borderRadius: 18, border: `1px solid ${dark ? '#1E293B' : '#E5E7EB'}`,
      background: dark ? '#111827' : '#FFFFFF',
      boxShadow: dark ? '0 8px 24px rgba(2,6,23,0.38)' : '0 8px 20px rgba(15,23,42,0.06)',
      padding: '18px 18px 16px', ...style,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: dark ? '#F1F5F9' : '#0F172A' }}>{title}</div>
          {subtitle && <div style={{ marginTop: 3, fontSize: 12, color: dark ? '#64748B' : '#94A3B8' }}>{subtitle}</div>}
        </div>
        {rightAction}
      </div>
      {children}
    </section>
  );
}

function KPI({ label, value, hint, dark, accent = '#2563EB', icon }) {
  return (
    <div style={{
      borderRadius: 14, border: `1px solid ${dark ? '#1E293B' : '#E5E7EB'}`,
      background: dark ? '#0B1220' : '#FFFFFF', padding: '14px 16px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: dark ? '#64748B' : '#94A3B8' }}>{label}</div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, color: accent }}>{value}</div>
      {hint && <div style={{ marginTop: 5, fontSize: 11.5, color: dark ? '#475569' : '#94A3B8' }}>{hint}</div>}
    </div>
  );
}

function StatusDot({ ok, label, dark }) {
  const color = ok ? '#10B981' : '#EF4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{
        display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
        background: color, boxShadow: `0 0 0 3px ${ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
      }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: dark ? '#CBD5E1' : '#374151' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>
        {ok ? 'Online' : 'Down'}
      </span>
    </div>
  );
}

function MemBar({ label, used, total, dark, color = '#6366F1' }) {
  const pctUsed = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: dark ? '#94A3B8' : '#64748B' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: dark ? '#CBD5E1' : '#374151' }}>
          {formatBytes(used)} / {formatBytes(total)} ({pctUsed.toFixed(0)}%)
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: dark ? '#1E293B' : '#F1F5F9', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pctUsed}%`, borderRadius: 99, background: color, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function PlatformMonitoringPage() {
  const { isDark } = useTheme();
  const [monitoring, setMonitoring] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [lastUpdated, setLastUpdated] = useState(null);
  const countRef = useRef(REFRESH_INTERVAL);

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const res = await api.get('/platform/system/monitoring');
      setMonitoring(res.data || null);
      setLastUpdated(new Date());
      countRef.current = REFRESH_INTERVAL;
      setCountdown(REFRESH_INTERVAL);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load monitoring data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(false); }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const tick = setInterval(() => {
      countRef.current -= 1;
      setCountdown(countRef.current);
      if (countRef.current <= 0) load(true);
    }, 1000);
    return () => clearInterval(tick);
  }, [autoRefresh]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const counts  = monitoring?.counts  || {};
  const server  = monitoring?.server  || {};
  const health  = monitoring?.health  || {};
  const alerts  = Array.isArray(monitoring?.alerts) ? monitoring.alerts : [];

  const failureSeries = useMemo(() =>
    (monitoring?.trends?.failedNotificationsByHour24h || []).map((i) => ({ label: labelHour(i.hour), count: i.count || 0 })),
  [monitoring]);

  const ticketSeries = useMemo(() =>
    (monitoring?.trends?.ticketsCreatedByDay7d || []).map((i) => ({ label: i.date?.slice(5) || '--', count: i.count || 0 })),
  [monitoring]);

  const channelSeries = useMemo(() =>
    (monitoring?.breakdowns?.notificationsByChannel24h || []).map((r) => ({
      channel: r.channel || 'unknown', sent: r.sent || 0, failed: r.failed || 0,
    })),
  [monitoring]);

  const methodSeries = useMemo(() =>
    Object.entries(monitoring?.apiRealtime?.byMethod || {}).map(([method, count]) => ({ method, count })),
  [monitoring]);

  const tenantPieSeries = useMemo(() => [
    { name: 'Active',    value: counts.activeTenants    || 0 },
    { name: 'Suspended', value: counts.suspendedTenants || 0 },
    { name: 'Cancelled', value: counts.cancelledTenants || 0 },
  ], [counts]);

  const perfStats = useMemo(() => {
    const rows = (monitoring?.apiRealtime?.recent || []).map((r) => r.durationMs || 0);
    if (!rows.length) return { p50: 0, p95: 0, p99: 0, avg: 0 };
    const avg = Math.round(rows.reduce((a, b) => a + b, 0) / rows.length);
    return { p50: pct(rows, 50), p95: pct(rows, 95), p99: pct(rows, 99), avg };
  }, [monitoring]);

  const recentApiRows  = monitoring?.apiRealtime?.recent || [];
  const recentErrors   = monitoring?.recentFailedNotifications || [];
  const isHealthy      = health.overall === 'healthy';
  const pal            = isDark ? ALERT_PALETTE_DARK : ALERT_PALETTE;

  const pageBg = isDark
    ? 'radial-gradient(ellipse at top left, rgba(56,189,248,0.10) 0%, transparent 40%), linear-gradient(180deg,#0A111E 0%,#07090F 100%)'
    : 'radial-gradient(ellipse at top left, rgba(14,165,233,0.07) 0%, transparent 40%), #F5F7FA';

  const gridTick = { fontSize: 11, fill: isDark ? '#475569' : '#9CA3AF' };
  const gridLine = isDark ? '#1A2436' : '#E5E7EB';

  return (
    <div style={{ width: '100%', minHeight: '100%', padding: '28px clamp(14px,2.5vw,36px) 52px', boxSizing: 'border-box', background: pageBg }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: isDark ? '#7DD3FC' : '#0369A1', marginBottom: 6 }}>
            Platform Operations
          </div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900, lineHeight: 1.05, color: isDark ? '#F8FAFC' : '#0F172A' }}>
            System Monitoring
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: isDark ? '#64748B' : '#6B7280' }}>
            Real-time health, API performance, tenant status and notification reliability.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: isDark ? '#475569' : '#9CA3AF' }}>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: isDark ? '#94A3B8' : '#475467', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} style={{ accentColor: '#2563EB' }} />
            Auto ({countdown}s)
          </label>
          <button
            type="button" onClick={() => load(true)} disabled={refreshing || loading}
            style={{
              border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`, borderRadius: 10,
              background: isDark ? '#0B1220' : '#fff', color: isDark ? '#E2E8F0' : '#1F2937',
              padding: '9px 16px', fontSize: 12.5, fontWeight: 700,
              cursor: refreshing || loading ? 'not-allowed' : 'pointer', opacity: refreshing || loading ? 0.6 : 1,
            }}
          >
            {refreshing ? '⟳ Refreshing…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 14, borderRadius: 12, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Status Strip ── */}
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 20,
        borderRadius: 14, border: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}`,
        background: isDark ? '#0B1220' : '#FFFFFF',
        padding: '12px 20px', marginBottom: 16,
        boxShadow: isDark ? '0 4px 16px rgba(2,6,23,0.3)' : '0 2px 8px rgba(15,23,42,0.05)',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          background: isHealthy ? (isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5') : (isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2'),
          border: `1px solid ${isHealthy ? (isDark ? '#065F46' : '#A7F3D0') : (isDark ? '#7F1D1D' : '#FCA5A5')}`,
          borderRadius: 99, padding: '4px 12px',
        }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: isHealthy ? '#059669' : '#DC2626' }}>
            {isHealthy ? '● All Systems Operational' : '● Degraded Service'}
          </span>
        </div>
        <div style={{ width: 1, height: 20, background: isDark ? '#1E293B' : '#E5E7EB' }} />
        <StatusDot ok={health.api !== false} label="API" dark={isDark} />
        <StatusDot ok={health.db !== false} label="Database" dark={isDark} />
        <StatusDot ok={!monitoring?.maintenance?.enabled} label="Tenant Access" dark={isDark} />
        <div style={{ marginLeft: 'auto', fontSize: 11, color: isDark ? '#334155' : '#D1D5DB', fontFamily: 'monospace' }}>
          PID {server.pid || '—'} · Node {server.nodeVersion || '—'} · {server.nodeEnv || 'production'}
        </div>
      </div>

      {/* ── KPI Row 1 — Server & API ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 10 }}>
        <KPI label="Overall Health"    value={health.overall || '—'}        hint={health.db ? 'DB healthy' : 'DB degraded'}                          icon="🩺" dark={isDark} accent={isHealthy ? '#059669' : '#DC2626'} />
        <KPI label="Server Uptime"     value={formatUptime(server.uptimeSeconds)} hint={`Load ${server.loadAverage?.min1 ?? 0} / ${server.loadAverage?.min5 ?? 0}`} icon="⏱" dark={isDark} accent="#7C3AED" />
        <KPI label="API Requests"      value={(monitoring?.apiRealtime?.totalRequests ?? 0).toLocaleString()} hint="since last restart"              icon="📡" dark={isDark} accent="#2563EB" />
        <KPI label="P95 Response"      value={`${perfStats.p95}ms`}          hint={`P50 ${perfStats.p50}ms · P99 ${perfStats.p99}ms`}                icon="⚡" dark={isDark} accent={perfStats.p95 > 1000 ? '#DC2626' : perfStats.p95 > 500 ? '#D97706' : '#059669'} />
        <KPI label="Failure Rate 24h"  value={`${counts.notificationFailureRate24h ?? 0}%`} hint={`${counts.failedNotifications24h ?? 0} of ${counts.totalNotifications24h ?? 0}`} icon="📬" dark={isDark} accent={(counts.notificationFailureRate24h || 0) >= 20 ? '#DC2626' : '#10B981'} />
      </div>

      {/* ── KPI Row 2 — Tenants & Appointments ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        <KPI label="Total Tenants"     value={counts.tenants ?? '—'}         hint={`${counts.activeTenants ?? 0} active`}                            icon="🏢" dark={isDark} accent="#0EA5E9" />
        <KPI label="Active Tenants"    value={counts.activeTenants ?? '—'}   hint="running subscriptions"                                            icon="✅" dark={isDark} accent="#10B981" />
        <KPI label="Suspended"         value={counts.suspendedTenants ?? '—'} hint="restricted access"                                              icon="⏸" dark={isDark} accent={(counts.suspendedTenants || 0) > 0 ? '#F59E0B' : '#64748B'} />
        <KPI label="Appts Today"       value={counts.appointmentsToday ?? '—'} hint="active (not cancelled)"                                        icon="📅" dark={isDark} accent="#6366F1" />
        <KPI label="Cancel Rate 24h"   value={`${counts.cancellationRate24h ?? 0}%`} hint={`${counts.appointmentsCancelled24h ?? 0} cancelled`}     icon="❌" dark={isDark} accent={(counts.cancellationRate24h || 0) > 20 ? '#DC2626' : '#94A3B8'} />
      </div>

      {/* ── Alerts + Server Memory ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14, marginBottom: 14 }}>
        <Surface dark={isDark} title="Active Alerts" subtitle={`${alerts.length} alert${alerts.length !== 1 ? 's' : ''} in current snapshot`}>
          {loading ? (
            <div style={{ fontSize: 13, color: isDark ? '#475569' : '#94A3B8', padding: '8px 0' }}>Loading…</div>
          ) : alerts.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0' }}>
              <span style={{ fontSize: 22 }}>✅</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#059669' }}>All Clear</div>
                <div style={{ fontSize: 12, color: isDark ? '#475569' : '#94A3B8' }}>No active alerts. Platform looks healthy.</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {alerts.map((alert, idx) => {
                const p = pal[alert.severity] || pal.info;
                return (
                  <div key={`${alert.code}-${idx}`} style={{ borderRadius: 12, border: `1px solid ${p.border}`, background: p.bg, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: p.dot, flexShrink: 0 }} />
                      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.9, color: p.text }}>{alert.severity}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: p.text, opacity: 0.7 }}>{alert.code}</span>
                    </div>
                    <div style={{ marginTop: 5, fontSize: 13, fontWeight: 600, color: p.text, lineHeight: 1.4 }}>{alert.message}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Surface>

        <Surface dark={isDark} title="Server Resources" subtitle="Process memory and load average">
          <MemBar label="Heap Used"  used={server.memory?.heapUsed}  total={server.memory?.heapTotal} dark={isDark} color="#6366F1" />
          <MemBar label="RSS Memory" used={server.memory?.rss}       total={server.memory?.rss * 1.5 || 1} dark={isDark} color="#0EA5E9" />
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[['1m', server.loadAverage?.min1], ['5m', server.loadAverage?.min5], ['15m', server.loadAverage?.min15]].map(([label, val]) => (
              <div key={label} style={{ textAlign: 'center', padding: '9px 4px', borderRadius: 10, background: isDark ? '#0B1220' : '#F8FAFC', border: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}` }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: (val || 0) > 2 ? '#EF4444' : (val || 0) > 1 ? '#F59E0B' : '#10B981' }}>{val ?? '—'}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: isDark ? '#475569' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6 }}>Load {label}</div>
              </div>
            ))}
          </div>
        </Surface>
      </div>

      {/* ── Charts Row 1 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
        <Surface dark={isDark} title="Notification Failures — 24h" subtitle="Hourly failed delivery count">
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <AreaChart data={failureSeries} margin={{ left: -8, right: 8, top: 6, bottom: 0 }}>
                <defs>
                  <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#EF4444" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                <XAxis dataKey="label" tick={gridTick} interval={2} />
                <YAxis allowDecimals={false} tick={gridTick} />
                <Tooltip contentStyle={{ background: isDark ? '#111827' : '#fff', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 10, fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="#EF4444" strokeWidth={2.2} fill="url(#fg)" name="Failures" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Surface>

        <Surface dark={isDark} title="Tenant Distribution" subtitle="Active / Suspended / Cancelled">
          <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={tenantPieSeries} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''} labelLine={false}>
                  {tenantPieSeries.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: isDark ? '#111827' : '#fff', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 10, fontSize: 12 }} />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Surface>
      </div>

      {/* ── Charts Row 2 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Surface dark={isDark} title="Support Tickets — 7d" subtitle="New tickets per day">
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={ticketSeries} margin={{ left: -12, right: 6, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                <XAxis dataKey="label" tick={gridTick} />
                <YAxis allowDecimals={false} tick={gridTick} />
                <Tooltip contentStyle={{ background: isDark ? '#111827' : '#fff', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="count" fill="#6366F1" radius={[6, 6, 0, 0]} name="Tickets" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Surface>

        <Surface dark={isDark} title="Channel Delivery — 24h" subtitle="Sent vs failed by channel">
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={channelSeries} margin={{ left: -12, right: 6, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                <XAxis dataKey="channel" tick={gridTick} />
                <YAxis allowDecimals={false} tick={gridTick} />
                <Tooltip contentStyle={{ background: isDark ? '#111827' : '#fff', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="sent"   stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} name="Sent" />
                <Bar dataKey="failed" stackId="a" fill="#EF4444" radius={[6, 6, 0, 0]} name="Failed" />
                <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Surface>

        <Surface dark={isDark} title="HTTP Method Mix" subtitle="Request split since last restart">
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={methodSeries} margin={{ left: -12, right: 6, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                <XAxis dataKey="method" tick={gridTick} />
                <YAxis allowDecimals={false} tick={gridTick} />
                <Tooltip contentStyle={{ background: isDark ? '#111827' : '#fff', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Requests">
                  {methodSeries.map((_, i) => <Cell key={i} fill={['#2563EB','#7C3AED','#0EA5E9','#F59E0B','#EF4444'][i % 5]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Surface>
      </div>

      {/* ── Response Time Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Avg Response', value: `${perfStats.avg}ms`, color: '#10B981' },
          { label: 'P50 (Median)',  value: `${perfStats.p50}ms`, color: '#2563EB' },
          { label: 'P95',           value: `${perfStats.p95}ms`, color: perfStats.p95 > 500 ? '#D97706' : '#7C3AED' },
          { label: 'P99',           value: `${perfStats.p99}ms`, color: perfStats.p99 > 1000 ? '#DC2626' : '#0EA5E9' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ borderRadius: 12, border: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}`, background: isDark ? '#0B1220' : '#FFFFFF', padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: isDark ? '#475569' : '#94A3B8' }}>⚡ {label}</div>
            <div style={{ marginTop: 6, fontSize: 26, fontWeight: 900, lineHeight: 1, color }}>{value}</div>
            <div style={{ marginTop: 4, fontSize: 11, color: isDark ? '#334155' : '#D1D5DB' }}>from {(monitoring?.apiRealtime?.recent || []).length} samples</div>
          </div>
        ))}
      </div>

      {/* ── API Logs + Failed Notifications ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14 }}>
        <Surface dark={isDark} title="Recent API Requests" subtitle={`Last ${Math.min(recentApiRows.length, 50)} requests captured by middleware`}>
          <div style={{ maxHeight: 320, overflow: 'auto', borderRadius: 12, border: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: isDark ? '#0B1220' : '#F8FAFC', zIndex: 1 }}>
                  {['Time', 'Method', 'Path', 'Status', 'ms'].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 4 ? 'right' : 'left', padding: '9px 10px', fontSize: 11, fontWeight: 700, color: isDark ? '#475569' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, borderBottom: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentApiRows.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '16px 10px', color: isDark ? '#475569' : '#9CA3AF', fontSize: 12 }}>No request traces yet.</td></tr>
                ) : [...recentApiRows].reverse().slice(0, 50).map((row, idx) => {
                  const s = row.status || 0;
                  const sc = s >= 500 ? '#EF4444' : s >= 400 ? '#F59E0B' : '#10B981';
                  const ms = row.durationMs ?? 0;
                  const mc = ms > 1000 ? '#EF4444' : ms > 500 ? '#F59E0B' : isDark ? '#94A3B8' : '#6B7280';
                  return (
                    <tr key={`${row.at}-${idx}`} style={{ borderTop: `1px solid ${isDark ? '#0F172A' : '#F1F5F9'}` }}>
                      <td style={{ padding: '7px 10px', color: isDark ? '#475569' : '#9CA3AF', whiteSpace: 'nowrap' }}>{new Date(row.at).toLocaleTimeString()}</td>
                      <td style={{ padding: '7px 10px', fontWeight: 800, color: isDark ? '#E2E8F0' : '#0F172A', whiteSpace: 'nowrap' }}>{row.method}</td>
                      <td style={{ padding: '7px 10px', color: isDark ? '#94A3B8' : '#374151', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.path}>{row.path}</td>
                      <td style={{ padding: '7px 10px', fontWeight: 800, color: sc }}>{s}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: mc }}>{ms}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>

        <Surface dark={isDark} title="Failed Notifications" subtitle="Most recent delivery failures">
          {recentErrors.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0' }}>
              <span style={{ fontSize: 22 }}>📬</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#059669' }}>No Failures</div>
                <div style={{ fontSize: 12, color: isDark ? '#475569' : '#94A3B8' }}>All notifications delivered successfully.</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflow: 'auto' }}>
              {recentErrors.slice(0, 10).map((row) => (
                <div key={row.id} style={{ borderRadius: 12, border: `1px solid ${isDark ? '#2D1B1B' : '#FEE2E2'}`, background: isDark ? 'rgba(239,68,68,0.07)' : '#FFF5F5', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.7, color: isDark ? '#FCA5A5' : '#B91C1C', background: isDark ? 'rgba(239,68,68,0.18)' : '#FEE2E2', padding: '2px 7px', borderRadius: 6 }}>
                        {row.channel || 'unknown'}
                      </span>
                      {row.event_type && (
                        <span style={{ fontSize: 10, color: isDark ? '#64748B' : '#9CA3AF' }}>{row.event_type}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: isDark ? '#475569' : '#9CA3AF', whiteSpace: 'nowrap' }}>
                      {new Date(row.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: isDark ? '#CBD5E1' : '#374151', lineHeight: 1.4 }}>
                    {row.error_message || row.message_preview || 'Delivery failed'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Surface>
      </div>

    </div>
  );
}
