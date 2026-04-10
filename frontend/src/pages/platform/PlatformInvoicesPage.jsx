import React, { useEffect, useState, useCallback } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  draft:    { bg: '#F3F4F6', text: '#374151', dot: '#9CA3AF' },
  issued:   { bg: '#EEF2FF', text: '#4338CA', dot: '#6366F1' },
  paid:     { bg: '#F0FDF4', text: '#059669', dot: '#10B981' },
  overdue:  { bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B' },
  cancelled: { bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF' },
};

function Badge({ children, colors }) {
  return (
    <span style={{
      background: colors.bg, color: colors.text,
      border: `1px solid ${colors.dot}33`,
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
        width: 480, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
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

export default function PlatformInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPayment, setFilterPayment] = useState(''); // 'paid', 'unpaid', or ''
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    tenant_id: '',
    billing_period_start: '',
    billing_period_end: '',
    amount: '',
    plan: '',
    base_price: '',
    additional_charges: '0',
    discount: '0',
    notes: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editInvoice, setEditInvoice] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [tenants, setTenants] = useState([]);

  const PER_PAGE = 20;

  const fetchInvoices = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (filterPayment === 'paid') {
      params.set('status', 'paid');
    } else if (filterPayment === 'unpaid') {
      params.set('unpaid', 'true');
    }
    params.set('page', page);
    params.set('limit', PER_PAGE);

    api.get(`/platform/invoices?${params}`)
      .then(r => {
        const data = Array.isArray(r.data?.invoices) ? r.data.invoices : [];
        const totalCount = r.data?.total ?? data.length;
        setInvoices(data);
        setTotal(totalCount);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filterStatus, page]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  // Fetch tenants for create form dropdown
  useEffect(() => {
    api.get('/platform/tenants?limit=500')
      .then(r => {
        const data = Array.isArray(r.data?.tenants) ? r.data.tenants : [];
        setTenants(data);
      })
      .catch(console.error);
  }, []);

  const handleCreate = async () => {
    setCreateError('');
    if (!createForm.tenant_id || !createForm.billing_period_start || !createForm.billing_period_end || !createForm.amount) {
      setCreateError('Tenant, start date, end date, and amount are required.');
      return;
    }

    setCreating(true);
    try {
      await api.post('/platform/invoices', {
        tenant_id: parseInt(createForm.tenant_id),
        billing_period_start: createForm.billing_period_start,
        billing_period_end: createForm.billing_period_end,
        amount: parseFloat(createForm.amount),
        currency: 'USD',
        plan: createForm.plan || null,
        base_price: createForm.base_price ? parseFloat(createForm.base_price) : null,
        additional_charges: parseFloat(createForm.additional_charges) || 0,
        discount: parseFloat(createForm.discount) || 0,
        notes: createForm.notes || null,
      });
      setCreateOpen(false);
      fetchInvoices();
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Create failed.');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEdit = async () => {
    setEditError('');
    if (!editInvoice?.id) return;

    setSaving(true);
    try {
      await api.patch(`/platform/invoices/${editInvoice.id}`, editForm);
      setEditInvoice(null);
      fetchInvoices();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this invoice? This cannot be undone.')) return;
    try {
      await api.delete(`/platform/invoices/${id}`);
      fetchInvoices();
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed.');
    }
  };

  const handleDownloadPdf = (id) => {
    window.open(`/api/platform/invoices/${id}/pdf`, '_blank');
  };

  const handleEmailInvoice = async (inv) => {
    try {
      await api.post(`/platform/invoices/${inv.id}/email`, { email: inv.tenant?.email || '' });
      toast.success(`Invoice emailed to ${inv.tenant?.email || 'recipient'}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send invoice email.');
    }
  };

  const totalPages = Math.ceil(total / PER_PAGE);

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
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: -0.3 }}>Invoices</h1>
          <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginTop: 3, marginBottom: 0 }}>
            {loading ? 'Loading…' : `${total} invoices total`}
          </p>
        </div>
        <button onClick={() => {
          setCreateForm({
            tenant_id: '',
            billing_period_start: '',
            billing_period_end: '',
            amount: '',
            plan: '',
            base_price: '',
            additional_charges: '0',
            discount: '0',
            notes: '',
          });
          setCreateError('');
          setCreateOpen(true);
        }} style={{
          padding: '10px 20px', borderRadius: 10, border: 'none',
          background: '#fff', color: '#4338CA',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          <span style={{ fontSize: 17, lineHeight: 1, marginTop: -1 }}>+</span> New Invoice
        </button>
      </div>

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
            placeholder="Search invoices…"
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
          {['', 'paid', 'unpaid'].map(p => {
            const active = filterPayment === p;
            const label = p === '' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1);
            return (
              <button key={p} onClick={() => { setFilterPayment(p); setPage(1); }}
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
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="overdue">Overdue</option>
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
                {['Invoice #', 'Tenant', 'Amount', 'Period', 'Status', 'Issued', 'Actions'].map(h => (
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
                    <div style={{ fontWeight: 600 }}>Loading invoices…</div>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 52, textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>No invoices</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>
                      {search || filterStatus ? 'Try adjusting your filters' : 'Create the first invoice to get started'}
                    </div>
                  </td>
                </tr>
              ) : invoices.map((inv) => {
                const sc = STATUS_COLORS[inv.status] ?? STATUS_COLORS.draft;
                const issuedDate = inv.issued_at ? new Date(inv.issued_at) : null;
                return (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #F3F4F6' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FAFAFF'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>

                    {/* Invoice number */}
                    <td style={{ padding: '11px 16px', fontWeight: 600, color: '#4338CA', fontFamily: 'monospace', fontSize: 12 }}>
                      {inv.invoice_number}
                    </td>

                    {/* Tenant name + slug */}
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#1E1B4B' }}>{inv.tenant?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{inv.tenant?.slug || '—'}</div>
                    </td>

                    {/* Amount */}
                    <td style={{ padding: '11px 16px', fontWeight: 700, color: '#374151', fontSize: 13 }}>
                      ${parseFloat(inv.amount).toFixed(2)}
                    </td>

                    {/* Period */}
                    <td style={{ padding: '11px 16px', color: '#6B7280', fontSize: 12 }}>
                      {inv.billing_period_start ? new Date(inv.billing_period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      {' - '}
                      {inv.billing_period_end ? new Date(inv.billing_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '11px 16px' }}>
                      <Badge colors={sc}>{inv.status}</Badge>
                    </td>

                    {/* Issued date */}
                    <td style={{ padding: '11px 16px', color: '#9CA3AF', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {issuedDate ? issuedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => handleDownloadPdf(inv.id)} title="Download PDF"
                          style={{
                            width: 30, height: 30, borderRadius: 7,
                            border: '1.5px solid #DBEAFE', background: '#EFF6FF',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, flexShrink: 0,
                          }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        </button>
                        <button onClick={() => handleEmailInvoice(inv)} title="Send Email"
                          style={{
                            width: 30, height: 30, borderRadius: 7,
                            border: '1.5px solid #D1FAE5', background: '#ECFDF5',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, flexShrink: 0,
                          }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v16H4z"/><path d="M4 7l8 6 8-6"/></svg>
                        </button>
                        <button onClick={() => {
                          setEditInvoice(inv);
                          setEditForm({
                            status: inv.status,
                            paid_at: inv.paid_at ? new Date(inv.paid_at).toISOString().split('T')[0] : '',
                            additional_charges: inv.additional_charges,
                            discount: inv.discount,
                            notes: inv.notes,
                          });
                          setEditError('');
                        }} title="Edit invoice"
                          style={{
                            width: 30, height: 30, borderRadius: 7,
                            border: '1.5px solid #E5E7EB', background: '#fff',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, opacity: 1, flexShrink: 0, transition: 'opacity 0.15s',
                          }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={() => handleDelete(inv.id)} title="Delete invoice" border="#FEE2E2"
                          style={{
                            width: 30, height: 30, borderRadius: 7,
                            border: '1.5px solid #FEE2E2', background: '#fff',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, opacity: 1, flexShrink: 0, transition: 'opacity 0.15s',
                          }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
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

      {/* ── Create Invoice Modal ───────────────────────────────────────── */}
      {createOpen && (
        <Modal title="Create Invoice" onClose={() => setCreateOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Tenant</label>
              <select value={createForm.tenant_id}
                onChange={e => setCreateForm(f => ({ ...f, tenant_id: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }}>
                <option value="">Select tenant…</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Start Date</label>
                <input type="date" value={createForm.billing_period_start}
                  onChange={e => setCreateForm(f => ({ ...f, billing_period_start: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>End Date</label>
                <input type="date" value={createForm.billing_period_end}
                  onChange={e => setCreateForm(f => ({ ...f, billing_period_end: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Amount (USD)</label>
              <input type="number" step="0.01" value={createForm.amount}
                onChange={e => setCreateForm(f => ({ ...f, amount: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Plan (optional)</label>
              <input type="text" placeholder="e.g., trial, basic, pro, enterprise" value={createForm.plan}
                onChange={e => setCreateForm(f => ({ ...f, plan: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Base Price</label>
                <input type="number" step="0.01" value={createForm.base_price}
                  onChange={e => setCreateForm(f => ({ ...f, base_price: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Additional Charges</label>
                <input type="number" step="0.01" value={createForm.additional_charges}
                  onChange={e => setCreateForm(f => ({ ...f, additional_charges: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Discount</label>
              <input type="number" step="0.01" value={createForm.discount}
                onChange={e => setCreateForm(f => ({ ...f, discount: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Notes (optional)</label>
              <textarea value={createForm.notes}
                onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', minHeight: 80 }}
              />
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
                  background: '#4338CA', color: '#fff', cursor: creating ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600, opacity: creating ? 0.6 : 1,
                }}>
                Create Invoice
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit Invoice Modal ─────────────────────────────────────────── */}
      {editInvoice && (
        <Modal title={`Edit Invoice ${editInvoice.invoice_number}`} onClose={() => setEditInvoice(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Status</label>
              <select value={editForm.status || ''}
                onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none' }}>
                <option value="draft">Draft</option>
                <option value="issued">Issued</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Paid Date (if paid)</label>
              <input type="date" value={editForm.paid_at || ''}
                onChange={e => setEditForm(f => ({ ...f, paid_at: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Additional Charges</label>
                <input type="number" step="0.01" value={editForm.additional_charges || 0}
                  onChange={e => setEditForm(f => ({ ...f, additional_charges: parseFloat(e.target.value) }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Discount</label>
                <input type="number" step="0.01" value={editForm.discount || 0}
                  onChange={e => setEditForm(f => ({ ...f, discount: parseFloat(e.target.value) }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Notes</label>
              <textarea value={editForm.notes || ''}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', minHeight: 80 }}
              />
            </div>

            {editError && <div style={{ color: '#EF4444', fontSize: 12 }}>{editError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button onClick={() => setEditInvoice(null)}
                style={{ padding: '9px 20px', border: '1px solid #E5E7EB', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={saving}
                style={{
                  padding: '9px 20px', border: 'none', borderRadius: 8,
                  background: '#4338CA', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600, opacity: saving ? 0.6 : 1,
                }}>
                Save Changes
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
