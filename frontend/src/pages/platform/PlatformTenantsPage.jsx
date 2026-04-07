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

export default function PlatformTenantsPage() {
  const [tenants, setTenants]     = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterPlan, setFilterPlan]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage]           = useState(1);
  const [editTenant, setEditTenant] = useState(null); // { id, name, plan, status }
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const PER_PAGE = 20;

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
        setTenants(r.data.tenants ?? r.data);
        setTotal(r.data.total ?? r.data.length ?? 0);
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

  const totalPages = Math.ceil(total / PER_PAGE);

  const inputStyle = {
    border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 12px',
    fontSize: 13, outline: 'none', background: '#fff', color: '#1E1B4B',
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, background: '#F5F3FF', minHeight: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E1B4B', margin: 0 }}>Tenants</h1>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>Manage all salon accounts on the platform</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
        <input
          placeholder="Search name or slug…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ ...inputStyle, width: 220 }}
        />
        <select value={filterPlan} onChange={e => { setFilterPlan(e.target.value); setPage(1); }}
          style={{ ...inputStyle, width: 130 }}>
          <option value="">All Plans</option>
          {PLANS.map(p => <option key={p} value={p} style={{ textTransform: 'capitalize' }}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          style={{ ...inputStyle, width: 130 }}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#6B7280' }}>
          {loading ? 'Loading…' : `${total} tenants`}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#FAFAFF' }}>
                {['#', 'Salon Name', 'Slug', 'Email', 'Plan', 'Status', 'Trial Ends', 'Registered', 'Actions'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '11px 14px',
                    color: '#6B7280', fontWeight: 600, fontSize: 11,
                    textTransform: 'uppercase', letterSpacing: 0.6,
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>Loading…</td>
                </tr>
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>No tenants found.</td>
                </tr>
              ) : tenants.map((t, i) => {
                const pc = PLAN_COLORS[t.plan]   ?? PLAN_COLORS.trial;
                const sc = STATUS_COLORS[t.status] ?? STATUS_COLORS.cancelled;
                const trialEnds = t.trial_ends_at ? new Date(t.trial_ends_at) : null;
                const trialExpired = trialEnds && trialEnds < new Date();
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid #F9FAFB' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FAFAFF'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '10px 14px', color: '#9CA3AF', fontSize: 11 }}>{(page - 1) * PER_PAGE + i + 1}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1E1B4B' }}>{t.name}</td>
                    <td style={{ padding: '10px 14px', color: '#6366F1', fontFamily: 'monospace', fontSize: 12 }}>{t.slug}</td>
                    <td style={{ padding: '10px 14px', color: '#6B7280' }}>{t.email}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <Badge colors={pc}>{t.plan}</Badge>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                        <span style={{ color: sc.text, textTransform: 'capitalize' }}>{t.status}</span>
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: trialExpired ? '#EF4444' : '#6B7280', fontSize: 12 }}>
                      {t.plan === 'trial' && trialEnds
                        ? trialExpired ? 'Expired' : trialEnds.toLocaleDateString()
                        : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#9CA3AF', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setEditTenant({ ...t })}
                          style={{
                            padding: '4px 12px', border: '1px solid #E5E7EB',
                            borderRadius: 6, background: '#fff', cursor: 'pointer',
                            fontSize: 12, color: '#4338CA', fontWeight: 500,
                          }}>
                          Edit
                        </button>
                        <button onClick={() => handleDelete(t)}
                          style={{
                            padding: '4px 10px', border: '1px solid #FEE2E2',
                            borderRadius: 6, background: '#fff', cursor: 'pointer',
                            fontSize: 12, color: '#EF4444', fontWeight: 500,
                          }}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)} style={{
              width: 32, height: 32, borderRadius: 8,
              border: `1px solid ${p === page ? '#4338CA' : '#E5E7EB'}`,
              background: p === page ? '#4338CA' : '#fff',
              color: p === page ? '#fff' : '#374151',
              cursor: 'pointer', fontSize: 13, fontWeight: p === page ? 700 : 400,
            }}>{p}</button>
          ))}
        </div>
      )}

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
    </div>
  );
}
