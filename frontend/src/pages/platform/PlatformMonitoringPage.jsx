import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart,
} from 'recharts';
import api from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';

const ALERT_COLORS = {
  critical: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
  high: { bg: '#FFEDD5', text: '#9A3412', border: '#FDBA74' },
  medium: { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
  info: { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' },
};

function Surface({ title, subtitle, children, dark = false, rightAction = null }) {
  return (
    <section
      style={{
        borderRadius: 18,
        border: `1px solid ${dark ? '#334155' : '#E5E7EB'}`,
        background: dark ? '#111827' : '#FFFFFF',
        boxShadow: dark ? '0 12px 26px rgba(2,6,23,0.34)' : '0 12px 24px rgba(15,23,42,0.07)',
        padding: '16px 16px 14px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: dark ? '#F8FAFC' : '#0F172A' }}>{title}</div>
          {subtitle && <div style={{ marginTop: 4, fontSize: 12, color: dark ? '#94A3B8' : '#64748B' }}>{subtitle}</div>}
        </div>
        {rightAction}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, hint, dark = false, accent = '#2563EB' }) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid ${dark ? '#334155' : '#E5E7EB'}`,
        background: dark ? '#0B1220' : '#FFFFFF',
        padding: '14px 14px 12px',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.75, color: dark ? '#94A3B8' : '#64748B' }}>
        {label}
      </div>
      <div style={{ marginTop: 7, fontSize: 24, fontWeight: 800, lineHeight: 1, color: accent }}>{value}</div>
      {hint && <div style={{ marginTop: 6, fontSize: 12, color: dark ? '#64748B' : '#94A3B8' }}>{hint}</div>}
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || Number.isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatUptime(seconds) {
  if (!seconds && seconds !== 0) return '0m';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function labelHour(isoHour) {
  if (!isoHour) return '--';
  const d = new Date(isoHour);
  return `${String(d.getHours()).padStart(2, '0')}:00`;
}

export default function PlatformMonitoringPage() {
  const { isDark } = useTheme();
  const [monitoring, setMonitoring] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadMonitoring = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const res = await api.get('/platform/system/monitoring');
      setMonitoring(res.data || null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load monitoring data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMonitoring(false);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => {
      loadMonitoring(true);
    }, 30000);
    return () => clearInterval(timer);
  }, [autoRefresh]);

  const counts = monitoring?.counts || {};
  const server = monitoring?.server || {};
  const health = monitoring?.health || {};
  const alerts = Array.isArray(monitoring?.alerts) ? monitoring.alerts : [];

  const failureSeries = useMemo(() => (
    (monitoring?.trends?.failedNotificationsByHour24h || []).map((item) => ({
      label: labelHour(item.hour),
      count: item.count || 0,
    }))
  ), [monitoring]);

  const ticketSeries = useMemo(() => (
    (monitoring?.trends?.ticketsCreatedByDay7d || []).map((item) => ({
      label: item.date?.slice(5) || '--',
      count: item.count || 0,
    }))
  ), [monitoring]);

  const channelSeries = useMemo(() => (
    (monitoring?.breakdowns?.notificationsByChannel24h || []).map((row) => ({
      channel: row.channel || 'unknown',
      sent: row.sent || 0,
      failed: row.failed || 0,
      total: row.total || 0,
    }))
  ), [monitoring]);

  const methodSeries = useMemo(() => (
    Object.entries(monitoring?.apiRealtime?.byMethod || {}).map(([method, count]) => ({ method, count }))
  ), [monitoring]);

  const statusSeries = useMemo(() => (
    Object.entries(monitoring?.apiRealtime?.byStatus || {}).map(([status, count]) => ({ status, count }))
  ), [monitoring]);

  const recentApiRows = monitoring?.apiRealtime?.recent || [];
  const recentErrors = monitoring?.recentFailedNotifications || [];

  const pageBg = isDark
    ? 'radial-gradient(circle at top left, rgba(56,189,248,0.15), transparent 35%), linear-gradient(180deg,#0F172A 0%, #0B1220 100%)'
    : 'radial-gradient(circle at top left, rgba(14,165,233,0.1), transparent 35%), linear-gradient(180deg,#F7FBFF 0%, #F5F7FA 100%)';

  return (
    <div style={{ width: '100%', minHeight: '100%', padding: '28px clamp(16px,2.4vw,34px) 44px', boxSizing: 'border-box', background: pageBg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1, color: isDark ? '#7DD3FC' : '#0369A1' }}>Platform Operations</div>
          <h1 style={{ margin: '8px 0 6px', fontSize: 34, lineHeight: 1.05, fontWeight: 900, color: isDark ? '#F8FAFC' : '#0F2A34' }}>Monitoring</h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: isDark ? '#94A3B8' : '#5B6B70' }}>
            Real-time health, API traffic, ticket trends, and notification reliability.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: isDark ? '#CBD5E1' : '#475467' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto refresh (30s)
          </label>
          <button
            type="button"
            onClick={() => loadMonitoring(true)}
            disabled={refreshing || loading}
            style={{
              border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
              background: isDark ? '#0B1220' : '#fff',
              color: isDark ? '#E2E8F0' : '#1F2937',
              borderRadius: 12,
              padding: '10px 13px',
              fontSize: 13,
              fontWeight: 700,
              cursor: refreshing || loading ? 'not-allowed' : 'pointer',
            }}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 14,
            borderRadius: 12,
            border: '1px solid #FECACA',
            background: '#FEF2F2',
            color: '#B91C1C',
            padding: '10px 12px',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Metric label="Overall Health" value={health.overall || 'unknown'} hint={health.db ? 'DB healthy' : 'DB degraded'} dark={isDark} accent={health.overall === 'healthy' ? '#059669' : '#DC2626'} />
        <Metric label="API Requests" value={monitoring?.apiRealtime?.totalRequests ?? 0} hint="since server start" dark={isDark} accent="#2563EB" />
        <Metric label="Failure Rate 24h" value={`${counts.notificationFailureRate24h ?? 0}%`} hint={`${counts.failedNotifications24h ?? 0} / ${counts.totalNotifications24h ?? 0} failed`} dark={isDark} accent={(counts.notificationFailureRate24h || 0) >= 20 ? '#DC2626' : '#0EA5E9'} />
        <Metric label="Server Uptime" value={formatUptime(server.uptimeSeconds)} hint={`Node ${server.nodeVersion || '-'}`} dark={isDark} accent="#7C3AED" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Surface dark={isDark} title="Active Alerts" subtitle="Policy-based platform alerts in current snapshot.">
          {loading ? (
            <div style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B' }}>Loading alerts...</div>
          ) : alerts.length === 0 ? (
            <div style={{ fontSize: 13, color: '#059669', fontWeight: 700 }}>No active alerts. Platform looks healthy.</div>
          ) : (
            <div style={{ display: 'grid', gap: 9 }}>
              {alerts.map((alert, idx) => {
                const palette = ALERT_COLORS[alert.severity] || ALERT_COLORS.info;
                return (
                  <div
                    key={`${alert.code || 'ALERT'}-${idx}`}
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${palette.border}`,
                      background: palette.bg,
                      padding: '9px 10px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: palette.text }}>
                        {alert.severity || 'info'}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: palette.text, opacity: 0.8 }}>{alert.code || 'ALERT'}</div>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: palette.text }}>{alert.message}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Surface>

        <Surface dark={isDark} title="Server Runtime" subtitle="Live process and memory details.">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Metric label="Heap Used" value={formatBytes(server.memory?.heapUsed)} hint={`Heap total ${formatBytes(server.memory?.heapTotal)}`} dark={isDark} accent="#F59E0B" />
            <Metric label="RSS" value={formatBytes(server.memory?.rss)} hint={`PID ${server.pid || '-'}`} dark={isDark} accent="#0EA5E9" />
            <Metric label="Load avg (1m)" value={server.loadAverage?.min1 ?? 0} hint={`5m ${server.loadAverage?.min5 ?? 0} | 15m ${server.loadAverage?.min15 ?? 0}`} dark={isDark} accent="#8B5CF6" />
            <Metric label="Runtime" value={server.platform || '-'} hint={server.nodeEnv || 'development'} dark={isDark} accent="#14B8A6" />
          </div>
        </Surface>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14, marginBottom: 14 }}>
        <Surface dark={isDark} title="Notification Failures (24h)" subtitle="Hourly failure distribution from notification logs.">
          <div style={{ width: '100%', height: 255 }}>
            <ResponsiveContainer>
              <AreaChart data={failureSeries} margin={{ left: -8, right: 8, top: 6, bottom: 0 }}>
                <defs>
                  <linearGradient id="failureGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1E293B' : '#E5E7EB'} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#6B7280' }} interval={2} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#6B7280' }} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#EF4444" strokeWidth={2} fill="url(#failureGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Surface>

        <Surface dark={isDark} title="Tickets (7d)" subtitle="New support ticket trend per day.">
          <div style={{ width: '100%', height: 255 }}>
            <ResponsiveContainer>
              <BarChart data={ticketSeries} margin={{ left: -10, right: 8, top: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1E293B' : '#E5E7EB'} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#6B7280' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#6B7280' }} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563EB" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Surface>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Surface dark={isDark} title="Channel Delivery (24h)" subtitle="Sent vs failed by notification channel.">
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={channelSeries} margin={{ left: -10, right: 8, top: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1E293B' : '#E5E7EB'} />
                <XAxis dataKey="channel" tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#6B7280' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#6B7280' }} />
                <Tooltip />
                <Bar dataKey="sent" stackId="a" fill="#10B981" radius={[8, 8, 0, 0]} />
                <Bar dataKey="failed" stackId="a" fill="#EF4444" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Surface>

        <Surface dark={isDark} title="API Method Mix" subtitle="Request count by HTTP method since process start.">
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={methodSeries} margin={{ left: -12, right: 8, top: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1E293B' : '#E5E7EB'} />
                <XAxis dataKey="method" tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#6B7280' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#6B7280' }} />
                <Tooltip />
                <Bar dataKey="count" fill="#7C3AED" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Surface>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 14 }}>
        <Surface dark={isDark} title="Recent API Activity" subtitle="Last requests captured by middleware.">
          <div style={{ maxHeight: 310, overflow: 'auto', borderRadius: 12, border: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: isDark ? '#0B1220' : '#F8FAFC', zIndex: 1 }}>
                  <th style={{ textAlign: 'left', padding: '10px 11px', color: isDark ? '#94A3B8' : '#6B7280' }}>Time</th>
                  <th style={{ textAlign: 'left', padding: '10px 11px', color: isDark ? '#94A3B8' : '#6B7280' }}>Method</th>
                  <th style={{ textAlign: 'left', padding: '10px 11px', color: isDark ? '#94A3B8' : '#6B7280' }}>Path</th>
                  <th style={{ textAlign: 'left', padding: '10px 11px', color: isDark ? '#94A3B8' : '#6B7280' }}>Status</th>
                  <th style={{ textAlign: 'right', padding: '10px 11px', color: isDark ? '#94A3B8' : '#6B7280' }}>ms</th>
                </tr>
              </thead>
              <tbody>
                {recentApiRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '14px 11px', color: isDark ? '#94A3B8' : '#6B7280' }}>No request traces yet.</td>
                  </tr>
                ) : recentApiRows.slice().reverse().slice(0, 40).map((row, idx) => {
                  const status = row.status || 0;
                  const statusColor = status >= 500 ? '#DC2626' : status >= 400 ? '#D97706' : '#059669';
                  return (
                    <tr key={`${row.at}-${idx}`} style={{ borderTop: `1px solid ${isDark ? '#1E293B' : '#F1F5F9'}` }}>
                      <td style={{ padding: '8px 11px', color: isDark ? '#CBD5E1' : '#334155' }}>{new Date(row.at).toLocaleTimeString()}</td>
                      <td style={{ padding: '8px 11px', color: isDark ? '#E2E8F0' : '#0F172A', fontWeight: 700 }}>{row.method}</td>
                      <td style={{ padding: '8px 11px', color: isDark ? '#CBD5E1' : '#334155', maxWidth: 360, wordBreak: 'break-all' }}>{row.path}</td>
                      <td style={{ padding: '8px 11px', color: statusColor, fontWeight: 700 }}>{status}</td>
                      <td style={{ padding: '8px 11px', color: isDark ? '#CBD5E1' : '#334155', textAlign: 'right' }}>{row.durationMs ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>

        <Surface dark={isDark} title="Failures & Status Codes" subtitle="Latest delivery errors and HTTP status distribution.">
          <div style={{ width: '100%', height: 170, marginBottom: 10 }}>
            <ResponsiveContainer>
              <LineChart data={statusSeries} margin={{ left: -10, right: 8, top: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1E293B' : '#E5E7EB'} />
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#6B7280' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#6B7280' }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#F97316" strokeWidth={2.2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'grid', gap: 8, maxHeight: 130, overflow: 'auto' }}>
            {recentErrors.length === 0 ? (
              <div style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#6B7280' }}>No failed notification samples available.</div>
            ) : recentErrors.slice(0, 8).map((row) => (
              <div
                key={row.id}
                style={{
                  borderRadius: 10,
                  border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`,
                  background: isDark ? '#0B1220' : '#FFFFFF',
                  padding: '8px 9px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: isDark ? '#FCA5A5' : '#B91C1C' }}>{row.channel || 'unknown'}</div>
                  <div style={{ fontSize: 10, color: isDark ? '#94A3B8' : '#64748B' }}>{new Date(row.createdAt).toLocaleString()}</div>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: isDark ? '#CBD5E1' : '#334155' }}>{row.error_message || row.message_preview || 'Failed delivery'}</div>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  );
}
