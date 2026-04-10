import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import api from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';

const PLAN_COLORS = {
  trial:      '#F59E0B',
  basic:      '#3B82F6',
  pro:        '#7C3AED',
  enterprise: '#059669',
};

const STATUS_COLORS = {
  active:    { bg: '#D1FAE5', text: '#065F46', dot: '#10B981' },
  suspended: { bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },
  cancelled: { bg: '#F3F4F6', text: '#374151', dot: '#9CA3AF' },
};

const STATUS_LABELS = {
  active: 'Active',
  suspended: 'Suspended',
  cancelled: 'Cancelled',
};

function MetricCard({ label, value, sub, accent = '#4338CA', dark = false, featured = false }) {
  if (featured) {
    return (
      <div style={{
        borderRadius: 18,
        padding: '22px 22px 18px',
        minWidth: 170,
        flex: '1 1 170px',
        background: dark
          ? 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)'
          : 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)',
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: dark ? '0 14px 30px rgba(2, 6, 23, 0.5)' : '0 14px 30px rgba(22, 33, 61, 0.22)',
      }}>
        <div style={{
          position: 'absolute',
          top: -26,
          right: -26,
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
        }} />
        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.75, textTransform: 'uppercase', letterSpacing: 0.85 }}>
          {label}
        </div>
        <div style={{ fontSize: 36, fontWeight: 800, marginTop: 9, lineHeight: 1 }}>
          {value ?? '—'}
        </div>
        {sub && (
          <div style={{ marginTop: 10, fontSize: 11, opacity: 0.78, background: 'rgba(255,255,255,0.14)', borderRadius: 999, display: 'inline-flex', padding: '3px 9px' }}>
            {sub}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      borderRadius: 18,
      padding: '20px 20px 18px',
      border: `1px solid ${dark ? '#334155' : '#E5E7EB'}`,
      background: dark ? '#111827' : '#fff',
      boxShadow: dark ? '0 10px 24px rgba(2, 6, 23, 0.3)' : '0 8px 20px rgba(15, 23, 42, 0.08)',
      flex: '1 1 170px',
      minWidth: 170,
    }}>
      <div style={{ fontSize: 12, color: dark ? '#94A3B8' : '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 7 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: accent, letterSpacing: '-1px', lineHeight: 1.05 }}>
        {value ?? '—'}
      </div>
      {sub && <div style={{ fontSize: 12, color: dark ? '#64748B' : '#98A2B3', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function SurfaceCard({ title, subtitle, children, dark = false, rightAction = null }) {
  return (
    <div style={{
      borderRadius: 20,
      border: `1px solid ${dark ? '#334155' : '#E5E7EB'}`,
      background: dark ? '#111827' : '#fff',
      boxShadow: dark ? '0 14px 32px rgba(2, 6, 23, 0.35)' : '0 14px 30px rgba(15, 23, 42, 0.08)',
      padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: dark ? '#F8FAFC' : '#1E1B4B' }}>{title}</div>
          {subtitle && <div style={{ marginTop: 4, fontSize: 12, color: dark ? '#94A3B8' : '#6B7280' }}>{subtitle}</div>}
        </div>
        {rightAction}
      </div>
      {children}
    </div>
  );
}

function StatusPill({ status }) {
  const palette = STATUS_COLORS[status] ?? STATUS_COLORS.cancelled;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      background: palette.bg,
      color: palette.text,
      padding: '4px 10px',
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'capitalize',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: palette.dot, flexShrink: 0 }} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default function PlatformDashboardPage() {
  const { isDark } = useTheme();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [maintenance, setMaintenance] = useState({
    enabled: false,
    message: 'System is under maintenance. Please try again later.',
  });
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });

  useEffect(() => {
    Promise.all([
      api.get('/platform/stats'),
      api.get('/platform/system/maintenance'),
    ])
      .then(([statsRes, maintenanceRes]) => {
        setStats(statsRes.data);
        setMaintenance({
          enabled: !!maintenanceRes.data?.enabled,
          message: maintenanceRes.data?.message || 'System is under maintenance. Please try again later.',
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const saveMaintenance = async () => {
    setSavingMaintenance(true);
    setNotice({ type: '', text: '' });
    try {
      const res = await api.patch('/platform/system/maintenance', {
        enabled: !!maintenance.enabled,
        message: maintenance.message,
      });
      setMaintenance({
        enabled: !!res.data?.enabled,
        message: res.data?.message || maintenance.message,
      });
      setNotice({
        type: 'success',
        text: res.data?.enabled ? 'Maintenance mode enabled for all tenants.' : 'Maintenance mode disabled. Tenants can continue operations.',
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: err?.response?.data?.message || 'Failed to update maintenance mode.',
      });
    } finally {
      setSavingMaintenance(false);
    }
  };

  const planDist = useMemo(() => (
    stats
      ? Object.entries(stats.byPlan || {}).map(([plan, count]) => ({ name: plan, value: count }))
      : []
  ), [stats]);

  const statusDist = useMemo(() => (
    stats
      ? Object.entries(stats.byStatus || {}).map(([status, count]) => ({
        name: STATUS_LABELS[status] ?? status,
        value: count,
        key: status,
      }))
      : []
  ), [stats]);

  const recentTenants = stats?.recentTenants || [];

  const pageBg = isDark
    ? 'radial-gradient(circle at top left, rgba(16,185,129,0.15), transparent 34%), linear-gradient(180deg, #0F172A 0%, #0B1220 100%)'
    : 'radial-gradient(circle at top left, rgba(16,185,129,0.09), transparent 34%), linear-gradient(180deg, #F8FBFA 0%, #F4F4F0 100%)';

  const mrr = stats?.estimatedMrr ? `$${stats.estimatedMrr.toLocaleString()}` : '$0';

  return (
    <div style={{ padding: '28px clamp(16px, 2.5vw, 34px) 44px', width: '100%', minHeight: '100%', background: pageBg, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.1, textTransform: 'uppercase', color: isDark ? '#6EE7B7' : '#0F766E' }}>
            Platform analytics
          </div>
          <h1 style={{ margin: '8px 0 6px', fontSize: 34, lineHeight: 1.05, fontWeight: 900, color: isDark ? '#F8FAFC' : '#0F2A34' }}>
            Platform Overview
          </h1>
          <p style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#5B6B70', margin: 0, lineHeight: 1.55 }}>
            Live tenant health, subscriptions, and system status in one view.
          </p>
        </div>

        <div style={{
          borderRadius: 14,
          border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
          background: isDark ? '#0B1220' : '#FFFFFF',
          padding: '10px 12px',
          minWidth: 176,
          boxShadow: isDark ? '0 10px 20px rgba(2, 6, 23, 0.3)' : '0 8px 18px rgba(15, 23, 42, 0.07)',
        }}>
          <div style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#6B7280', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.8 }}>Snapshot date</div>
          <div style={{ marginTop: 4, fontSize: 13, color: isDark ? '#E2E8F0' : '#0F172A', fontWeight: 700 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <SurfaceCard
          dark={isDark}
          title="System Control"
          subtitle="Toggle platform-wide maintenance and control the message shown to tenants."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1E1B4B', fontWeight: 700, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={maintenance.enabled}
              onChange={(e) => setMaintenance((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            <span style={{ color: isDark ? '#E2E8F0' : '#1E1B4B' }}>Enable Maintenance Mode</span>
          </label>

          <textarea
            rows={3}
            value={maintenance.message}
            onChange={(e) => setMaintenance((prev) => ({ ...prev, message: e.target.value }))}
            style={{
              border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 13,
              resize: 'vertical',
              background: isDark ? '#0B1220' : '#FFFFFF',
              color: isDark ? '#E2E8F0' : '#111827',
            }}
            placeholder="Message shown to salons when maintenance mode is active"
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={saveMaintenance}
              disabled={savingMaintenance}
              style={{
                border: 'none',
                background: maintenance.enabled ? '#DC2626' : '#4338CA',
                color: '#fff',
                borderRadius: 10,
                padding: '9px 14px',
                fontSize: 13,
                fontWeight: 700,
                cursor: savingMaintenance ? 'not-allowed' : 'pointer',
                opacity: savingMaintenance ? 0.7 : 1,
                boxShadow: maintenance.enabled
                  ? '0 10px 18px rgba(220,38,38,0.22)'
                  : '0 10px 18px rgba(67,56,202,0.22)',
              }}
            >
              {savingMaintenance ? 'Saving...' : 'Save System Mode'}
            </button>
            <span style={{ fontSize: 12, color: maintenance.enabled ? '#B91C1C' : (isDark ? '#94A3B8' : '#6B7280') }}>
              {maintenance.enabled ? 'Tenant operations are currently locked.' : 'System is currently open for tenants.'}
            </span>
          </div>

          {notice.text && (
            <div style={{
              borderRadius: 10,
              padding: '8px 11px',
              fontSize: 12,
              border: notice.type === 'error' ? '1px solid #FECACA' : '1px solid #A7F3D0',
              background: notice.type === 'error' ? '#FEF2F2' : '#ECFDF5',
              color: notice.type === 'error' ? '#B91C1C' : '#065F46',
            }}>
              {notice.text}
            </div>
          )}
          </div>
        </SurfaceCard>
        </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <MetricCard
          label="Total Tenants"
          value={loading ? '…' : (stats?.totalTenants ?? 0)}
          sub={!loading && stats?.activeTrials > 0 ? `${stats.activeTrials} on trial` : 'Live tenant count'}
          featured
          dark={isDark}
        />

        <MetricCard
          label="Active Paid"
          value={loading ? '…' : (stats?.activePaid ?? 0)}
          sub="Subscriptions live"
          accent="#059669"
          dark={isDark}
        />
        <MetricCard
          label="Active Trials"
          value={loading ? '…' : (stats?.activeTrials ?? 0)}
          sub="Trial period"
          accent="#F59E0B"
          dark={isDark}
        />
        <MetricCard
          label="Suspended"
          value={loading ? '…' : (stats?.suspended ?? 0)}
          sub="Blocked tenants"
          accent="#EF4444"
          dark={isDark}
        />
        <MetricCard
          label="Est. MRR"
          value={loading ? '…' : mrr}
          sub="Monthly recurring"
          accent="#7C3AED"
          dark={isDark}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <SurfaceCard title="Plan Distribution" subtitle="Tenant mix across active plans" dark={isDark}>
          {!loading && planDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={planDist} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                  {planDist.map((entry) => (
                    <Cell key={entry.name} fill={PLAN_COLORS[entry.name] ?? '#6B7280'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isDark ? '#64748B' : '#9CA3AF', fontSize: 13 }}>
              {loading ? 'Loading…' : 'No data'}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 8 }}>
            {Object.entries(PLAN_COLORS).map(([plan, color]) => (
              <div key={plan} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: isDark ? '#94A3B8' : '#6B7280' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                <span style={{ textTransform: 'capitalize' }}>{plan}</span>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard title="Status Overview" subtitle="Tenant states at a glance" dark={isDark}>
          {!loading && statusDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={statusDist} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#E5E7EB'} />
                <XAxis dataKey="name" tick={{ fill: isDark ? '#94A3B8' : '#6B7280', fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: isDark ? '#94A3B8' : '#6B7280', fontSize: 12 }} />
                <Tooltip cursor={{ fill: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(71,85,105,0.06)' }} />
                <Bar dataKey="value" radius={[7, 7, 0, 0]}>
                  {statusDist.map((item) => (
                    <Cell key={item.key} fill={(STATUS_COLORS[item.key] ?? STATUS_COLORS.cancelled).dot} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isDark ? '#64748B' : '#9CA3AF', fontSize: 13 }}>
              {loading ? 'Loading…' : 'No data'}
            </div>
          )}
          <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {statusDist.map((item) => (
              <StatusPill key={item.key} status={item.key} />
            ))}
          </div>
        </SurfaceCard>
      </div>

      <SurfaceCard title="Recent Sign-ups" subtitle="Latest tenant onboarding activity" dark={isDark}>
          {loading ? (
            <div style={{ color: isDark ? '#94A3B8' : '#9CA3AF', fontSize: 13 }}>Loading…</div>
          ) : (recentTenants.length > 0) ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${isDark ? '#334155' : '#F1F5F9'}` }}>
                  {['Salon', 'Slug', 'Plan', 'Status', 'Registered'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 8px', color: isDark ? '#94A3B8' : '#9CA3AF', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.65 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentTenants.map(t => {
                  return (
                    <tr key={t.id} style={{ borderBottom: `1px solid ${isDark ? '#1F2937' : '#F9FAFB'}` }}>
                      <td style={{ padding: '10px 8px', fontWeight: 700, color: isDark ? '#F8FAFC' : '#1E1B4B' }}>{t.name}</td>
                      <td style={{ padding: '10px 8px', color: isDark ? '#94A3B8' : '#6B7280', fontFamily: 'monospace', fontSize: 12 }}>{t.slug}</td>
                      <td style={{ padding: '8px 8px' }}>
                        <span style={{ background: `${PLAN_COLORS[t.plan] ?? '#6B7280'}22`, color: PLAN_COLORS[t.plan] ?? '#6B7280', borderRadius: 999, padding: '4px 9px', fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>
                          {t.plan}
                        </span>
                      </td>
                      <td style={{ padding: '8px 8px' }}>
                        <StatusPill status={t.status} />
                      </td>
                      <td style={{ padding: '8px 8px', color: isDark ? '#94A3B8' : '#9CA3AF', fontSize: 11 }}>
                        {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ color: isDark ? '#94A3B8' : '#9CA3AF', fontSize: 13 }}>No tenants yet.</div>
          )}
      </SurfaceCard>
    </div>
  );
}
