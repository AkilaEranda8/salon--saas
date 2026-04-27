import React, { useEffect, useState, useCallback } from 'react';
import api from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';

const PLAN_COLORS = {
  trial:      { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
  basic:      { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6' },
  pro:        { bg: '#EDE9FE', text: '#5B21B6', border: '#7C3AED' },
  enterprise: { bg: '#D1FAE5', text: '#065F46', border: '#059669' },
};

const STATUS_COLORS = {
  active:    { bg: '#D1FAE5', text: '#065F46', dot: '#10B981' },
  suspended: { bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },
  cancelled: { bg: '#F3F4F6', text: '#374151', dot: '#9CA3AF' },
};

const PLANS = ['trial', 'basic', 'pro', 'enterprise'];

const Ico = ({ d, size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const STAT_ICONS = {
  total:     'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  active:    'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  suspended: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
  trial:     'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
};

function Badge({ children, colors }) {
  return (
    <span style={{
      background: colors.bg, color: colors.text,
      border: `1px solid ${colors.border ?? colors.dot}`,
      borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 600,
      textTransform: 'capitalize', display: 'inline-block',
    }}>
      {children}
    </span>
  );
}

function Modal({ title, onClose, children, isDark }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,15,30,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(2px)',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: isDark ? '#1E293B' : '#fff',
        border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`,
        borderRadius: 18, padding: '26px 28px 22px',
        width: 460, maxWidth: '92vw',
        boxShadow: isDark ? '0 24px 64px rgba(0,0,0,0.5)' : '0 24px 64px rgba(15,23,42,0.18)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: isDark ? '#F1F5F9' : '#111827' }}>{title}</div>
          <button onClick={onClose} style={{
            border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1,
            width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isDark ? '#334155' : '#F3F4F6', color: isDark ? '#94A3B8' : '#6B7280',
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, value, isLink, mono, isDark }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 0', borderBottom: `1px solid ${isDark ? '#334155' : '#F1F5F9'}` }}>
      <span style={{ color: isDark ? '#64748B' : '#6B7280', width: 120, flexShrink: 0 }}>{label}</span>
      {isLink ? (
        <a href={value} target="_blank" rel="noopener noreferrer"
          style={{ color: '#818CF8', fontWeight: 600, wordBreak: 'break-all' }}>{value}</a>
      ) : (
        <span style={{ color: isDark ? '#F1F5F9' : '#111827', fontWeight: 600, fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
      )}
      <button onClick={handleCopy}
        style={{ marginLeft: 'auto', padding: '2px 9px', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 5, background: isDark ? '#0F172A' : '#fff', cursor: 'pointer', fontSize: 11, flexShrink: 0, color: isDark ? '#94A3B8' : '#374151' }}>
        {copied ? '✓' : 'Copy'}
      </button>
    </div>
  );
}

export default function PlatformTenantsPage() {
  const { isDark } = useTheme();
  const [tenants, setTenants]     = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterPlan, setFilterPlan]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage]           = useState(1);
  const [editTenant, setEditTenant] = useState(null); // { id, name, plan, status }
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdTenant, setCreatedTenant] = useState(null); // success state
  const [createForm, setCreateForm] = useState({
    businessName: '',
    slug: '',
    ownerEmail: '',
    ownerName: '',
    password: '',
    phone: '',
    plan: 'trial',
    status: 'active',
    branchName: '',
  });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [impersonating, setImpersonating] = useState(null); // tenantId
  const [detailTenant, setDetailTenant] = useState(null); // tenant for drawer
  const [detailStats, setDetailStats] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const PER_PAGE = 20;

  const normalizeTenantsPayload = (payload) => {
    if (Array.isArray(payload)) {
      return { rows: payload, total: payload.length };
    }
    const rows = Array.isArray(payload?.tenants)
      ? payload.tenants
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
    const total = typeof payload?.total === 'number' ? payload.total : rows.length;
    return { rows, total };
  };

  const fetchTenants = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search)       params.set('search', search);
    if (filterPlan)   params.set('plan', filterPlan);
    if (filterStatus) params.set('status', filterStatus);
    params.set('page', page);
    params.set('limit', PER_PAGE);

    api.get(`/platform/tenants?${params}`)
      .then(r => {
        const { rows, total: totalCount } = normalizeTenantsPayload(r.data);
        setTenants(rows);
        setTotal(totalCount);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, filterPlan, filterStatus, page]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.patch(`/platform/tenants/${editTenant.id}`, {
        plan: editTenant.plan,
        status: editTenant.status,
        payment_gateway: editTenant.payment_gateway || 'none',
        back_transfer_wage: editTenant.back_transfer_wage || 0,
        helapay_merchant_id:  editTenant.helapay_merchant_id  || null,
        helapay_app_id:       editTenant.helapay_app_id       || null,
        helapay_app_secret:   editTenant.helapay_app_secret   || null,
        helapay_business_id:  editTenant.helapay_business_id  || null,
        helapay_notify_url:   editTenant.helapay_notify_url   || null,
      });
      setEditTenant(null);
      fetchTenants();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tenant) => {
    if (!window.confirm(`Delete tenant "${tenant.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/platform/tenants/${tenant.id}`);
      fetchTenants();
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed.');
    }
  };

  const handleImpersonate = async (tenant) => {
    setImpersonating(tenant.id);
    try {
      const res = await api.post(`/platform/tenants/${tenant.id}/impersonate`);
      const { token, tenant: t } = res.data;
      // Open a new tab at /impersonate — the ImpersonateGate handler sets the
      // session cookie and redirects to the tenant dashboard.
      const url = `${window.location.protocol}//${window.location.host}/impersonate?token=${encodeURIComponent(token)}&tenant=${t.slug}`;
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      alert(err.response?.data?.message || 'Impersonation failed.');
    } finally {
      setImpersonating(null);
    }
  };

  const handleQuickStatus = async (tenant, action) => {
    const labels = { activate: 'Activate', suspend: 'Suspend', cancel: 'Cancel' };
    if (!window.confirm(`${labels[action]} tenant "${tenant.name}"?`)) return;
    try {
      await api.patch(`/platform/tenants/${tenant.id}/quick-status`, { action });
      fetchTenants();
    } catch (err) {
      alert(err.response?.data?.message || 'Status change failed.');
    }
  };

  const openDetail = async (tenant) => {
    setDetailTenant(tenant);
    setDetailStats(null);
    setDetailLoading(true);
    try {
      const res = await api.get(`/platform/tenants/${tenant.id}/stats`);
      setDetailStats(res.data.stats ?? res.data);
    } catch { setDetailStats(null); }
    finally { setDetailLoading(false); }
  };

  const openCreate = () => {
    setCreateForm({
      businessName: '',
      slug: '',
      ownerEmail: '',
      ownerName: '',
      password: '',
      phone: '',
      plan: 'trial',
      status: 'active',
      branchName: '',
    });
    setCreateError('');
    setCreatedTenant(null);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    setCreateError('');
    if (!createForm.businessName || !createForm.slug || !createForm.ownerEmail || !createForm.ownerName || !createForm.password) {
      setCreateError('Business name, slug, owner email, owner name, and password are required.');
      return;
    }

    setCreating(true);
    try {
      const res = await api.post('/platform/tenants', {
        businessName: createForm.businessName.trim(),
        slug: createForm.slug.trim().toLowerCase(),
        ownerEmail: createForm.ownerEmail.trim().toLowerCase(),
        ownerName: createForm.ownerName.trim(),
        password: createForm.password,
        phone: createForm.phone.trim() || null,
        plan: createForm.plan,
        status: createForm.status,
        branchName: createForm.branchName.trim() || null,
      });
      setCreatedTenant({
        ...res.data.tenant,
        ownerUsername: res.data.owner?.username || createForm.ownerEmail.trim().toLowerCase(),
        password: createForm.password,
        url: `https://${res.data.tenant.slug}.salon.hexalyte.com`,
      });
      fetchTenants();
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Create failed.');
    } finally {
      setCreating(false);
    }
  };

  const totalPages = Math.ceil(total / PER_PAGE);

  const AVATAR_PALETTE = ['#6366F1','#8B5CF6','#EC4899','#F59E0B','#10B981','#3B82F6','#EF4444','#14B8A6','#F97316','#06B6D4'];
  const getAvatar = (name = '') => ({
    bg:      AVATAR_PALETTE[(name.charCodeAt(0) ?? 0) % AVATAR_PALETTE.length],
    initials: name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?',
  });

  const activeCount    = tenants.filter(t => t.status === 'active').length;
  const suspendedCount = tenants.filter(t => t.status === 'suspended').length;
  const trialCount     = tenants.filter(t => t.plan === 'trial').length;

  const IBtn = ({ onClick, title, disabled, bg, border, children }) => {
    const defBg = isDark ? '#1E293B' : '#fff';
    const defBorder = isDark ? '#334155' : '#E5E7EB';
    return (
      <button onClick={onClick} title={title} disabled={disabled} style={{
        width: 30, height: 30, borderRadius: 7,
        border: `1.5px solid ${border ?? defBorder}`, background: bg ?? defBg,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, opacity: disabled ? 0.4 : 1, flexShrink: 0,
        transition: 'opacity 0.15s', color: isDark ? '#94A3B8' : '#374151',
      }}>{children}</button>
    );
  };

  const pageBg = isDark
    ? 'linear-gradient(160deg, #0D1B2A 0%, #0F172A 100%)'
    : 'linear-gradient(160deg, #F0F4FF 0%, #F8FAFC 100%)';

  return (
    <div style={{ padding: 'clamp(16px, 2.5vw, 32px)', background: pageBg, minHeight: '100%', boxSizing: 'border-box' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        background: isDark
          ? 'linear-gradient(135deg, #1E3A8A 0%, #312E81 100%)'
          : 'linear-gradient(135deg, #1E40AF 0%, #7C3AED 100%)',
        borderRadius: 22, padding: '26px 30px 24px', marginBottom: 22,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        boxShadow: '0 20px 50px rgba(37,99,235,0.28)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1.3, marginBottom: 5 }}>
            Platform Admin
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#fff', margin: '0 0 4px', letterSpacing: -0.5, lineHeight: 1.1 }}>Tenants</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            {loading ? 'Loading…' : `${total} registered salon accounts on the platform`}
          </p>
        </div>
        <button onClick={openCreate} style={{
          padding: '11px 22px', borderRadius: 12,
          background: 'rgba(255,255,255,0.15)', color: '#fff',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 7,
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.25)',
          whiteSpace: 'nowrap', flexShrink: 0,
          boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Tenant
        </button>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total Tenants', value: loading ? '…' : total,          accent: '#4F46E5', iconKey: 'total',     gradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)' },
          { label: 'Active',        value: loading ? '…' : activeCount,    accent: '#059669', iconKey: 'active',    gradient: null },
          { label: 'Suspended',     value: loading ? '…' : suspendedCount, accent: '#DC2626', iconKey: 'suspended', gradient: null },
          { label: 'On Trial',      value: loading ? '…' : trialCount,     accent: '#D97706', iconKey: 'trial',     gradient: null },
        ].map(({ label, value, accent, iconKey, gradient }) => {
          const cardStyle = gradient
            ? { background: gradient, boxShadow: '0 10px 28px rgba(37,99,235,0.22)' }
            : { background: isDark ? '#1E293B' : '#fff', border: `1px solid ${isDark ? '#334155' : '#E8ECEF'}`, boxShadow: isDark ? '0 4px 14px rgba(0,0,0,0.2)' : '0 3px 12px rgba(15,23,42,0.06)' };
          const iconBg = gradient ? 'rgba(255,255,255,0.18)' : (isDark ? 'rgba(255,255,255,0.06)' : `${accent}18`);
          const valColor = gradient ? '#fff' : (isDark ? '#F1F5F9' : accent);
          const lblColor = gradient ? 'rgba(255,255,255,0.75)' : (isDark ? '#64748B' : '#9CA3AF');
          return (
            <div key={label} style={{ borderRadius: 16, padding: '18px 20px', ...cardStyle }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.85, color: lblColor }}>{label}</div>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Ico d={STAT_ICONS[iconKey]} size={16} color={gradient ? '#fff' : accent} />
                </div>
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, color: valColor, letterSpacing: '-1px', lineHeight: 1 }}>{value}</div>
            </div>
          );
        })}
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        background: isDark ? '#1E293B' : '#fff',
        border: `1px solid ${isDark ? '#334155' : '#E8ECEF'}`,
        borderRadius: 14, padding: '10px 14px',
        boxShadow: isDark ? '0 4px 14px rgba(0,0,0,0.2)' : '0 2px 8px rgba(15,23,42,0.06)',
        marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 270 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', lineHeight: 0, pointerEvents: 'none' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#475569' : '#9CA3AF'} strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input
            placeholder="Search salons or slugs…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{
              width: '100%', padding: '8px 10px 8px 32px',
              border: `1.5px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 9,
              fontSize: 13, outline: 'none',
              background: isDark ? '#0F172A' : '#F9FAFB',
              color: isDark ? '#E2E8F0' : '#111827',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {['', ...PLANS].map(p => {
            const active = filterPlan === p;
            const label = p === '' ? 'All Plans' : p.charAt(0).toUpperCase() + p.slice(1);
            return (
              <button key={p} onClick={() => { setFilterPlan(p); setPage(1); }}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  border: `1.5px solid ${active ? '#4F46E5' : (isDark ? '#334155' : '#E5E7EB')}`,
                  background: active ? '#4F46E5' : 'transparent',
                  color: active ? '#fff' : (isDark ? '#94A3B8' : '#6B7280'),
                  transition: 'all 0.12s',
                }}>{label}</button>
            );
          })}
        </div>

        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          style={{
            padding: '7px 10px', border: `1.5px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 9,
            fontSize: 12, outline: 'none', background: isDark ? '#0F172A' : '#fff', color: isDark ? '#E2E8F0' : '#374151', cursor: 'pointer',
          }}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <div style={{ marginLeft: 'auto', fontSize: 12, color: isDark ? '#475569' : '#9CA3AF', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {loading ? '…' : `${total} results`}
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div style={{ background: isDark ? '#1E293B' : '#fff', border: `1px solid ${isDark ? '#334155' : '#E8ECEF'}`, borderRadius: 18, boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.25)' : '0 4px 18px rgba(15,23,42,0.07)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: isDark ? 'rgba(255,255,255,0.03)' : '#F8F9FC', borderBottom: `1px solid ${isDark ? '#334155' : '#EEF2FF'}` }}>
                {['Salon', 'Subdomain', 'Plan', 'Status', 'Gateway', 'Joined', 'Actions'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '12px 16px',
                    color: isDark ? '#475569' : '#9CA3AF', fontWeight: 700, fontSize: 10.5,
                    textTransform: 'uppercase', letterSpacing: 0.8,
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 52, textAlign: 'center', color: isDark ? '#475569' : '#9CA3AF' }}>
                    <div style={{ fontWeight: 600 }}>Loading tenants…</div>
                  </td>
                </tr>
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 52, textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: isDark ? '#E2E8F0' : '#374151' }}>No tenants</div>
                    <div style={{ fontSize: 12, color: isDark ? '#475569' : '#9CA3AF', marginTop: 4 }}>
                      {search || filterPlan || filterStatus ? 'Try adjusting your filters' : 'Create the first tenant to get started'}
                    </div>
                  </td>
                </tr>
              ) : tenants.map((t) => {
                const pc   = PLAN_COLORS[t.plan]    ?? PLAN_COLORS.trial;
                const sc   = STATUS_COLORS[t.status] ?? STATUS_COLORS.cancelled;
                const trialEnds    = t.trial_ends_at ? new Date(t.trial_ends_at) : null;
                const trialExpired = trialEnds && trialEnds < new Date();
                const av   = getAvatar(t.name);
                return (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${isDark ? '#334155' : '#F3F4F6'}` }}
                    onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : '#FAFAFF'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>

                    {/* Salon — avatar + name + email */}
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, background: av.bg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0,
                          boxShadow: `0 2px 8px ${av.bg}55`,
                        }}>{av.initials}</div>
                        <div>
                          <div style={{ fontWeight: 700, color: isDark ? '#F1F5F9' : '#111827' }}>{t.name}</div>
                          <div style={{ fontSize: 11, color: isDark ? '#475569' : '#9CA3AF', marginTop: 1 }}>{t.email || '—'}</div>
                        </div>
                      </div>
                    </td>

                    {/* Subdomain slug pill */}
                    <td style={{ padding: '11px 16px' }}>
                      <a href={`https://${t.slug}.salon.hexalyte.com`} target="_blank" rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 10px', borderRadius: 6,
                          background: isDark ? 'rgba(129,140,248,0.12)' : '#EEF2FF',
                          color: isDark ? '#818CF8' : '#4338CA',
                          fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
                          textDecoration: 'none',
                          border: `1px solid ${isDark ? 'rgba(129,140,248,0.25)' : '#E0E7FF'}`,
                        }}>
                        {t.slug}<span style={{ fontSize: 9, opacity: 0.6 }}>↗</span>
                      </a>
                    </td>

                    {/* Plan + trial expiry */}
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <Badge colors={pc}>{t.plan}</Badge>
                        {t.plan === 'trial' && trialEnds && (
                          <span style={{ fontSize: 10, color: trialExpired ? '#EF4444' : '#9CA3AF', fontWeight: 500 }}>
                            {trialExpired ? 'Expired' : `ends ${trialEnds.toLocaleDateString()}`}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status pill */}
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 20,
                        background: sc.bg, border: `1px solid ${sc.dot}44`,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot, display: 'block', flexShrink: 0, boxShadow: `0 0 4px ${sc.dot}` }} />
                        <span style={{ fontSize: 11, color: sc.text, fontWeight: 700, textTransform: 'capitalize' }}>{t.status}</span>
                      </div>
                    </td>

                    {/* Payment Gateway */}
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: t.payment_gateway && t.payment_gateway !== 'none'
                          ? (isDark ? 'rgba(129,140,248,0.12)' : '#EEF2FF')
                          : (isDark ? 'rgba(255,255,255,0.04)' : '#F3F4F6'),
                        color: t.payment_gateway && t.payment_gateway !== 'none'
                          ? (isDark ? '#818CF8' : '#4338CA')
                          : (isDark ? '#475569' : '#9CA3AF'),
                        textTransform: 'capitalize',
                      }}>
                        {t.payment_gateway && t.payment_gateway !== 'none' ? t.payment_gateway : '—'}
                      </span>
                    </td>

                    {/* Joined */}
                    <td style={{ padding: '11px 16px', color: isDark ? '#475569' : '#9CA3AF', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>

                    {/* Actions — compact icon buttons */}
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <IBtn onClick={() => openDetail(t)} title="View details"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></IBtn>
                        <IBtn
                          onClick={() => handleImpersonate(t)}
                          disabled={impersonating === t.id || t.status !== 'active'}
                          title={t.status !== 'active' ? 'Tenant must be active' : 'Login as tenant'}
                          bg="#F5F3FF" border="#DDD6FE">
                          {impersonating === t.id ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>}
                        </IBtn>
                        {t.status === 'active' && (
                          <IBtn onClick={() => handleQuickStatus(t, 'suspend')} title="Suspend" bg="#FFF5F5" border="#FEE2E2"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></IBtn>
                        )}
                        {t.status === 'suspended' && (
                          <IBtn onClick={() => handleQuickStatus(t, 'activate')} title="Activate" bg="#F0FDF4" border="#D1FAE5"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg></IBtn>
                        )}
                        <IBtn onClick={() => setEditTenant({ ...t })} title="Edit plan / status"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></IBtn>
                        <IBtn onClick={() => handleDelete(t)} title="Delete tenant" border="#FEE2E2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></IBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 18 }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)} style={{
              width: 34, height: 34, borderRadius: 9,
              border: `1.5px solid ${p === page ? '#4338CA' : '#E5E7EB'}`,
              background: p === page ? '#4338CA' : '#fff',
              color: p === page ? '#fff' : '#374151',
              cursor: 'pointer', fontSize: 13, fontWeight: p === page ? 700 : 400,
              boxShadow: p === page ? '0 2px 8px rgba(67,56,202,0.3)' : 'none',
            }}>{p}</button>
          ))}
        </div>
      )}

      {/* ── Tenant detail side drawer ──────────────────────────────── */}
      {detailTenant && (() => {
        const av = getAvatar(detailTenant.name);
        return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', justifyContent: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setDetailTenant(null); }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,15,30,0.5)', backdropFilter: 'blur(2px)' }}
               onClick={() => setDetailTenant(null)} />
          <div style={{
            position: 'relative', zIndex: 1, width: 400, maxWidth: '92vw',
            background: isDark ? '#0F172A' : '#fff',
            borderLeft: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`,
            boxShadow: isDark ? '-12px 0 50px rgba(0,0,0,0.5)' : '-12px 0 50px rgba(15,23,42,0.15)',
            display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto',
          }}>

            {/* drawer header */}
            <div style={{
              background: isDark
                ? 'linear-gradient(135deg, #1E3A8A 0%, #312E81 100%)'
                : 'linear-gradient(135deg, #1E40AF 0%, #7C3AED 100%)',
              padding: '24px 22px 20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: 13, background: av.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 16, fontWeight: 800,
                    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                  }}>{av.initials}</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{detailTenant.name}</div>
                    <a href={`https://${detailTenant.slug}.salon.hexalyte.com`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', fontWeight: 600 }}>
                      {detailTenant.slug}.salon.hexalyte.com ↗
                    </a>
                  </div>
                </div>
                <button onClick={() => setDetailTenant(null)}
                  style={{ border: 'none', background: 'rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: 18, color: '#fff', lineHeight: 1, width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Badge colors={PLAN_COLORS[detailTenant.plan] ?? PLAN_COLORS.trial}>{detailTenant.plan}</Badge>
                <Badge colors={STATUS_COLORS[detailTenant.status] ?? STATUS_COLORS.cancelled}>{detailTenant.status}</Badge>
              </div>
            </div>

            {/* usage stats */}
            <div style={{ padding: '18px 20px', borderBottom: `1px solid ${isDark ? '#1E293B' : '#F1F5F9'}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: isDark ? '#475569' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Usage Stats</div>
              {detailLoading ? (
                <div style={{ fontSize: 13, color: isDark ? '#475569' : '#9CA3AF', padding: '8px 0' }}>Loading stats…</div>
              ) : detailStats ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Branches',     value: detailStats.branches     ?? '—' },
                    { label: 'Staff',         value: detailStats.staff        ?? '—' },
                    { label: 'Customers',     value: detailStats.customers    ?? '—' },
                    { label: 'Appointments',  value: detailStats.appointments ?? '—' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: isDark ? '#1E293B' : '#F8F7FF', borderRadius: 10, padding: '11px 14px', border: `1px solid ${isDark ? '#334155' : '#EEF2FF'}` }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: isDark ? '#818CF8' : '#4338CA' }}>{value}</div>
                      <div style={{ fontSize: 10.5, color: isDark ? '#475569' : '#9CA3AF', marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: isDark ? '#475569' : '#9CA3AF' }}>Stats unavailable.</div>
              )}
            </div>

            {/* details */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${isDark ? '#1E293B' : '#F1F5F9'}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: isDark ? '#475569' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Details</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {[
                  { label: 'Email',      value: detailTenant.email              || '—' },
                  { label: 'Phone',      value: detailTenant.phone              || '—' },
                  { label: 'Registered', value: detailTenant.createdAt ? new Date(detailTenant.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
                  { label: 'Trial Ends', value: detailTenant.trial_ends_at ? new Date(detailTenant.trial_ends_at).toLocaleDateString() : '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: `1px solid ${isDark ? '#1E293B' : '#F9FAFB'}` }}>
                    <span style={{ color: isDark ? '#64748B' : '#6B7280' }}>{label}</span>
                    <span style={{ color: isDark ? '#F1F5F9' : '#111827', fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* actions */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: isDark ? '#475569' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>Actions</div>
              {[
                {
                  label: 'Edit Plan / Status', color: isDark ? '#818CF8' : '#4338CA',
                  bg: isDark ? '#1E293B' : '#fff', border: isDark ? '#334155' : '#E5E7EB',
                  onClick: () => { setDetailTenant(null); setEditTenant({ ...detailTenant }); },
                  disabled: false,
                },
                {
                  label: 'Login As Tenant →', color: '#7C3AED',
                  bg: isDark ? 'rgba(124,58,237,0.12)' : '#F5F3FF', border: isDark ? 'rgba(124,58,237,0.3)' : '#DDD6FE',
                  onClick: () => { setDetailTenant(null); handleImpersonate(detailTenant); },
                  disabled: detailTenant.status !== 'active',
                },
                ...(detailTenant.status === 'active' ? [{
                  label: 'Suspend Tenant', color: '#DC2626',
                  bg: isDark ? 'rgba(220,38,38,0.1)' : '#FFF5F5', border: isDark ? 'rgba(220,38,38,0.25)' : '#FEE2E2',
                  onClick: () => { setDetailTenant(null); handleQuickStatus(detailTenant, 'suspend'); },
                  disabled: false,
                }] : []),
                ...(detailTenant.status === 'suspended' ? [{
                  label: 'Activate Tenant', color: '#059669',
                  bg: isDark ? 'rgba(5,150,105,0.1)' : '#F0FDF4', border: isDark ? 'rgba(5,150,105,0.25)' : '#D1FAE5',
                  onClick: () => { setDetailTenant(null); handleQuickStatus(detailTenant, 'activate'); },
                  disabled: false,
                }] : []),
              ].map(({ label, color, bg, border, onClick, disabled }) => (
                <button key={label} onClick={onClick} disabled={disabled}
                  style={{
                    padding: '10px 14px', border: `1.5px solid ${border}`, borderRadius: 10,
                    background: bg, cursor: disabled ? 'not-allowed' : 'pointer',
                    fontSize: 13, fontWeight: 600, color, textAlign: 'left',
                    opacity: disabled ? 0.5 : 1, transition: 'opacity 0.15s',
                  }}>
                  {label}
                </button>
              ))}
              <a href={`https://${detailTenant.slug}.salon.hexalyte.com`} target="_blank" rel="noopener noreferrer"
                style={{
                  padding: '10px 14px', borderRadius: 10,
                  border: `1.5px solid ${isDark ? 'rgba(5,150,105,0.3)' : '#D1FAE5'}`,
                  background: isDark ? 'rgba(5,150,105,0.1)' : '#F0FDF4',
                  fontSize: 13, fontWeight: 600, color: '#059669',
                  textDecoration: 'none', display: 'block',
                }}>
                Open Dashboard →
              </a>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Edit Modal */}
      {editTenant && (
        <Modal title={`Edit — ${editTenant.name}`} onClose={() => setEditTenant(null)} isDark={isDark}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[['Plan', 'plan', PLANS.map(p => ({ v: p, l: p.charAt(0).toUpperCase() + p.slice(1) })), 'select'],
              ['Status', 'status', [{v:'active',l:'Active'},{v:'suspended',l:'Suspended'},{v:'cancelled',l:'Cancelled'}], 'select'],
              ['Payment Gateway', 'payment_gateway', [{v:'none',l:'None'},{v:'stripe',l:'Stripe'},{v:'paypal',l:'PayPal'},{v:'square',l:'Square'}], 'select'],
            ].map(([label, key, opts, type]) => (
              <div key={key}>
                <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#94A3B8' : '#374151', display: 'block', marginBottom: 5 }}>{label}</label>
                <select value={editTenant[key] || (key === 'payment_gateway' ? 'none' : '')}
                  onChange={e => setEditTenant(t => ({ ...t, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 9, fontSize: 13, outline: 'none', background: isDark ? '#0F172A' : '#fff', color: isDark ? '#E2E8F0' : '#111827' }}>
                  {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#94A3B8' : '#374151', display: 'block', marginBottom: 5 }}>Back Transfer Wage</label>
              <input type="number" step="0.01" value={editTenant.back_transfer_wage ?? 0}
                onChange={e => setEditTenant(t => ({ ...t, back_transfer_wage: parseFloat(e.target.value) }))}
                style={{ width: '100%', padding: '9px 12px', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: isDark ? '#0F172A' : '#fff', color: isDark ? '#E2E8F0' : '#111827' }}
              />
            </div>
            <div style={{ borderTop: `1px solid ${isDark ? '#334155' : '#F3F4F6'}`, paddingTop: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: isDark ? '#64748B' : '#6B7280', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>HelaPay / LankaQR Settings</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Business ID',    key: 'helapay_business_id',  ph: 'e.g. 223', type: 'text' },
                  { label: 'Merchant ID',    key: 'helapay_merchant_id',  ph: 'e.g. HLPM-00123', type: 'text' },
                  { label: 'App ID',         key: 'helapay_app_id',       ph: 'App ID from HelaPOS', type: 'text' },
                  { label: 'App Secret',     key: 'helapay_app_secret',   ph: 'App Secret from HelaPOS', type: 'password' },
                  { label: 'Notify URL',     key: 'helapay_notify_url',   ph: 'https://api.salon.hexalyte.com/api/helapay/callback', type: 'text' },
                ].map(({ label, key, ph, type }) => (
                  <div key={key}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#94A3B8' : '#374151', display: 'block', marginBottom: 4 }}>{label}</label>
                    <input type={type} value={editTenant[key] || ''}
                      onChange={e => setEditTenant(t => ({ ...t, [key]: e.target.value }))}
                      placeholder={ph}
                      style={{ width: '100%', padding: '8px 12px', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: isDark ? '#0F172A' : '#fff', color: isDark ? '#E2E8F0' : '#111827' }}
                    />
                  </div>
                ))}
                <p style={{ fontSize: 11, color: isDark ? '#64748B' : '#6B7280', marginTop: 2 }}>Email to <a href="mailto:support@helapay.lk" style={{ color: '#818CF8' }}>support@helapay.lk</a> to register credentials.</p>
              </div>
            </div>

            {error && <div style={{ color: '#EF4444', fontSize: 12, background: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', padding: '8px 12px', borderRadius: 8, border: `1px solid ${isDark ? 'rgba(239,68,68,0.25)' : '#FECACA'}` }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button onClick={() => setEditTenant(null)}
                style={{ padding: '9px 20px', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 9, background: isDark ? '#1E293B' : '#fff', cursor: 'pointer', fontSize: 13, color: isDark ? '#94A3B8' : '#374151' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{
                  padding: '9px 22px', border: 'none', borderRadius: 9,
                  background: '#4F46E5', color: '#fff', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1,
                  boxShadow: '0 4px 12px rgba(79,70,229,0.3)',
                }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create Tenant Modal */}
      {createOpen && (
        <Modal title={createdTenant ? 'Tenant Created' : 'Create Tenant'} onClose={() => setCreateOpen(false)} isDark={isDark}>
          {createdTenant ? (
            /* ── Success state ───────────────────────────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#065F46', marginBottom: 10 }}>
                  {createdTenant.name} — account ready!
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <InfoRow label="Dashboard URL" value={createdTenant.url} isLink />
                  <InfoRow label="Username / Email" value={createdTenant.ownerUsername} />
                  <InfoRow label="Password" value={createdTenant.password} mono />
                  <InfoRow label="Plan" value={createdTenant.plan} />
                </div>
              </div>
              <p style={{ fontSize: 11, color: isDark ? '#64748B' : '#9CA3AF', margin: 0, lineHeight: 1.5 }}>
                Share the URL and credentials with the client. They can change their password from Settings after logging in.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <a
                  href={createdTenant.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '9px 22px', borderRadius: 9, background: '#059669',
                    color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none',
                    display: 'inline-block', boxShadow: '0 4px 12px rgba(5,150,105,0.3)',
                  }}>
                  Open Dashboard ↗
                </a>
                <button onClick={() => setCreateOpen(false)}
                  style={{ padding: '9px 22px', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 9, background: isDark ? '#1E293B' : '#fff', cursor: 'pointer', fontSize: 13, color: isDark ? '#94A3B8' : '#374151' }}>
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* ── Create form ────────────────────────────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Business Name</label>
              <input
                value={createForm.businessName}
                onChange={(e) => setCreateForm((p) => ({ ...p, businessName: e.target.value }))}
                onBlur={() => {
                  if (!createForm.slug && createForm.businessName) {
                    const auto = createForm.businessName
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-+|-+$/g, '')
                      .slice(0, 40);
                    setCreateForm((p) => ({ ...p, slug: auto }));
                  }
                }}
                style={{ width: '100%', padding: '9px 12px', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 9, fontSize: 13, outline: 'none', background: isDark ? '#0F172A' : '#fff', color: isDark ? '#E2E8F0' : '#111827' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#94A3B8' : '#374151', display: 'block', marginBottom: 6 }}>Slug (Subdomain)</label>
              <input value={createForm.slug} onChange={(e) => setCreateForm((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                placeholder="e.g. zane"
                style={{ width: '100%', padding: '9px 12px', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 9, fontSize: 13, outline: 'none', fontFamily: 'monospace', background: isDark ? '#0F172A' : '#fff', color: isDark ? '#E2E8F0' : '#111827' }} />
              {createForm.slug && (
                <div style={{ marginTop: 5, fontSize: 12, color: isDark ? '#64748B' : '#6B7280' }}>
                  URL: <span style={{ color: isDark ? '#818CF8' : '#7C3AED', fontWeight: 600, fontFamily: 'monospace' }}>{createForm.slug}.salon.hexalyte.com</span>
                </div>
              )}
            </div>
            {[
              { label: 'Owner Name', key: 'ownerName', type: 'text', half: true },
              { label: 'Owner Email', key: 'ownerEmail', type: 'email', half: true },
              { label: 'Password', key: 'password', type: 'password', half: true },
              { label: 'Phone (optional)', key: 'phone', type: 'text', half: true },
            ].reduce((rows, field, i, arr) => {
              if (field.half && arr[i+1]?.half) {
                rows.push([field, arr.splice(i+1, 1)[0]]);
              } else if (field.half) {
                rows.push([field]);
              }
              return rows;
            }, []).map((pair, ri) => (
              <div key={ri} style={{ display: 'grid', gridTemplateColumns: pair.length === 2 ? '1fr 1fr' : '1fr', gap: 10 }}>
                {pair.map(({ label, key, type }) => (
                  <div key={key}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#94A3B8' : '#374151', display: 'block', marginBottom: 5 }}>{label}</label>
                    <input type={type} value={createForm[key]} onChange={(e) => setCreateForm((p) => ({ ...p, [key]: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 9, fontSize: 13, outline: 'none', background: isDark ? '#0F172A' : '#fff', color: isDark ? '#E2E8F0' : '#111827', boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#94A3B8' : '#374151', display: 'block', marginBottom: 5 }}>Plan</label>
                <select value={createForm.plan} onChange={(e) => setCreateForm((p) => ({ ...p, plan: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 9, fontSize: 13, outline: 'none', background: isDark ? '#0F172A' : '#fff', color: isDark ? '#E2E8F0' : '#111827' }}>
                  {PLANS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#94A3B8' : '#374151', display: 'block', marginBottom: 5 }}>Status</label>
                <select value={createForm.status} onChange={(e) => setCreateForm((p) => ({ ...p, status: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 9, fontSize: 13, outline: 'none', background: isDark ? '#0F172A' : '#fff', color: isDark ? '#E2E8F0' : '#111827' }}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#94A3B8' : '#374151', display: 'block', marginBottom: 5 }}>First Branch Name (optional)</label>
              <input value={createForm.branchName} onChange={(e) => setCreateForm((p) => ({ ...p, branchName: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 9, fontSize: 13, outline: 'none', background: isDark ? '#0F172A' : '#fff', color: isDark ? '#E2E8F0' : '#111827' }} />
            </div>

            {createError && <div style={{ color: '#EF4444', fontSize: 12, background: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', padding: '8px 12px', borderRadius: 8, border: `1px solid ${isDark ? 'rgba(239,68,68,0.25)' : '#FECACA'}` }}>{createError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button onClick={() => setCreateOpen(false)}
                style={{ padding: '9px 22px', border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 9, background: isDark ? '#1E293B' : '#fff', cursor: 'pointer', fontSize: 13, color: isDark ? '#94A3B8' : '#374151' }}>
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating}
                style={{
                  padding: '9px 24px', border: 'none', borderRadius: 9,
                  background: '#4F46E5', color: '#fff', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700, opacity: creating ? 0.7 : 1,
                  boxShadow: '0 4px 12px rgba(79,70,229,0.3)',
                }}>
                {creating ? 'Creating…' : 'Create Tenant'}
              </button>
            </div>
          </div>
          )}
        </Modal>
      )}
    </div>
  );
}
