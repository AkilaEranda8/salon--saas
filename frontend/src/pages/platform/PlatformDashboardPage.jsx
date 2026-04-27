import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import api from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';

/* ─── Colours ────────────────────────────────────────────────────── */
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

const STATUS_LABELS = { active: 'Active', suspended: 'Suspended', cancelled: 'Cancelled' };

/* ─── Tiny SVG icons ─────────────────────────────────────────────── */
const Ico = ({ d, size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ICONS = {
  tenants:   'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  paid:      'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  trial:     'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  suspended: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
  mrr:       'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  wrench:    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  calendar:  'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
};

/* ─── Toggle Switch ──────────────────────────────────────────────── */
function Toggle({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 48, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer',
        background: checked ? '#10B981' : '#D1D5DB',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 25 : 3,
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.22)', transition: 'left 0.2s',
      }} />
    </button>
  );
}

/* ─── Metric Card ────────────────────────────────────────────────── */
function MetricCard({ label, value, sub, accent, iconPath, dark, gradient }) {
  const cardStyle = gradient
    ? { background: gradient, color: '#fff', boxShadow: '0 12px 28px rgba(0,0,0,0.18)' }
    : {
        background: dark ? '#1E293B' : '#fff',
        border: `1px solid ${dark ? '#334155' : '#E5E7EB'}`,
        boxShadow: dark ? '0 8px 20px rgba(0,0,0,0.25)' : '0 4px 16px rgba(15,23,42,0.07)',
      };

  const textColor = gradient ? 'rgba(255,255,255,0.8)' : (dark ? '#94A3B8' : '#6B7280');
  const valueColor = gradient ? '#fff' : (accent || (dark ? '#F1F5F9' : '#0F172A'));
  const iconBg = gradient ? 'rgba(255,255,255,0.18)' : (dark ? 'rgba(255,255,255,0.06)' : `${accent}18`);
  const iconColor = gradient ? '#fff' : (accent || '#6B7280');

  return (
    <div style={{ borderRadius: 18, padding: '20px 22px', flex: '1 1 160px', minWidth: 155, ...cardStyle }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.9, color: textColor }}>
          {label}
        </div>
        {iconPath && (
          <div style={{ width: 34, height: 34, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColor }}>
            <Ico d={iconPath} size={17} color={iconColor} />
          </div>
        )}
      </div>
      <div style={{ fontSize: 34, fontWeight: 800, color: valueColor, letterSpacing: '-1.5px', lineHeight: 1 }}>
        {value ?? '—'}
      </div>
      {sub && (
        <div style={{ marginTop: 8, fontSize: 11, color: gradient ? 'rgba(255,255,255,0.65)' : textColor }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/* ─── Surface Card ───────────────────────────────────────────────── */
function Card({ title, subtitle, icon, children, dark, action, noPad }) {
  return (
    <div style={{
      borderRadius: 20,
      border: `1px solid ${dark ? '#334155' : '#E8ECEF'}`,
      background: dark ? '#1E293B' : '#fff',
      boxShadow: dark ? '0 10px 28px rgba(0,0,0,0.3)' : '0 4px 20px rgba(15,23,42,0.07)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${dark ? '#334155' : '#F1F5F9'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {icon && (
            <div style={{ width: 32, height: 32, borderRadius: 9, background: dark ? 'rgba(255,255,255,0.07)' : '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: dark ? '#818CF8' : '#4F46E5' }}>
              <Ico d={icon} size={16} color={dark ? '#818CF8' : '#4F46E5'} />
            </div>
          )}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: dark ? '#F1F5F9' : '#111827' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: dark ? '#64748B' : '#9CA3AF', marginTop: 1 }}>{subtitle}</div>}
          </div>
        </div>
        {action}
      </div>
      <div style={noPad ? {} : { padding: '16px 22px' }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Status Pill ────────────────────────────────────────────────── */
function StatusPill({ status }) {
  const p = STATUS_COLORS[status] ?? STATUS_COLORS.cancelled;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 999, background: p.bg, color: p.text, padding: '3px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.dot, flexShrink: 0 }} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/* ─── Custom Tooltip ─────────────────────────────────────────────── */
function ChartTooltip({ active, payload, label, dark }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: dark ? '#1E293B' : '#fff', border: `1px solid ${dark ? '#334155' : '#E5E7EB'}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
      <div style={{ fontWeight: 700, color: dark ? '#F1F5F9' : '#111827', marginBottom: 3 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.fill || p.color }}>{p.value} tenants</div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
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
        text: res.data?.enabled
          ? 'Maintenance mode enabled for all tenants.'
          : 'Maintenance mode disabled. Tenants can continue operations.',
      });
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'Failed to update maintenance mode.' });
    } finally {
      setSavingMaintenance(false);
    }
  };

  const planDist = useMemo(() => (
    stats ? Object.entries(stats.byPlan || {}).map(([plan, count]) => ({ name: plan, value: count })) : []
  ), [stats]);

  const statusDist = useMemo(() => (
    stats ? Object.entries(stats.byStatus || {}).map(([status, count]) => ({
      name: STATUS_LABELS[status] ?? status, value: count, key: status,
    })) : []
  ), [stats]);

  const recentTenants = stats?.recentTenants || [];
  const mrr = stats?.estimatedMrr ? `$${stats.estimatedMrr.toLocaleString()}` : '$0';

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const pageBg = isDark
    ? 'linear-gradient(160deg, #0D1B2A 0%, #0F172A 100%)'
    : 'linear-gradient(160deg, #F0F4FF 0%, #F8FAFC 100%)';

  const skeletonColor = isDark ? '#334155' : '#E5E7EB';

  return (
    <div style={{ padding: 'clamp(16px, 2.5vw, 32px)', minHeight: '100%', background: pageBg, boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 22,
        padding: '28px 30px',
        marginBottom: 24,
        background: isDark
          ? 'linear-gradient(135deg, #1E3A8A 0%, #312E81 100%)'
          : 'linear-gradient(135deg, #1E40AF 0%, #7C3AED 100%)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 20px 50px rgba(37,99,235,0.28)',
      }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', bottom: -60, right: 80, width: 260, height: 260, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
            Platform Control Centre
          </div>
          <h1 style={{ margin: '0 0 6px', fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>
            {greeting} 👋
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
            {now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            &nbsp;·&nbsp; Live tenant health, subscriptions &amp; system status.
          </p>
        </div>

        {/* Maintenance status badge */}
        <div style={{
          position: 'absolute', top: 26, right: 28,
          display: 'flex', alignItems: 'center', gap: 8,
          background: maintenance.enabled ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.18)',
          border: `1px solid ${maintenance.enabled ? 'rgba(239,68,68,0.45)' : 'rgba(16,185,129,0.4)'}`,
          borderRadius: 999, padding: '6px 14px',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: maintenance.enabled ? '#EF4444' : '#10B981', boxShadow: maintenance.enabled ? '0 0 6px #EF4444' : '0 0 6px #10B981', flexShrink: 0, display: 'inline-block' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
            {maintenance.enabled ? 'Maintenance ON' : 'System Operational'}
          </span>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <MetricCard
          label="Total Tenants"
          value={loading ? '…' : (stats?.totalTenants ?? 0)}
          sub={!loading && stats?.activeTrials > 0 ? `${stats.activeTrials} on trial` : 'All registered'}
          gradient="linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)"
          iconPath={ICONS.tenants}
          dark={isDark}
        />
        <MetricCard
          label="Active Paid"
          value={loading ? '…' : (stats?.activePaid ?? 0)}
          sub="Paying subscriptions"
          accent="#059669"
          iconPath={ICONS.paid}
          dark={isDark}
        />
        <MetricCard
          label="Active Trials"
          value={loading ? '…' : (stats?.activeTrials ?? 0)}
          sub="Trial period"
          accent="#D97706"
          iconPath={ICONS.trial}
          dark={isDark}
        />
        <MetricCard
          label="Suspended"
          value={loading ? '…' : (stats?.suspended ?? 0)}
          sub="Blocked accounts"
          accent="#DC2626"
          iconPath={ICONS.suspended}
          dark={isDark}
        />
        <MetricCard
          label="Est. MRR"
          value={loading ? '…' : mrr}
          sub="Monthly recurring"
          gradient="linear-gradient(135deg, #6D28D9 0%, #7C3AED 100%)"
          iconPath={ICONS.mrr}
          dark={isDark}
        />
      </div>

      {/* ── Charts Row ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginBottom: 20 }}>

        <Card title="Plan Distribution" subtitle="Tenant mix across plans" icon={ICONS.tenants} dark={isDark}>
          {!loading && planDist.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie
                    data={planDist} cx="50%" cy="50%"
                    innerRadius={48} outerRadius={78}
                    paddingAngle={3} dataKey="value"
                  >
                    {planDist.map((entry) => (
                      <Cell key={entry.name} fill={PLAN_COLORS[entry.name] ?? '#6B7280'} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip content={(p) => <ChartTooltip {...p} dark={isDark} />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 6 }}>
                {planDist.map(({ name, value }) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: isDark ? '#94A3B8' : '#6B7280' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: PLAN_COLORS[name] ?? '#6B7280', flexShrink: 0 }} />
                    <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{name}</span>
                    <span style={{ color: isDark ? '#64748B' : '#9CA3AF' }}>({value})</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isDark ? '#64748B' : '#9CA3AF', fontSize: 13 }}>
              {loading ? 'Loading…' : 'No data'}
            </div>
          )}
        </Card>

        <Card title="Status Breakdown" subtitle="Tenant account states" icon={ICONS.paid} dark={isDark}>
          {!loading && statusDist.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={statusDist} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={36}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#F1F5F9'} vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: isDark ? '#94A3B8' : '#9CA3AF', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: isDark ? '#94A3B8' : '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={(p) => <ChartTooltip {...p} dark={isDark} />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', radius: 8 }} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {statusDist.map((item) => (
                      <Cell key={item.key} fill={(STATUS_COLORS[item.key] ?? STATUS_COLORS.cancelled).dot} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                {statusDist.map((item) => <StatusPill key={item.key} status={item.key} />)}
              </div>
            </>
          ) : (
            <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isDark ? '#64748B' : '#9CA3AF', fontSize: 13 }}>
              {loading ? 'Loading…' : 'No data'}
            </div>
          )}
        </Card>

        {/* Maintenance Control */}
        <Card
          title="System Control"
          subtitle="Platform-wide maintenance mode"
          icon={ICONS.wrench}
          dark={isDark}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px', borderRadius: 12,
              background: maintenance.enabled
                ? (isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2')
                : (isDark ? 'rgba(16,185,129,0.08)' : '#F0FDF4'),
              border: `1px solid ${maintenance.enabled ? (isDark ? 'rgba(239,68,68,0.3)' : '#FECACA') : (isDark ? 'rgba(16,185,129,0.25)' : '#BBF7D0')}`,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#F1F5F9' : '#111827' }}>
                  Maintenance Mode
                </div>
                <div style={{ fontSize: 11, marginTop: 2, color: maintenance.enabled ? '#B91C1C' : (isDark ? '#34D399' : '#059669') }}>
                  {maintenance.enabled ? 'Tenants are currently locked out' : 'System open for all tenants'}
                </div>
              </div>
              <Toggle
                checked={maintenance.enabled}
                onChange={(val) => setMaintenance((prev) => ({ ...prev, enabled: val }))}
              />
            </div>

            <textarea
              rows={3}
              value={maintenance.message}
              onChange={(e) => setMaintenance((prev) => ({ ...prev, message: e.target.value }))}
              style={{
                border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`,
                borderRadius: 10, padding: '10px 12px', fontSize: 12,
                resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                background: isDark ? '#0F172A' : '#F9FAFB',
                color: isDark ? '#E2E8F0' : '#111827',
                lineHeight: 1.5,
              }}
              placeholder="Message shown to salons during maintenance…"
            />

            <button
              onClick={saveMaintenance}
              disabled={savingMaintenance}
              style={{
                border: 'none', borderRadius: 10, padding: '10px 16px',
                fontSize: 13, fontWeight: 700, cursor: savingMaintenance ? 'not-allowed' : 'pointer',
                background: maintenance.enabled ? '#DC2626' : '#4F46E5',
                color: '#fff', opacity: savingMaintenance ? 0.7 : 1,
                boxShadow: maintenance.enabled ? '0 6px 18px rgba(220,38,38,0.28)' : '0 6px 18px rgba(79,70,229,0.28)',
                transition: 'opacity 0.2s',
              }}
            >
              {savingMaintenance ? 'Saving…' : 'Save Changes'}
            </button>

            {notice.text && (
              <div style={{
                borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 500,
                border: notice.type === 'error' ? '1px solid #FECACA' : '1px solid #A7F3D0',
                background: notice.type === 'error' ? '#FEF2F2' : '#ECFDF5',
                color: notice.type === 'error' ? '#B91C1C' : '#065F46',
              }}>
                {notice.text}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Recent Sign-ups ─────────────────────────────────────── */}
      <Card
        title="Recent Sign-ups"
        subtitle="Latest tenant onboarding activity"
        icon={ICONS.calendar}
        dark={isDark}
        noPad
      >
        {loading ? (
          <div style={{ padding: '20px 22px' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ height: 14, borderRadius: 6, background: skeletonColor, marginBottom: 12, opacity: 1 - i * 0.15 }} />
            ))}
          </div>
        ) : recentTenants.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB' }}>
                  {['Salon Name', 'Slug', 'Plan', 'Status', 'Registered'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '10px 22px',
                      color: isDark ? '#64748B' : '#9CA3AF',
                      fontWeight: 700, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.7,
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentTenants.map((t, idx) => (
                  <tr
                    key={t.id}
                    style={{
                      borderTop: `1px solid ${isDark ? '#334155' : '#F1F5F9'}`,
                      background: idx % 2 === 0 ? 'transparent' : (isDark ? 'rgba(255,255,255,0.015)' : 'rgba(249,250,251,0.6)'),
                    }}
                  >
                    <td style={{ padding: '11px 22px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                          background: `${PLAN_COLORS[t.plan] ?? '#6B7280'}22`,
                          color: PLAN_COLORS[t.plan] ?? '#6B7280',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 800, fontSize: 13,
                        }}>
                          {t.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <span style={{ fontWeight: 700, color: isDark ? '#F1F5F9' : '#111827' }}>{t.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '11px 22px', color: isDark ? '#64748B' : '#9CA3AF', fontFamily: 'monospace', fontSize: 12 }}>
                      {t.slug}
                    </td>
                    <td style={{ padding: '11px 22px' }}>
                      <span style={{
                        background: `${PLAN_COLORS[t.plan] ?? '#6B7280'}1A`,
                        color: PLAN_COLORS[t.plan] ?? '#6B7280',
                        borderRadius: 6, padding: '3px 9px',
                        fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
                      }}>{t.plan}</span>
                    </td>
                    <td style={{ padding: '11px 22px' }}>
                      <StatusPill status={t.status} />
                    </td>
                    <td style={{ padding: '11px 22px', color: isDark ? '#64748B' : '#9CA3AF', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '28px 22px', textAlign: 'center', color: isDark ? '#475569' : '#D1D5DB', fontSize: 13 }}>
            No tenants registered yet.
          </div>
        )}
      </Card>
    </div>
  );
}
