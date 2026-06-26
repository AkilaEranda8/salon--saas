import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';
import { DataTable, CRAFT_TABLE_COMPACT } from '../../components/ui/PageKit';

const SOURCE_META = {
  maintenance:   { label: 'Maintenance', color: '#7C3AED', bg: '#EDE9FE' },
  plan:          { label: 'Plans', color: '#2563EB', bg: '#DBEAFE' },
  tenant:        { label: 'Salon', color: '#4F46E5', bg: '#E0E7FF' },
  subscription:  { label: 'Billing', color: '#0891B2', bg: '#CFFAFE' },
  payment:       { label: 'Payments', color: '#16A34A', bg: '#DCFCE7' },
  appointment:   { label: 'Appointments', color: '#9333EA', bg: '#F3E8FF' },
  customer:      { label: 'Customers', color: '#DB2777', bg: '#FCE7F3' },
  user:          { label: 'Users', color: '#475569', bg: '#F1F5F9' },
  notification:  { label: 'Notifications', color: '#059669', bg: '#D1FAE5' },
  support:       { label: 'Support', color: '#D97706', bg: '#FEF3C7' },
};

const TENANT_KPI_KEYS = ['tenant', 'payment', 'appointment', 'customer', 'user', 'notification', 'support'];

function Surface({ title, subtitle, children, dark, rightAction, noPad, style = {} }) {
  return (
    <section style={{
      borderRadius: 18,
      border: `1px solid ${dark ? '#1E293B' : '#E5E7EB'}`,
      background: dark ? '#111827' : '#FFFFFF',
      boxShadow: dark ? '0 8px 24px rgba(2,6,23,0.38)' : '0 8px 20px rgba(15,23,42,0.06)',
      padding: noPad ? '18px 0 0' : '18px 18px 16px',
      ...style,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 14, padding: noPad ? '0 18px' : 0 }}>
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

function KPI({ label, value, dark, accent = '#6366F1' }) {
  return (
    <div style={{
      borderRadius: 14,
      border: `1px solid ${dark ? '#1E293B' : '#E5E7EB'}`,
      background: dark ? '#0B1220' : '#FFFFFF',
      padding: '14px 16px 12px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: dark ? '#64748B' : '#94A3B8' }}>{label}</div>
      <div style={{ marginTop: 7, fontSize: 24, fontWeight: 900, lineHeight: 1, color: accent }}>{value}</div>
    </div>
  );
}

function fmtWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
}

export default function PlatformActivityLogsPage() {
  const { isDark } = useTheme();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({});
  const [tenants, setTenants] = useState([]);
  const [page, setPage] = useState(1);
  const [source, setSource] = useState('all');
  const [tenantId, setTenantId] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/platform/tenants?limit=1000')
      .then((r) => {
        const rows = Array.isArray(r.data?.tenants)
          ? r.data.tenants
          : Array.isArray(r.data?.data)
            ? r.data.data
            : Array.isArray(r.data)
              ? r.data
              : [];
        setTenants(rows);
      })
      .catch(() => setTenants([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const p = new URLSearchParams({ page: String(page), limit: '50' });
      if (source !== 'all') p.set('source', source);
      if (tenantId !== 'all') p.set('tenant_id', tenantId);
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      if (search.trim()) p.set('search', search.trim());
      const res = await api.get(`/platform/activity-logs?${p}`);
      setLogs(res.data.data || []);
      setTotal(res.data.total || 0);
      setCounts(res.data.counts || {});
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load activity logs.');
    } finally {
      setLoading(false);
    }
  }, [page, source, tenantId, from, to, search]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo(() => [
    {
      id: 'when',
      header: 'When',
      accessorFn: row => row.createdAt,
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, color: isDark ? '#CBD5E1' : '#475569', whiteSpace: 'nowrap' }}>{fmtWhen(getValue())}</span>
      ),
      meta: { width: '140px' },
    },
    {
      id: 'source',
      header: 'Source',
      accessorKey: 'source',
      cell: ({ getValue }) => {
        const meta = SOURCE_META[getValue()] || { label: getValue(), color: '#64748B', bg: '#F1F5F9' };
        return (
          <span style={{
            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: meta.bg, color: meta.color,
          }}>{meta.label}</span>
        );
      },
      meta: { width: '120px' },
    },
    {
      id: 'summary',
      header: 'Activity',
      accessorKey: 'summary',
      cell: ({ row: { original: r } }) => (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#F8FAFC' : '#0F172A' }}>{r.summary}</div>
          {r.detail && <div style={{ fontSize: 11, color: isDark ? '#64748B' : '#94A3B8', marginTop: 3 }}>{r.detail}</div>}
        </div>
      ),
    },
    {
      id: 'actor',
      header: 'Actor',
      accessorKey: 'actor',
      cell: ({ getValue }) => <span style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#E2E8F0' : '#334155' }}>{getValue() || '—'}</span>,
      meta: { width: '130px' },
    },
    {
      id: 'tenant',
      header: 'Tenant / Branch',
      accessorFn: row => row.tenant_name || row.branch_name || '',
      cell: ({ row: { original: r } }) => (
        <div style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B' }}>
          {r.tenant_name && <div>{r.tenant_name}</div>}
          {r.branch_name && <div style={{ fontSize: 11 }}>{r.branch_name}</div>}
          {!r.tenant_name && !r.branch_name && '—'}
        </div>
      ),
      meta: { width: '150px' },
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      cell: ({ getValue }) => {
        const v = String(getValue() || '');
        const failed = v === 'failed';
        return (
          <span style={{
            padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700, textTransform: 'capitalize',
            background: failed ? '#FEE2E2' : isDark ? '#1E293B' : '#F1F5F9',
            color: failed ? '#991B1B' : isDark ? '#CBD5E1' : '#475569',
          }}>{v.replace(/_/g, ' ') || '—'}</span>
        );
      },
      meta: { width: '100px' },
    },
  ], [isDark]);

  const pages = Math.max(1, Math.ceil(total / 50));
  const txt = (light, dark) => (isDark ? dark : light);
  const selectedTenant = tenants.find(t => String(t.id) === tenantId);

  const tenantActivityTotal = TENANT_KPI_KEYS.reduce((s, k) => s + (counts[k] || 0), 0);

  return (
    <div style={{ width: '100%', minHeight: '100%', padding: '28px clamp(16px, 2.4vw, 34px) 44px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: txt('#0F172A', '#F8FAFC') }}>Activity Logs</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: txt('#64748B', '#94A3B8') }}>
            All tenant and system activity — payments, appointments, customers, users, notifications, and more.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}
          style={{
            padding: '10px 16px', borderRadius: 10, border: `1px solid ${txt('#E5E7EB', '#334155')}`,
            background: txt('#fff', '#0F172A'), color: txt('#374151', '#E2E8F0'),
            fontWeight: 700, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
          }}>
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 18 }}>
        <KPI label="Total (filtered)" value={total.toLocaleString()} dark={isDark} accent="#6366F1" />
        <KPI label="Tenant activity" value={tenantActivityTotal.toLocaleString()} dark={isDark} accent="#4F46E5" />
        <KPI label="Payments" value={(counts.payment || 0).toLocaleString()} dark={isDark} accent="#16A34A" />
        <KPI label="Appointments" value={(counts.appointment || 0).toLocaleString()} dark={isDark} accent="#9333EA" />
        <KPI label="Customers" value={(counts.customer || 0).toLocaleString()} dark={isDark} accent="#DB2777" />
        <KPI label="Notifications" value={(counts.notification || 0).toLocaleString()} dark={isDark} accent="#059669" />
      </div>

      <Surface dark={isDark} title="Filters" subtitle="Filter by tenant, source, date range, or search text." style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <select value={tenantId} onChange={e => { setPage(1); setTenantId(e.target.value); }}
            style={{ padding: '9px 12px', borderRadius: 10, border: `1px solid ${txt('#E5E7EB', '#334155')}`, background: txt('#fff', '#0B1220'), color: txt('#111827', '#F1F5F9'), fontSize: 13, minWidth: 180 }}>
            <option value="all">All tenants</option>
            {tenants.map(t => (
              <option key={t.id} value={String(t.id)}>{t.name || t.slug}</option>
            ))}
          </select>
          <select value={source} onChange={e => { setPage(1); setSource(e.target.value); }}
            style={{ padding: '9px 12px', borderRadius: 10, border: `1px solid ${txt('#E5E7EB', '#334155')}`, background: txt('#fff', '#0B1220'), color: txt('#111827', '#F1F5F9'), fontSize: 13 }}>
            <option value="all">All sources</option>
            <option value="tenant">Salon registered</option>
            <option value="subscription">Billing / subscriptions</option>
            <option value="payment">Payments</option>
            <option value="appointment">Appointments</option>
            <option value="customer">Customers</option>
            <option value="user">Users</option>
            <option value="notification">Notifications</option>
            <option value="support">Support</option>
            <option value="maintenance">Maintenance</option>
            <option value="plan">Plans</option>
          </select>
          <input type="date" value={from} onChange={e => { setPage(1); setFrom(e.target.value); }}
            style={{ padding: '9px 12px', borderRadius: 10, border: `1px solid ${txt('#E5E7EB', '#334155')}`, background: txt('#fff', '#0B1220'), color: txt('#111827', '#F1F5F9'), fontSize: 13 }} />
          <input type="date" value={to} onChange={e => { setPage(1); setTo(e.target.value); }}
            style={{ padding: '9px 12px', borderRadius: 10, border: `1px solid ${txt('#E5E7EB', '#334155')}`, background: txt('#fff', '#0B1220'), color: txt('#111827', '#F1F5F9'), fontSize: 13 }} />
          <input type="search" placeholder="Search summary, actor, tenant…" value={search}
            onChange={e => { setPage(1); setSearch(e.target.value); }}
            style={{ flex: 1, minWidth: 220, padding: '9px 12px', borderRadius: 10, border: `1px solid ${txt('#E5E7EB', '#334155')}`, background: txt('#fff', '#0B1220'), color: txt('#111827', '#F1F5F9'), fontSize: 13 }} />
        </div>
        {selectedTenant && (
          <div style={{ marginTop: 10, fontSize: 12, color: txt('#64748B', '#94A3B8') }}>
            Showing activity for <strong style={{ color: txt('#334155', '#E2E8F0') }}>{selectedTenant.name}</strong> only
          </div>
        )}
      </Surface>

      {error && (
        <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: 13 }}>{error}</div>
      )}

      <Surface dark={isDark} title="Activity Timeline" subtitle={`Page ${page} of ${pages} · ${total.toLocaleString()} entries`} noPad>
        <DataTable
          {...CRAFT_TABLE_COMPACT}
          columns={columns}
          data={logs}
          loading={loading}
          emptyMessage="No activity logs found"
          emptySub="Try changing tenant, filters, or date range"
          pagination={false}
          searchableColumns={[]}
        />
        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '14px 18px 18px' }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${txt('#E5E7EB', '#334155')}`, background: txt('#fff', '#0F172A'), cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}>
              Previous
            </button>
            <span style={{ alignSelf: 'center', fontSize: 13, color: txt('#64748B', '#94A3B8') }}>{page} / {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage(p => p + 1)}
              style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${txt('#E5E7EB', '#334155')}`, background: txt('#fff', '#0F172A'), cursor: page >= pages ? 'not-allowed' : 'pointer', opacity: page >= pages ? 0.5 : 1 }}>
              Next
            </button>
          </div>
        )}
      </Surface>
    </div>
  );
}
