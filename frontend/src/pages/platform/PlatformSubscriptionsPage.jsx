import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';

const PLAN_COLORS = {
  trial:      { bg: '#FEF3C7', text: '#92400E' },
  basic:      { bg: '#DBEAFE', text: '#1E40AF' },
  pro:        { bg: '#EDE9FE', text: '#5B21B6' },
  enterprise: { bg: '#D1FAE5', text: '#065F46' },
};

const SUB_STATUS_COLORS = {
  active:    { bg: '#D1FAE5', text: '#065F46' },
  trialing:  { bg: '#EDE9FE', text: '#5B21B6' },
  past_due:  { bg: '#FEF3C7', text: '#92400E' },
  unpaid:    { bg: '#FDE68A', text: '#92400E' },
  incomplete:{ bg: '#F3E8FF', text: '#7C3AED' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
};

const PLANS = ['trial', 'basic', 'pro', 'enterprise'];
const STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'cancelled'];

const EMPTY_FORM = {
  tenant_id: '',
  stripe_subscription_id: '',
  stripe_price_id: '',
  plan: 'basic',
  status: 'active',
  current_period_start: '',
  current_period_end: '',
  cancel_at_period_end: false,
  stripe_customer_id: '',
};

const PANEL_SHADOW = '0 18px 50px rgba(15, 23, 42, 0.08)';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeDays(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diffDays = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Ends today';
  if (diffDays > 0) return `${diffDays} day${diffDays === 1 ? '' : 's'} left`;
  return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} overdue`;
}

function StatCard({ label, value, hint, accent, dark = false }) {
  return (
    <div style={{
      flex: '1 1 180px',
      minWidth: 180,
      borderRadius: 18,
      padding: '18px 18px 16px',
      background: dark ? '#111827' : '#FFFFFF',
      border: `1px solid ${dark ? '#334155' : '#E5E7EB'}`,
      boxShadow: dark ? '0 18px 50px rgba(2, 6, 23, 0.35)' : PANEL_SHADOW,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: dark ? '#94A3B8' : '#667085' }}>
        {label}
      </div>
      <div style={{ marginTop: 10, fontSize: 30, lineHeight: 1, fontWeight: 800, color: accent }}>
        {value}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: dark ? '#94A3B8' : '#667085' }}>
        {hint}
      </div>
    </div>
  );
}

function Pill({ children, bg, color }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      padding: '5px 10px',
      background: bg,
      color,
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'capitalize',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff',
        borderRadius: 22,
        padding: 0,
        width: 760,
        maxWidth: '92vw',
        boxShadow: '0 30px 80px rgba(15,23,42,0.25)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          padding: '20px 22px',
          background: 'linear-gradient(135deg, #EEF2FF 0%, #FFFFFF 70%)',
          borderBottom: '1px solid #E5E7EB',
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#6366F1' }}>Subscription editor</div>
            <div style={{ marginTop: 6, fontSize: 20, fontWeight: 800, color: '#111827' }}>{title}</div>
            <div style={{ marginTop: 6, fontSize: 13, color: '#64748B' }}>Keep Stripe, tenant, and plan metadata in sync.</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#FFFFFF', cursor: 'pointer', fontSize: 18, color: '#64748B', lineHeight: 1, width: 34, height: 34, borderRadius: 999, boxShadow: '0 8px 18px rgba(15,23,42,0.08)' }}>×</button>
        </div>
        <div style={{ padding: '22px' }}>{children}</div>
      </div>
    </div>
  );
}

export default function PlatformSubscriptionsPage() {
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subscriptions, setSubscriptions] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('tenant');
  const [sortDir, setSortDir] = useState('asc');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const inputStyle = {
    border: '1px solid #E5E7EB',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 13,
    color: '#1E1B4B',
    background: '#fff',
    width: '100%',
    boxSizing: 'border-box',
  };

  const normalizeTenantPayload = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.tenants)) return payload.tenants;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  };

  const load = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [subsRes, tenantRes] = await Promise.all([
        api.get('/platform/subscriptions'),
        api.get('/platform/tenants?limit=500'),
      ]);
      setSubscriptions(Array.isArray(subsRes.data) ? subsRes.data : []);
      setTenants(normalizeTenantPayload(tenantRes.data));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load subscriptions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(false); }, []);

  const tenantMap = useMemo(() => {
    const map = new Map();
    for (const t of tenants) map.set(String(t.id), t);
    return map;
  }, [tenants]);

  const rows = useMemo(() => {
    return subscriptions.map((sub) => {
      const tenant = sub.tenant || tenantMap.get(String(sub.tenant_id)) || null;
      return {
        ...sub,
        tenant,
        tenantName: tenant?.name || 'Unknown tenant',
        tenantSlug: tenant?.slug || '—',
      };
    });
  }, [subscriptions, tenantMap]);

  const summary = useMemo(() => {
    const now = Date.now();
    const totals = {
      total: rows.length,
      active: 0,
      trialing: 0,
      overdue: 0,
      cancelled: 0,
    };

    for (const row of rows) {
      if (row.status === 'active') totals.active += 1;
      if (row.status === 'trialing') totals.trialing += 1;
      if (row.status === 'cancelled') totals.cancelled += 1;
      const due = row.current_period_end ? new Date(row.current_period_end).getTime() : null;
      if (due && due < now && row.status !== 'cancelled') totals.overdue += 1;
    }

    return totals;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = rows.filter((row) => {
      const matchesQuery = !query
        || row.tenantName.toLowerCase().includes(query)
        || row.tenantSlug.toLowerCase().includes(query)
        || row.stripe_subscription_id.toLowerCase().includes(query)
        || row.stripe_price_id.toLowerCase().includes(query);

      const matchesPlan = planFilter === 'all' || row.plan === planFilter;
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      return matchesQuery && matchesPlan && matchesStatus;
    });

    const sorted = [...list].sort((left, right) => {
      const getValue = (item) => {
        switch (sortBy) {
          case 'status': return item.status || '';
          case 'plan': return item.plan || '';
          case 'tenant': return item.tenantName || '';
          case 'period': return item.current_period_end || '';
          default: return item.tenantName || '';
        }
      };

      const leftValue = getValue(left).toString().toLowerCase();
      const rightValue = getValue(right).toString().toLowerCase();
      if (leftValue < rightValue) return sortDir === 'asc' ? -1 : 1;
      if (leftValue > rightValue) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [rows, search, planFilter, statusFilter, sortBy, sortDir]);

  const accent = isDark ? '#A78BFA' : '#4338CA';

  const toggleSort = (next) => {
    if (sortBy === next) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(next);
    setSortDir(next === 'period' ? 'desc' : 'asc');
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (sub) => {
    setEditing(sub);
    setForm({
      tenant_id: String(sub.tenant_id ?? ''),
      stripe_subscription_id: sub.stripe_subscription_id || '',
      stripe_price_id: sub.stripe_price_id || '',
      plan: sub.plan || 'basic',
      status: sub.status || 'active',
      current_period_start: sub.current_period_start ? String(sub.current_period_start).slice(0, 10) : '',
      current_period_end: sub.current_period_end ? String(sub.current_period_end).slice(0, 10) : '',
      cancel_at_period_end: !!sub.cancel_at_period_end,
      stripe_customer_id: sub.tenant?.stripe_customer_id || '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.tenant_id || !form.stripe_subscription_id || !form.stripe_price_id || !form.plan || !form.status) {
      setFormError('Tenant, Stripe Sub ID, Stripe Price ID, plan and status are required.');
      return;
    }

    const payload = {
      tenant_id: Number(form.tenant_id),
      stripe_subscription_id: form.stripe_subscription_id.trim(),
      stripe_price_id: form.stripe_price_id.trim(),
      plan: form.plan,
      status: form.status,
      current_period_start: form.current_period_start || null,
      current_period_end: form.current_period_end || null,
      cancel_at_period_end: !!form.cancel_at_period_end,
      stripe_customer_id: form.stripe_customer_id?.trim() || null,
    };

    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/platform/subscriptions/${editing.id}`, payload);
        setNotice('Subscription updated successfully.');
      } else {
        await api.post('/platform/subscriptions', payload);
        setNotice('Subscription created successfully.');
      }
      setModalOpen(false);
      await load(true);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const quickUpdateStatus = async (sub, status) => {
    try {
      await api.patch(`/platform/subscriptions/${sub.id}`, { status });
      setNotice(`Updated ${sub.tenantName} to ${status}.`);
      await load(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Status update failed.');
    }
  };

  const handleDelete = async (sub) => {
    if (!window.confirm(`Delete subscription ${sub.stripe_subscription_id}?`)) return;
    try {
      await api.delete(`/platform/subscriptions/${sub.id}`);
      setNotice('Subscription deleted successfully.');
      await load(true);
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed.');
    }
  };

  return (
    <div style={{
      padding: '28px 32px 40px',
      width: '100%',
      minHeight: '100%',
      boxSizing: 'border-box',
      background: isDark
        ? 'radial-gradient(circle at top left, rgba(99,102,241,0.14), transparent 28%), linear-gradient(180deg, #0F172A 0%, #0B1220 100%)'
        : 'radial-gradient(circle at top left, rgba(99,102,241,0.08), transparent 30%), linear-gradient(180deg, #F8FAFF 0%, #F7F8FA 100%)',
    }}>
      <div style={{
        marginBottom: 20,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: isDark ? '#A5B4FC' : '#6366F1' }}>Platform / Billing</div>
          <h1 style={{ fontSize: 34, lineHeight: 1.05, fontWeight: 900, color: isDark ? '#F8FAFC' : '#111827', margin: '10px 0 8px' }}>Subscriptions</h1>
          <p style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B', margin: 0, lineHeight: 1.6 }}>
            Review tenant billing state, spot overdue renewals, and keep Stripe references aligned with the platform.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => load(true)}
            disabled={loading || refreshing}
            style={{
              border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
              borderRadius: 14,
              background: isDark ? '#0B1220' : '#FFFFFF',
              color: isDark ? '#E2E8F0' : '#334155',
              fontSize: 13,
              fontWeight: 700,
              padding: '11px 14px',
              cursor: loading || refreshing ? 'not-allowed' : 'pointer',
            }}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={openCreate}
            style={{
              border: 'none',
              borderRadius: 14,
              background: `linear-gradient(135deg, ${accent}, #6366F1)`,
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              padding: '11px 16px',
              cursor: 'pointer',
              boxShadow: '0 14px 26px rgba(99,102,241,0.24)',
            }}
          >
            + New Subscription
          </button>
        </div>
      </div>

      {notice && (
        <div style={{ marginBottom: 14, color: '#065F46', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 14, padding: '10px 14px', fontSize: 12, boxShadow: '0 8px 18px rgba(16,185,129,0.1)' }}>
          {notice}
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <StatCard label="Total" value={summary.total} hint="All subscriptions loaded" accent={accent} dark={isDark} />
        <StatCard label="Active" value={summary.active} hint="Currently live" accent="#059669" dark={isDark} />
        <StatCard label="Trials" value={summary.trialing} hint="Trialing or onboarding" accent="#D97706" dark={isDark} />
        <StatCard label="Overdue" value={summary.overdue} hint="Past due / expired periods" accent="#DC2626" dark={isDark} />
      </div>

      <div style={{
        marginBottom: 18,
        display: 'grid',
        gridTemplateColumns: '1.5fr 0.8fr 0.8fr auto',
        gap: 12,
        alignItems: 'center',
        padding: 16,
        borderRadius: 18,
        border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`,
        background: isDark ? '#111827' : '#FFFFFF',
        boxShadow: isDark ? '0 18px 50px rgba(2, 6, 23, 0.35)' : PANEL_SHADOW,
      }}>
        <div style={{ position: 'relative' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by tenant, slug, or Stripe reference"
            style={{
              width: '100%',
              borderRadius: 14,
              border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
              background: isDark ? '#0B1220' : '#FAFBFF',
              color: isDark ? '#E2E8F0' : '#111827',
              padding: '12px 14px',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>

        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} style={{
          borderRadius: 14,
          border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
          background: isDark ? '#0B1220' : '#FAFBFF',
          color: isDark ? '#E2E8F0' : '#111827',
          padding: '12px 14px',
          fontSize: 13,
          outline: 'none',
        }}>
          <option value="all">All plans</option>
          {PLANS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{
          borderRadius: 14,
          border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
          background: isDark ? '#0B1220' : '#FAFBFF',
          color: isDark ? '#E2E8F0' : '#111827',
          padding: '12px 14px',
          fontSize: 13,
          outline: 'none',
        }}>
          <option value="all">All statuses</option>
          {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>

        <button
          onClick={() => { setSearch(''); setPlanFilter('all'); setStatusFilter('all'); }}
          style={{
            border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
            background: 'transparent',
            color: isDark ? '#E2E8F0' : '#344054',
            borderRadius: 14,
            padding: '12px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 14, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 14, padding: '10px 14px', fontSize: 12, boxShadow: '0 8px 18px rgba(220,38,38,0.08)' }}>
          {error}
        </div>
      )}

      <div style={{
        background: isDark ? '#111827' : '#FFFFFF',
        borderRadius: 20,
        border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`,
        boxShadow: isDark ? '0 18px 50px rgba(2, 6, 23, 0.35)' : PANEL_SHADOW,
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 980 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, background: isDark ? '#0B1220' : '#F8FAFF' }}>
                {[
                  ['tenant', 'Tenant'],
                  ['plan', 'Plan'],
                  ['status', 'Status'],
                  ['period', 'Period end'],
                  ['stripe', 'Stripe refs'],
                  ['', 'Actions'],
                ].map(([key, label]) => (
                  <th
                    key={label}
                    onClick={key ? () => toggleSort(key) : undefined}
                    style={{
                      textAlign: 'left',
                      padding: '14px 16px',
                      color: isDark ? '#94A3B8' : '#667085',
                      fontWeight: 800,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 0.9,
                      whiteSpace: 'nowrap',
                      cursor: key ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}
                  >
                    {label}
                    {sortBy === key && key && <span style={{ marginLeft: 6, color: accent }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 44, textAlign: 'center', color: isDark ? '#94A3B8' : '#9CA3AF' }}>Loading…</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 44, textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: isDark ? '#E2E8F0' : '#111827' }}>No subscriptions match your filters</div>
                    <div style={{ marginTop: 6, fontSize: 13, color: isDark ? '#94A3B8' : '#667085' }}>Try another search term or create a new subscription.</div>
                  </td>
                </tr>
              ) : filteredRows.map((sub, index) => {
                const pc = PLAN_COLORS[sub.plan] ?? PLAN_COLORS.basic;
                const sc = SUB_STATUS_COLORS[sub.status] ?? SUB_STATUS_COLORS.past_due;
                const rowBg = index % 2 === 0 ? (isDark ? '#111827' : '#FFFFFF') : (isDark ? '#0F172A' : '#FCFCFD');
                return (
                  <tr key={sub.id} style={{ borderBottom: `1px solid ${isDark ? '#1F2937' : '#F1F5F9'}`, background: rowBg }}>
                    <td style={{ padding: '15px 16px' }}>
                      <div style={{ fontWeight: 700, color: isDark ? '#F8FAFC' : '#111827' }}>{sub.tenantName}</div>
                      <div style={{ marginTop: 3, color: isDark ? '#94A3B8' : '#667085', fontSize: 12, fontFamily: 'monospace' }}>{sub.tenantSlug}</div>
                    </td>
                    <td style={{ padding: '15px 16px' }}>
                      <Pill bg={pc.bg} color={pc.text}>{sub.plan}</Pill>
                    </td>
                    <td style={{ padding: '15px 16px' }}>
                      <Pill bg={sc.bg} color={sc.text}>{sub.status}</Pill>
                      <div style={{ marginTop: 6, fontSize: 12, color: isDark ? '#94A3B8' : '#667085' }}>{formatRelativeDays(sub.current_period_end)}</div>
                    </td>
                    <td style={{ padding: '15px 16px' }}>
                      <div style={{ color: isDark ? '#E2E8F0' : '#111827', fontSize: 12, fontWeight: 700 }}>Ends {formatDate(sub.current_period_end)}</div>
                      <div style={{ marginTop: 4, color: isDark ? '#94A3B8' : '#667085', fontSize: 12 }}>Starts {formatDate(sub.current_period_start)}</div>
                      {sub.cancel_at_period_end && (
                        <div style={{ marginTop: 5 }}>
                          <Pill bg="#FEF3C7" color="#92400E">cancel at period end</Pill>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '15px 16px' }}>
                      <div style={{ color: isDark ? '#E2E8F0' : '#111827', fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{sub.stripe_subscription_id}</div>
                      <div style={{ marginTop: 4, color: isDark ? '#94A3B8' : '#667085', fontFamily: 'monospace', fontSize: 12 }}>{sub.stripe_price_id}</div>
                    </td>
                    <td style={{ padding: '15px 16px' }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => openEdit(sub)} style={{
                          padding: '8px 12px',
                          border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
                          borderRadius: 10,
                          background: isDark ? '#0B1220' : '#FFFFFF',
                          color: isDark ? '#E2E8F0' : '#344054',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 700,
                        }}>
                          Edit
                        </button>
                        <button onClick={() => handleDelete(sub)} style={{
                          padding: '8px 12px',
                          border: '1px solid #FECACA',
                          borderRadius: 10,
                          background: '#FEF2F2',
                          color: '#B91C1C',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 700,
                        }}>
                          Delete
                        </button>
                        {sub.status !== 'active' && (
                          <button onClick={() => quickUpdateStatus(sub, 'active')} style={{
                            padding: '8px 12px',
                            border: '1px solid #BBF7D0',
                            borderRadius: 10,
                            background: '#F0FDF4',
                            color: '#166534',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700,
                          }}>
                            Set Active
                          </button>
                        )}
                        {sub.status === 'active' && (
                          <button onClick={() => quickUpdateStatus(sub, 'past_due')} style={{
                            padding: '8px 12px',
                            border: '1px solid #FDE68A',
                            borderRadius: 10,
                            background: '#FFFBEB',
                            color: '#B45309',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700,
                          }}>
                            Mark Past Due
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <Modal title={editing ? 'Edit Subscription' : 'Create Subscription'} onClose={() => setModalOpen(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, color: '#374151', fontWeight: 700, marginBottom: 6, display: 'block' }}>Tenant</label>
              <select value={form.tenant_id} onChange={(e) => setForm((f) => ({ ...f, tenant_id: e.target.value }))} style={inputStyle}>
                <option value="">Select tenant</option>
                {tenants.map((t) => <option key={t.id} value={String(t.id)}>{t.name} ({t.slug})</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, color: '#374151', fontWeight: 700, marginBottom: 6, display: 'block' }}>Plan</label>
              <select value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))} style={inputStyle}>
                {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#374151', fontWeight: 700, marginBottom: 6, display: 'block' }}>Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={inputStyle}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, color: '#374151', fontWeight: 700, marginBottom: 6, display: 'block' }}>Stripe Subscription ID</label>
              <input value={form.stripe_subscription_id} onChange={(e) => setForm((f) => ({ ...f, stripe_subscription_id: e.target.value }))} style={inputStyle} />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, color: '#374151', fontWeight: 700, marginBottom: 6, display: 'block' }}>Stripe Price ID</label>
              <input value={form.stripe_price_id} onChange={(e) => setForm((f) => ({ ...f, stripe_price_id: e.target.value }))} style={inputStyle} />
            </div>

            <div>
              <label style={{ fontSize: 12, color: '#374151', fontWeight: 700, marginBottom: 6, display: 'block' }}>Period Start</label>
              <input type="date" value={form.current_period_start} onChange={(e) => setForm((f) => ({ ...f, current_period_start: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#374151', fontWeight: 700, marginBottom: 6, display: 'block' }}>Period End</label>
              <input type="date" value={form.current_period_end} onChange={(e) => setForm((f) => ({ ...f, current_period_end: e.target.value }))} style={inputStyle} />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, color: '#374151', fontWeight: 700, marginBottom: 6, display: 'block' }}>Stripe Customer ID (optional)</label>
              <input value={form.stripe_customer_id} onChange={(e) => setForm((f) => ({ ...f, stripe_customer_id: e.target.value }))} style={inputStyle} />
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
              <input id="cancelAtPeriodEnd" type="checkbox" checked={form.cancel_at_period_end} onChange={(e) => setForm((f) => ({ ...f, cancel_at_period_end: e.target.checked }))} />
              <label htmlFor="cancelAtPeriodEnd" style={{ fontSize: 12, color: '#374151', fontWeight: 700 }}>Cancel at period end</label>
            </div>
          </div>

          {formError && <div style={{ marginTop: 12, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '10px 12px', fontSize: 12 }}>{formError}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            <button onClick={() => setModalOpen(false)} style={{ border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`, borderRadius: 12, background: isDark ? '#0B1220' : '#fff', color: isDark ? '#E2E8F0' : '#344054', padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{ border: 'none', borderRadius: 12, background: `linear-gradient(135deg, ${accent}, #6366F1)`, color: '#fff', padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.75 : 1, boxShadow: '0 14px 24px rgba(99,102,241,0.22)' }}>
              {saving ? 'Saving...' : (editing ? 'Save Changes' : 'Create')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
