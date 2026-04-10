import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';

const SEVERITY_COLORS = {
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
        boxShadow: dark ? '0 12px 28px rgba(2,6,23,0.35)' : '0 12px 26px rgba(15,23,42,0.08)',
        padding: '18px 18px 16px',
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

export default function PlatformSystemControlPage() {
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });

  const [maintenance, setMaintenance] = useState({
    enabled: false,
    message: 'System is under maintenance. Please try again later.',
    durationMinutes: 60,
    endsAt: null,
  });

  const [monitoring, setMonitoring] = useState(null);
  const [logs, setLogs] = useState([]);

  const loadData = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const [maintenanceRes, logsRes, monitoringRes] = await Promise.all([
        api.get('/platform/system/maintenance'),
        api.get('/platform/system/maintenance/logs'),
        api.get('/platform/system/monitoring'),
      ]);

      const m = maintenanceRes.data || {};
      setMaintenance((prev) => ({
        ...prev,
        enabled: !!m.enabled,
        message: m.message || prev.message,
        endsAt: m.endsAt || null,
      }));

      setLogs(Array.isArray(logsRes.data?.logs) ? logsRes.data.logs : []);
      setMonitoring(monitoringRes.data || null);
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'Failed to load system control data.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  const saveMaintenance = async () => {
    setSaving(true);
    setNotice({ type: '', text: '' });
    try {
      const res = await api.patch('/platform/system/maintenance', {
        enabled: !!maintenance.enabled,
        message: maintenance.message,
        durationMinutes: maintenance.durationMinutes,
      });

      setMaintenance((prev) => ({
        ...prev,
        enabled: !!res.data?.enabled,
        message: res.data?.message || prev.message,
        endsAt: res.data?.endsAt || null,
      }));

      setNotice({
        type: 'success',
        text: res.data?.enabled
          ? 'Maintenance mode is now enabled for tenant operations.'
          : 'Maintenance mode is now disabled.',
      });

      await loadData(true);
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'Failed to update maintenance mode.' });
    } finally {
      setSaving(false);
    }
  };

  const cardBg = isDark
    ? 'radial-gradient(circle at top left, rgba(45,212,191,0.14), transparent 30%), linear-gradient(180deg,#0F172A 0%, #0B1220 100%)'
    : 'radial-gradient(circle at top left, rgba(20,184,166,0.10), transparent 30%), linear-gradient(180deg,#F8FFFC 0%, #F7F8FA 100%)';

  const alerts = monitoring?.alerts || [];
  const counts = monitoring?.counts || {};
  const server = monitoring?.server || {};
  const maintenanceLogs = logs;

  const healthSummary = useMemo(() => {
    const api = monitoring?.health?.api ? 'Online' : 'Down';
    const db = monitoring?.health?.db ? 'Healthy' : 'Issue';
    const overall = monitoring?.health?.overall || 'unknown';
    return { api, db, overall };
  }, [monitoring]);

  return (
    <div style={{ width: '100%', minHeight: '100%', padding: '28px clamp(16px,2.4vw,34px) 44px', boxSizing: 'border-box', background: cardBg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1, color: isDark ? '#5EEAD4' : '#0F766E' }}>Platform Operations</div>
          <h1 style={{ margin: '8px 0 6px', fontSize: 34, lineHeight: 1.05, fontWeight: 900, color: isDark ? '#F8FAFC' : '#0F2A34' }}>System Control</h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: isDark ? '#94A3B8' : '#5B6B70' }}>
            Manage platform maintenance mode, monitor service health, and review control logs.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadData(true)}
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
          {refreshing ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Metric label="API" value={healthSummary.api} hint="Service endpoint" dark={isDark} accent={healthSummary.api === 'Online' ? '#059669' : '#DC2626'} />
        <Metric label="Database" value={healthSummary.db} hint="Connection status" dark={isDark} accent={healthSummary.db === 'Healthy' ? '#0EA5E9' : '#DC2626'} />
        <Metric label="Server Uptime" value={formatUptime(server.uptimeSeconds)} hint={`Node ${server.nodeVersion || '-'}`} dark={isDark} accent="#7C3AED" />
        <Metric label="Heap Used" value={formatBytes(server.memory?.heapUsed)} hint={`RSS ${formatBytes(server.memory?.rss)}`} dark={isDark} accent="#F59E0B" />
      </div>

      {notice.text && (
        <div
          style={{
            marginBottom: 14,
            borderRadius: 12,
            border: notice.type === 'error' ? '1px solid #FECACA' : '1px solid #A7F3D0',
            background: notice.type === 'error' ? '#FEF2F2' : '#ECFDF5',
            color: notice.type === 'error' ? '#B91C1C' : '#065F46',
            padding: '10px 12px',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {notice.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
        <Surface dark={isDark} title="Maintenance Mode" subtitle="Enable maintenance and set tenant-facing notice.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: isDark ? '#E2E8F0' : '#1E293B' }}>
              <input
                type="checkbox"
                checked={maintenance.enabled}
                onChange={(e) => setMaintenance((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
              Enable Maintenance Mode
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 10 }}>
              <label>
                <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 6 }}>Duration (minutes)</div>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={maintenance.durationMinutes}
                  onChange={(e) => setMaintenance((prev) => ({ ...prev, durationMinutes: Number(e.target.value || 1) }))}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    borderRadius: 10,
                    border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
                    background: isDark ? '#0B1220' : '#fff',
                    color: isDark ? '#E2E8F0' : '#111827',
                    padding: '9px 10px',
                    fontSize: 13,
                  }}
                />
              </label>

              <div style={{ alignSelf: 'end', fontSize: 12, color: isDark ? '#94A3B8' : '#6B7280' }}>
                {maintenance.endsAt
                  ? `Current window ends at ${new Date(maintenance.endsAt).toLocaleString()}`
                  : 'No active maintenance end time set.'}
              </div>
            </div>

            <label>
              <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 6 }}>Tenant Message</div>
              <textarea
                rows={3}
                value={maintenance.message}
                onChange={(e) => setMaintenance((prev) => ({ ...prev, message: e.target.value }))}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  borderRadius: 10,
                  border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
                  background: isDark ? '#0B1220' : '#fff',
                  color: isDark ? '#E2E8F0' : '#111827',
                  padding: '9px 10px',
                  fontSize: 13,
                  resize: 'vertical',
                }}
              />
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={saveMaintenance}
                disabled={saving || loading}
                style={{
                  border: 'none',
                  borderRadius: 10,
                  background: maintenance.enabled ? '#DC2626' : '#4338CA',
                  color: '#fff',
                  padding: '9px 14px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: saving || loading ? 'not-allowed' : 'pointer',
                  opacity: saving || loading ? 0.75 : 1,
                }}
              >
                {saving ? 'Saving...' : 'Save Maintenance Mode'}
              </button>
              <span style={{ fontSize: 12, color: maintenance.enabled ? '#B91C1C' : (isDark ? '#94A3B8' : '#6B7280') }}>
                {maintenance.enabled ? 'Tenant operations are currently limited.' : 'Platform is open for normal tenant operations.'}
              </span>
            </div>
          </div>
        </Surface>

        <Surface dark={isDark} title="Current Load" subtitle="Quick operational counters">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Metric label="Open Tickets" value={loading ? '…' : (counts.openTickets ?? 0)} dark={isDark} accent="#F59E0B" />
            <Metric label="Urgent Tickets" value={loading ? '…' : (counts.urgentOpenTickets ?? 0)} dark={isDark} accent="#EF4444" />
            <Metric label="Failed Notif 24h" value={loading ? '…' : (counts.failedNotifications24h ?? 0)} dark={isDark} accent="#DC2626" />
            <Metric label="Appointments Today" value={loading ? '…' : (counts.appointmentsToday ?? 0)} dark={isDark} accent="#2563EB" />
          </div>
        </Surface>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Surface dark={isDark} title="Active Alerts" subtitle="Automated health alerts from monitoring service.">
          {alerts.length === 0 ? (
            <div style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#6B7280' }}>No active alerts. System looks stable.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.map((alert, idx) => {
                const palette = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info;
                return (
                  <div
                    key={`${alert.code}-${idx}`}
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${palette.border}`,
                      background: palette.bg,
                      color: palette.text,
                      padding: '8px 10px',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.7 }}>
                      {alert.severity} · {alert.code}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 13, lineHeight: 1.4 }}>{alert.message}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Surface>

        <Surface dark={isDark} title="Maintenance Logs" subtitle="Recent changes made by platform admins.">
          {maintenanceLogs.length === 0 ? (
            <div style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#6B7280' }}>No maintenance changes recorded yet.</div>
          ) : (
            <div style={{ maxHeight: 290, overflowY: 'auto', borderRadius: 10, border: `1px solid ${isDark ? '#1F2937' : '#F1F5F9'}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: isDark ? '#0B1220' : '#F8FAFC', borderBottom: `1px solid ${isDark ? '#1F2937' : '#E5E7EB'}` }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: isDark ? '#94A3B8' : '#64748B' }}>Time</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: isDark ? '#94A3B8' : '#64748B' }}>Changed By</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: isDark ? '#94A3B8' : '#64748B' }}>State</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenanceLogs.map((row) => (
                    <tr key={row.id} style={{ borderBottom: `1px solid ${isDark ? '#1F2937' : '#F8FAFC'}` }}>
                      <td style={{ padding: '8px 10px', color: isDark ? '#E2E8F0' : '#1F2937' }}>
                        {row.createdAt ? new Date(row.createdAt).toLocaleString() : '-'}
                      </td>
                      <td style={{ padding: '8px 10px', color: isDark ? '#94A3B8' : '#475467' }}>
                        {row.changedBy?.name || row.changedBy?.username || 'system'}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span
                          style={{
                            borderRadius: 999,
                            padding: '3px 8px',
                            fontSize: 11,
                            fontWeight: 700,
                            background: row.enabled ? '#FEE2E2' : '#ECFDF5',
                            color: row.enabled ? '#B91C1C' : '#065F46',
                          }}
                        >
                          {row.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
}
