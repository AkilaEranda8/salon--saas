import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import api from '../../api/axios';

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

function StatCard({ label, value, sub, accent = '#4338CA' }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '20px 22px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flex: 1, minWidth: 160,
    }}>
      <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: accent, letterSpacing: '-1px', lineHeight: 1 }}>
        {value ?? '—'}
      </div>
      {sub && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#1E1B4B', marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

export default function PlatformDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/platform/stats')
      .then(r => setStats(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const planDist = stats
    ? Object.entries(stats.byPlan || {}).map(([plan, count]) => ({ name: plan, value: count }))
    : [];

  const statusDist = stats
    ? Object.entries(stats.byStatus || {}).map(([status, count]) => ({ name: status, value: count }))
    : [];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, background: '#F5F3FF', minHeight: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E1B4B', margin: 0 }}>Platform Overview</h1>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>All tenants and subscription activity</p>
      </div>

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <div style={{
          background: '#1E1B4B', borderRadius: 14, padding: '20px 22px',
          flex: 1, minWidth: 160, color: '#fff', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Total Tenants</div>
          <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-1.5px', lineHeight: 1 }}>
            {loading ? '…' : (stats?.totalTenants ?? 0)}
          </div>
          {!loading && stats?.activeTrials > 0 && (
            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '2px 8px', display: 'inline-block' }}>
              {stats.activeTrials} on trial
            </div>
          )}
        </div>

        <StatCard
          label="Active Paid"
          value={loading ? '…' : (stats?.activePaid ?? 0)}
          sub="Subscriptions live"
          accent="#059669"
        />
        <StatCard
          label="Active Trials"
          value={loading ? '…' : (stats?.activeTrials ?? 0)}
          sub="Trial period"
          accent="#F59E0B"
        />
        <StatCard
          label="Suspended"
          value={loading ? '…' : (stats?.suspended ?? 0)}
          sub="Blocked tenants"
          accent="#EF4444"
        />
        <StatCard
          label="Est. MRR"
          value={loading ? '…' : (stats?.estimatedMrr ? `$${stats.estimatedMrr.toLocaleString()}` : '$0')}
          sub="Monthly recurring"
          accent="#7C3AED"
        />
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* Plan distribution */}
        <div style={{ flex: 1, minWidth: 280, background: '#fff', borderRadius: 14, padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E1B4B', marginBottom: 16 }}>Plan Distribution</div>
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
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 13 }}>
              {loading ? 'Loading…' : 'No data'}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 8 }}>
            {Object.entries(PLAN_COLORS).map(([plan, color]) => (
              <div key={plan} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6B7280' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                <span style={{ textTransform: 'capitalize' }}>{plan}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent sign-ups */}
        <div style={{ flex: 2, minWidth: 320, background: '#fff', borderRadius: 14, padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E1B4B', marginBottom: 16 }}>Recent Sign-ups</div>
          {loading ? (
            <div style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</div>
          ) : (stats?.recentTenants?.length > 0) ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                  {['Salon', 'Slug', 'Plan', 'Status', 'Registered'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: '#9CA3AF', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.recentTenants.map(t => {
                  const sc = STATUS_COLORS[t.status] ?? STATUS_COLORS.cancelled;
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid #F9FAFB' }}>
                      <td style={{ padding: '8px 8px', fontWeight: 600, color: '#1E1B4B' }}>{t.name}</td>
                      <td style={{ padding: '8px 8px', color: '#6B7280', fontFamily: 'monospace' }}>{t.slug}</td>
                      <td style={{ padding: '8px 8px' }}>
                        <span style={{ background: PLAN_COLORS[t.plan] + '20', color: PLAN_COLORS[t.plan] ?? '#6B7280', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>
                          {t.plan}
                        </span>
                      </td>
                      <td style={{ padding: '8px 8px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                          <span style={{ color: sc.text, fontSize: 11, textTransform: 'capitalize' }}>{t.status}</span>
                        </span>
                      </td>
                      <td style={{ padding: '8px 8px', color: '#9CA3AF', fontSize: 11 }}>
                        {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ color: '#9CA3AF', fontSize: 13 }}>No tenants yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
