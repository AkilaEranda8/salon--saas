import React, { useEffect, useState, useCallback } from 'react';
import api from '../../api/axios';

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

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(30,27,75,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: 14, padding: '28px 28px 24px',
        width: 440, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1E1B4B' }}>{title}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: '#9CA3AF', lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, value, isLink, mono }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ color: '#6B7280', width: 120, flexShrink: 0 }}>{label}</span>
      {isLink ? (
        <a href={value} target="_blank" rel="noopener noreferrer"
          style={{ color: '#4338CA', fontWeight: 600, wordBreak: 'break-all' }}>{value}</a>
      ) : (
        <span style={{ color: '#1E1B4B', fontWeight: 600, fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
      )}
      <button onClick={handleCopy}
        style={{ marginLeft: 'auto', padding: '2px 8px', border: '1px solid #D1D5DB', borderRadius: 5, background: '#fff', cursor: 'pointer', fontSize: 11, flexShrink: 0 }}>
        {copied ? '✓' : 'Copy'}
      </button>
    </div>
  );
}

export default function PlatformTenantsPage() {
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

  const IBtn = ({ onClick, title, disabled, bg = '#fff', border = '#E5E7EB', children }) => (
    <button onClick={onClick} title={title} disabled={disabled} style={{
      width: 30, height: 30, borderRadius: 7,
      border: `1.5px solid ${border}`, background: bg,
      cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, opacity: disabled ? 0.4 : 1, flexShrink: 0,
      transition: 'opacity 0.15s',
    }}>{children}</button>
  );

  return (
    <div style={{ padding: '24px 28px', background: 'var(--app-bg)', minHeight: '100%' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #1E1B4B 0%, #4338CA 100%)',
        borderRadius: 16, padding: '22px 28px 20px', marginBottom: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        boxShadow: '0 4px 20px rgba(67,56,202,0.25)',
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 5 }}>
            Platform Admin
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: -0.3 }}>Tenants</h1>
          <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginTop: 3, marginBottom: 0 }}>
            {loading ? 'Loading…' : `${total} registered salon accounts on the platform`}
          </p>
        </div>
        <button onClick={openCreate} style={{
          padding: '10px 20px', borderRadius: 10, border: 'none',
          background: '#fff', color: '#4338CA',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          <span style={{ fontSize: 17, lineHeight: 1, marginTop: -1 }}>+</span> New Tenant
        </button>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
          {[
            { label: 'Total Tenants', value: total,          color: '#4338CA', bg: '#EEF2FF', border: '#C7D2FE' },
            { label: 'Active',        value: activeCount,    color: '#059669', bg: '#F0FDF4', border: '#A7F3D0' },
            { label: 'Suspended',     value: suspendedCount, color: '#DC2626', bg: '#FFF1F2', border: '#FECDD3' },
            { label: 'On Trial',      value: trialCount,     color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
          ].map(({ label, value, color, bg, border }) => (
            <div key={label} style={{
              background: '#fff', borderRadius: 12, padding: '14px 18px',
              border: `1px solid ${border}`,
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500, marginTop: 3 }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: '10px 14px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 14,
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 260 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', lineHeight: 0, pointerEvents: 'none' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input
            placeholder="Search salons or slugs…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{
              width: '100%', padding: '7px 10px 7px 30px',
              border: '1.5px solid #E5E7EB', borderRadius: 8,
              fontSize: 13, outline: 'none', background: '#FAFAFA', color: '#1E1B4B',
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
                  padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', border: `1.5px solid ${active ? '#4338CA' : '#E5E7EB'}`,
                  background: active ? '#EEF2FF' : '#fff', color: active ? '#4338CA' : '#6B7280',
                  transition: 'all 0.12s',
                }}>{label}</button>
            );
          })}
        </div>

        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          style={{
            padding: '6px 10px', border: '1.5px solid #E5E7EB', borderRadius: 8,
            fontSize: 12, outline: 'none', background: '#fff', color: '#374151', cursor: 'pointer',
          }}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#9CA3AF', fontWeight: 500, whiteSpace: 'nowrap' }}>
          {loading ? '…' : `${total} total`}
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8F7FF', borderBottom: '2px solid #EEF2FF' }}>
                {['Salon', 'Subdomain', 'Plan', 'Status', 'Gateway', 'Joined', 'Actions'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '11px 16px',
                    color: '#7C3AED', fontWeight: 700, fontSize: 10.5,
                    textTransform: 'uppercase', letterSpacing: 0.8,
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 52, textAlign: 'center', color: '#9CA3AF' }}>
                    <div style={{ fontWeight: 600 }}>Loading tenants…</div>
                  </td>
                </tr>
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 52, textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>No tenants</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>
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
                  <tr key={t.id} style={{ borderBottom: '1px solid #F3F4F6' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FAFAFF'}
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
                          <div style={{ fontWeight: 700, color: '#1E1B4B' }}>{t.name}</div>
                          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{t.email || '—'}</div>
                        </div>
                      </div>
                    </td>

                    {/* Subdomain slug pill */}
                    <td style={{ padding: '11px 16px' }}>
                      <a href={`https://${t.slug}.salon.hexalyte.com`} target="_blank" rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 9px', borderRadius: 6,
                          background: '#EEF2FF', color: '#4338CA',
                          fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
                          textDecoration: 'none', border: '1px solid #E0E7FF',
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
                        padding: '3px 10px', borderRadius: 20,
                        background: sc.bg, border: `1px solid ${sc.dot}33`,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot, display: 'block', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: sc.text, fontWeight: 700, textTransform: 'capitalize' }}>{t.status}</span>
                      </div>
                    </td>

                    {/* Payment Gateway */}
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: t.payment_gateway && t.payment_gateway !== 'none' ? '#EEF2FF' : '#F3F4F6',
                        color: t.payment_gateway && t.payment_gateway !== 'none' ? '#4338CA' : '#9CA3AF',
                        textTransform: 'capitalize',
                      }}>
                        {t.payment_gateway && t.payment_gateway !== 'none' ? t.payment_gateway : '—'}
                      </span>
                    </td>

                    {/* Joined */}
                    <td style={{ padding: '11px 16px', color: '#9CA3AF', fontSize: 12, whiteSpace: 'nowrap' }}>
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

      {/* ── Tenant detail side drawer ────────────────────────────────── */}
      {detailTenant && (() => {
        const av = getAvatar(detailTenant.name);
        return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', justifyContent: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setDetailTenant(null); }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(30,27,75,0.28)' }}
               onClick={() => setDetailTenant(null)} />
          <div style={{
            position: 'relative', zIndex: 1, width: 400, maxWidth: '92vw',
            background: '#fff', boxShadow: '-6px 0 40px rgba(0,0,0,0.16)',
            display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto',
          }}>

            {/* drawer header */}
            <div style={{
              background: 'linear-gradient(135deg, #1E1B4B 0%, #4338CA 100%)',
              padding: '22px 24px 20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, background: av.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 16, fontWeight: 800,
                    boxShadow: '0 3px 10px rgba(0,0,0,0.2)',
                  }}>{av.initials}</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{detailTenant.name}</div>
                    <a href={`https://${detailTenant.slug}.salon.hexalyte.com`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace', fontWeight: 600 }}>
                      {detailTenant.slug}.salon.hexalyte.com ↗
                    </a>
                  </div>
                </div>
                <button onClick={() => setDetailTenant(null)}
                  style={{ border: 'none', background: 'rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: 18, color: '#fff', lineHeight: 1, width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Badge colors={PLAN_COLORS[detailTenant.plan] ?? PLAN_COLORS.trial}>{detailTenant.plan}</Badge>
                <Badge colors={STATUS_COLORS[detailTenant.status] ?? STATUS_COLORS.cancelled}>{detailTenant.status}</Badge>
              </div>
            </div>

            {/* usage stats */}
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Usage Stats</div>
              {detailLoading ? (
                <div style={{ fontSize: 13, color: '#9CA3AF', padding: '8px 0' }}>Loading stats…</div>
              ) : detailStats ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Branches',     value: detailStats.branches     ?? '—' },
                    { label: 'Staff',         value: detailStats.staff        ?? '—' },
                    { label: 'Customers',     value: detailStats.customers    ?? '—' },
                    { label: 'Appointments',  value: detailStats.appointments ?? '—' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: '#F8F7FF', borderRadius: 10, padding: '11px 14px', border: '1px solid #EEF2FF' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#4338CA' }}>{value}</div>
                      <div style={{ fontSize: 10.5, color: '#9CA3AF', marginTop: 1 }}>{label}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#9CA3AF' }}>Stats unavailable.</div>
              )}
            </div>

            {/* details */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Details</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { label: 'Email',      value: detailTenant.email              || '—' },
                  { label: 'Phone',      value: detailTenant.phone              || '—' },
                  { label: 'Registered', value: detailTenant.createdAt ? new Date(detailTenant.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
                  { label: 'Trial Ends', value: detailTenant.trial_ends_at ? new Date(detailTenant.trial_ends_at).toLocaleDateString() : '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid #F9FAFB' }}>
                    <span style={{ color: '#6B7280' }}>{label}</span>
                    <span style={{ color: '#1E1B4B', fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* actions */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>Actions</div>
              {[
                {
                  label: 'Edit Plan / Status', color: '#4338CA',
                  bg: '#fff', border: '#E5E7EB',
                  onClick: () => { setDetailTenant(null); setEditTenant({ ...detailTenant }); },
                  disabled: false,
                },
                {
                  label: 'Login As Tenant →', color: '#7C3AED',
                  bg: '#F5F3FF', border: '#DDD6FE',
                  onClick: () => { setDetailTenant(null); handleImpersonate(detailTenant); },
                  disabled: detailTenant.status !== 'active',
                },
                ...(detailTenant.status === 'active' ? [{
                  label: 'Suspend Tenant', color: '#DC2626',
                  bg: '#FFF5F5', border: '#FEE2E2',
                  onClick: () => { setDetailTenant(null); handleQuickStatus(detailTenant, 'suspend'); },
                  disabled: false,
                }] : []),
                ...(detailTenant.status === 'suspended' ? [{
                  label: 'Activate Tenant', color: '#059669',
                  bg: '#F0FDF4', border: '#D1FAE5',
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
                  padding: '10px 14px', border: '1.5px solid #D1FAE5', borderRadius: 10,
                  background: '#F0FDF4', fontSize: 13, fontWeight: 600, color: '#059669',
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
        <Modal title={`Edit — ${editTenant.name}`} onClose={() => setEditTenant(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Plan</label>
              <select value={editTenant.plan}
                onChange={e => setEditTenant(t => ({ ...t, plan: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }}>
                {PLANS.map(p => <option key={p} value={p} style={{ textTransform: 'capitalize' }}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Status</label>
              <select value={editTenant.status}
                onChange={e => setEditTenant(t => ({ ...t, status: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Payment Gateway</label>
              <select value={editTenant.payment_gateway || 'none'}
                onChange={e => setEditTenant(t => ({ ...t, payment_gateway: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }}>
                <option value="none">None</option>
                <option value="stripe">Stripe</option>
                <option value="paypal">PayPal</option>
                <option value="square">Square</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Back Transfer Wage</label>
              <input type="number" step="0.01" value={editTenant.back_transfer_wage ?? 0}
                onChange={e => setEditTenant(t => ({ ...t, back_transfer_wage: parseFloat(e.target.value) }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>HelaPay / LankaQR Settings</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Business ID</label>
                  <input type="text" value={editTenant.helapay_business_id || ''}
                    onChange={e => setEditTenant(t => ({ ...t, helapay_business_id: e.target.value }))}
                    placeholder="e.g. 223"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Merchant ID</label>
                  <input type="text" value={editTenant.helapay_merchant_id || ''}
                    onChange={e => setEditTenant(t => ({ ...t, helapay_merchant_id: e.target.value }))}
                    placeholder="e.g. HLPM-00123"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>App ID</label>
                  <input type="text" value={editTenant.helapay_app_id || ''}
                    onChange={e => setEditTenant(t => ({ ...t, helapay_app_id: e.target.value }))}
                    placeholder="App ID from HelaPOS"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>App Secret</label>
                  <input type="password" value={editTenant.helapay_app_secret || ''}
                    onChange={e => setEditTenant(t => ({ ...t, helapay_app_secret: e.target.value }))}
                    placeholder="App Secret from HelaPOS"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Notify URL (Webhook)</label>
                  <input type="text" value={editTenant.helapay_notify_url || ''}
                    onChange={e => setEditTenant(t => ({ ...t, helapay_notify_url: e.target.value }))}
                    placeholder="https://api.salon.hexalyte.com/api/helapay/callback"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                  <p style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>Email to <a href="mailto:support@helapay.lk" style={{ color: '#2563EB' }}>support@helapay.lk</a> to register these credentials.</p>
                </div>
              </div>
            </div>

            {error && <div style={{ color: '#EF4444', fontSize: 12 }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button onClick={() => setEditTenant(null)}
                style={{ padding: '9px 20px', border: '1px solid #E5E7EB', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{
                  padding: '9px 20px', border: 'none', borderRadius: 8,
                  background: '#4338CA', color: '#fff', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1,
                }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create Tenant Modal */}
      {createOpen && (
        <Modal title={createdTenant ? 'Tenant Created' : 'Create Tenant'} onClose={() => setCreateOpen(false)}>
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
              <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0, lineHeight: 1.5 }}>
                Share the URL and credentials with the client. They can change their password from Settings after logging in.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <a
                  href={createdTenant.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '9px 20px', borderRadius: 8, background: '#059669',
                    color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none',
                    display: 'inline-block',
                  }}>
                  Open Dashboard ↗
                </a>
                <button onClick={() => setCreateOpen(false)}
                  style={{ padding: '9px 20px', border: '1px solid #E5E7EB', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
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
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Slug (Subdomain)</label>
              <input value={createForm.slug} onChange={(e) => setCreateForm((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                placeholder="e.g. zane"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'monospace' }} />
              {createForm.slug && (
                <div style={{ marginTop: 5, fontSize: 12, color: '#6B7280' }}>
                  URL: <span style={{ color: '#7C3AED', fontWeight: 600, fontFamily: 'monospace' }}>{createForm.slug}.salon.hexalyte.com</span>
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Owner Name</label>
                <input value={createForm.ownerName} onChange={(e) => setCreateForm((p) => ({ ...p, ownerName: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Owner Email</label>
                <input type="email" value={createForm.ownerEmail} onChange={(e) => setCreateForm((p) => ({ ...p, ownerEmail: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Password</label>
                <input type="password" value={createForm.password} onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Phone (optional)</label>
                <input value={createForm.phone} onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Plan</label>
                <select value={createForm.plan} onChange={(e) => setCreateForm((p) => ({ ...p, plan: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }}>
                  {PLANS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Status</label>
                <select value={createForm.status} onChange={(e) => setCreateForm((p) => ({ ...p, status: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>First Branch Name (optional)</label>
              <input value={createForm.branchName} onChange={(e) => setCreateForm((p) => ({ ...p, branchName: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }} />
            </div>

            {createError && <div style={{ color: '#EF4444', fontSize: 12 }}>{createError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button onClick={() => setCreateOpen(false)}
                style={{ padding: '9px 20px', border: '1px solid #E5E7EB', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating}
                style={{
                  padding: '9px 20px', border: 'none', borderRadius: 8,
                  background: '#4338CA', color: '#fff', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, opacity: creating ? 0.7 : 1,
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
