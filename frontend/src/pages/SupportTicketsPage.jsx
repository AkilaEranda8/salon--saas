import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useTheme } from '../context/ThemeContext';

const STATUS_LIST = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
const PRIORITY_LIST = ['low', 'medium', 'high', 'urgent'];

const STATUS_COLORS = {
  open: { bg: '#DBEAFE', text: '#1E40AF' },
  in_progress: { bg: '#FEF3C7', text: '#92400E' },
  waiting_customer: { bg: '#FDE68A', text: '#92400E' },
  resolved: { bg: '#D1FAE5', text: '#065F46' },
  closed: { bg: '#E5E7EB', text: '#374151' },
};

const PRIORITY_COLORS = {
  low: { bg: '#E5E7EB', text: '#374151' },
  medium: { bg: '#DBEAFE', text: '#1E40AF' },
  high: { bg: '#FDE68A', text: '#92400E' },
  urgent: { bg: '#FECACA', text: '#991B1B' },
};

function Surface({ title, subtitle, children, dark = false, rightAction = null }) {
  return (
    <section
      style={{
        borderRadius: 18,
        border: `1px solid ${dark ? '#334155' : '#E5E7EB'}`,
        background: dark ? '#111827' : '#FFFFFF',
        boxShadow: dark ? '0 12px 26px rgba(2,6,23,0.34)' : '0 12px 24px rgba(15,23,42,0.07)',
        padding: '16px 16px 14px',
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

function Pill({ value, palette }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: '4px 9px',
        background: palette?.bg || '#E5E7EB',
        color: palette?.text || '#374151',
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'capitalize',
      }}
    >
      {String(value || '').replace('_', ' ')}
    </span>
  );
}

export default function SupportTicketsPage({ platformMode = false }) {
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [notice, setNotice] = useState({ type: '', text: '' });

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [tenantFilter, setTenantFilter] = useState('all');

  const [newTicket, setNewTicket] = useState({
    subject: '',
    message: '',
    priority: 'medium',
    tenant_id: '',
  });
  const [expandedTicketId, setExpandedTicketId] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyInternal, setReplyInternal] = useState({});
  const [replyBusyId, setReplyBusyId] = useState(null);

  const loadData = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setNotice({ type: '', text: '' });

    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;
      if (query.trim()) params.q = query.trim();
      if (platformMode && tenantFilter !== 'all') params.tenant_id = tenantFilter;

      const requests = [api.get('/support', { params })];
      if (platformMode) {
        requests.push(api.get('/platform/tenants?limit=500'));
      }

      const [ticketRes, tenantRes] = await Promise.all(requests);
      setTickets(Array.isArray(ticketRes.data) ? ticketRes.data : []);

      if (platformMode) {
        const payload = tenantRes?.data;
        const tenantRows = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.tenants)
            ? payload.tenants
            : Array.isArray(payload?.data)
              ? payload.data
              : [];
        setTenants(tenantRows);
      }
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'Failed to load support tickets.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  const summary = useMemo(() => {
    const out = { total: tickets.length, open: 0, in_progress: 0, urgent: 0 };
    for (const t of tickets) {
      if (t.status === 'open') out.open += 1;
      if (t.status === 'in_progress') out.in_progress += 1;
      if (t.priority === 'urgent') out.urgent += 1;
    }
    return out;
  }, [tickets]);

  const refreshWithCurrentFilters = () => loadData(true);

  const createTicket = async () => {
    setNotice({ type: '', text: '' });
    if (!newTicket.subject.trim()) {
      setNotice({ type: 'error', text: 'Subject is required.' });
      return;
    }

    if (platformMode && !newTicket.tenant_id) {
      setNotice({ type: 'error', text: 'Please select a tenant.' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        subject: newTicket.subject.trim(),
        message: newTicket.message.trim(),
        priority: newTicket.priority,
      };
      if (platformMode && newTicket.tenant_id) {
        payload.tenant_id = Number(newTicket.tenant_id);
      }

      await api.post('/support', payload);
      setNewTicket({ subject: '', message: '', priority: 'medium', tenant_id: '' });
      setNotice({ type: 'success', text: 'Support ticket created.' });
      await refreshWithCurrentFilters();
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'Failed to create ticket.' });
    } finally {
      setSaving(false);
    }
  };

  const updateTicket = async (ticket, patch) => {
    try {
      await api.patch(`/support/${ticket.id}`, patch);
      setNotice({ type: 'success', text: `Updated ticket #${ticket.id}.` });
      await refreshWithCurrentFilters();
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'Failed to update ticket.' });
    }
  };

  const sendReply = async (ticket) => {
    const raw = replyDrafts[ticket.id] || '';
    const msg = raw.trim();
    if (!msg) {
      setNotice({ type: 'error', text: 'Reply message is required.' });
      return;
    }

    setReplyBusyId(ticket.id);
    try {
      await api.post(`/support/${ticket.id}/replies`, { message: msg });
      setReplyDrafts((prev) => ({ ...prev, [ticket.id]: '' }));
      setReplyInternal((prev) => ({ ...prev, [ticket.id]: false }));
      setNotice({ type: 'success', text: `Reply sent for ticket #${ticket.id}.` });
      await refreshWithCurrentFilters();
      setExpandedTicketId(ticket.id);
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'Failed to send reply.' });
    } finally {
      setReplyBusyId(null);
    }
  };

  const removeTicket = async (ticket) => {
    if (!platformMode) return;
    if (!window.confirm(`Delete ticket #${ticket.id}?`)) return;
    try {
      await api.delete(`/support/${ticket.id}`);
      setNotice({ type: 'success', text: `Deleted ticket #${ticket.id}.` });
      await refreshWithCurrentFilters();
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'Failed to delete ticket.' });
    }
  };

  const sendPlatformReply = async (ticket) => {
    const raw = replyDrafts[ticket.id] || '';
    const msg = raw.trim();
    if (!msg) {
      setNotice({ type: 'error', text: 'Reply message is required.' });
      return;
    }

    setReplyBusyId(ticket.id);
    try {
      await api.post(`/support/${ticket.id}/replies`, {
        message: msg,
        is_internal: !!replyInternal[ticket.id],
      });
      setReplyDrafts((prev) => ({ ...prev, [ticket.id]: '' }));
      setReplyInternal((prev) => ({ ...prev, [ticket.id]: false }));
      setNotice({ type: 'success', text: `Response sent for ticket #${ticket.id}.` });
      await refreshWithCurrentFilters();
      setExpandedTicketId(ticket.id);
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'Failed to send response.' });
    } finally {
      setReplyBusyId(null);
    }
  };

  const pageBg = isDark
    ? 'radial-gradient(circle at top left, rgba(20,184,166,0.15), transparent 35%), linear-gradient(180deg,#0F172A 0%, #0B1220 100%)'
    : 'radial-gradient(circle at top left, rgba(20,184,166,0.1), transparent 35%), linear-gradient(180deg,#F6FFFE 0%, #F4F7FA 100%)';

  return (
    <div style={{ width: '100%', minHeight: '100%', padding: '28px clamp(16px,2.4vw,34px) 44px', boxSizing: 'border-box', background: pageBg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1, color: isDark ? '#5EEAD4' : '#0F766E' }}>
            {platformMode ? 'Platform Operations' : 'Tenant Operations'}
          </div>
          <h1 style={{ margin: '8px 0 6px', fontSize: 34, lineHeight: 1.05, fontWeight: 900, color: isDark ? '#F8FAFC' : '#0F2A34' }}>
            Support Tickets
          </h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: isDark ? '#94A3B8' : '#5B6B70' }}>
            {platformMode
              ? 'Track and manage support backlog across all tenant salons.'
              : 'Send tickets to support team and reply to existing tickets in one place.'}
          </p>
        </div>

        <button
          type="button"
          onClick={refreshWithCurrentFilters}
          disabled={refreshing || loading || saving}
          style={{
            border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
            background: isDark ? '#0B1220' : '#fff',
            color: isDark ? '#E2E8F0' : '#1F2937',
            borderRadius: 12,
            padding: '10px 13px',
            fontSize: 13,
            fontWeight: 700,
            cursor: refreshing || loading || saving ? 'not-allowed' : 'pointer',
          }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Metric label="Total" value={summary.total} hint="all tickets" dark={isDark} accent="#2563EB" />
        <Metric label="Open" value={summary.open} hint="awaiting action" dark={isDark} accent="#0EA5E9" />
        <Metric label="In Progress" value={summary.in_progress} hint="active handling" dark={isDark} accent="#F59E0B" />
        <Metric label="Urgent" value={summary.urgent} hint="priority urgent" dark={isDark} accent="#DC2626" />
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

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14, marginBottom: 14 }}>
        <Surface dark={isDark} title="Ticket Backlog" subtitle="Filter and update support ticket statuses quickly.">
          <div style={{ display: 'grid', gridTemplateColumns: platformMode ? '1fr 170px 170px 220px' : '1fr 170px 170px', gap: 10, marginBottom: 12 }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search subject/message"
              style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`, background: isDark ? '#0B1220' : '#fff', color: isDark ? '#E2E8F0' : '#111827', padding: '10px 11px', fontSize: 13 }}
            />

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`, background: isDark ? '#0B1220' : '#fff', color: isDark ? '#E2E8F0' : '#111827', padding: '10px 11px', fontSize: 13 }}>
              <option value="all">All status</option>
              {STATUS_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`, background: isDark ? '#0B1220' : '#fff', color: isDark ? '#E2E8F0' : '#111827', padding: '10px 11px', fontSize: 13 }}>
              <option value="all">All priority</option>
              {PRIORITY_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>

            {platformMode && (
              <select value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`, background: isDark ? '#0B1220' : '#fff', color: isDark ? '#E2E8F0' : '#111827', padding: '10px 11px', fontSize: 13 }}>
                <option value="all">All tenants</option>
                {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} ({tenant.slug})</option>)}
              </select>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              onClick={refreshWithCurrentFilters}
              style={{ border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`, background: isDark ? '#0B1220' : '#fff', color: isDark ? '#E2E8F0' : '#344054', borderRadius: 10, padding: '8px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Apply Filters
            </button>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setStatusFilter('all');
                setPriorityFilter('all');
                setTenantFilter('all');
                setTimeout(() => loadData(true), 0);
              }}
              style={{ border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`, background: 'transparent', color: isDark ? '#E2E8F0' : '#344054', borderRadius: 10, padding: '8px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Reset
            </button>
          </div>

          <div style={{ maxHeight: 420, overflow: 'auto', borderRadius: 12, border: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: platformMode ? 880 : 700 }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: isDark ? '#0B1220' : '#F8FAFC', zIndex: 1 }}>
                  <th style={{ textAlign: 'left', padding: '10px 11px', color: isDark ? '#94A3B8' : '#6B7280' }}>Subject</th>
                  {platformMode && <th style={{ textAlign: 'left', padding: '10px 11px', color: isDark ? '#94A3B8' : '#6B7280' }}>Tenant</th>}
                  <th style={{ textAlign: 'left', padding: '10px 11px', color: isDark ? '#94A3B8' : '#6B7280' }}>Priority</th>
                  <th style={{ textAlign: 'left', padding: '10px 11px', color: isDark ? '#94A3B8' : '#6B7280' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '10px 11px', color: isDark ? '#94A3B8' : '#6B7280' }}>Updated</th>
                  <th style={{ textAlign: 'left', padding: '10px 11px', color: isDark ? '#94A3B8' : '#6B7280' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={platformMode ? 6 : 5} style={{ padding: '14px 11px', color: isDark ? '#94A3B8' : '#6B7280' }}>Loading tickets...</td></tr>
                ) : tickets.length === 0 ? (
                  <tr><td colSpan={platformMode ? 6 : 5} style={{ padding: '14px 11px', color: isDark ? '#94A3B8' : '#6B7280' }}>No tickets found.</td></tr>
                ) : tickets.map((t) => {
                  const expanded = expandedTicketId === t.id;
                  const replies = Array.isArray(t.replies) ? [...t.replies].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) : [];

                  return (
                    <React.Fragment key={t.id}>
                      <tr style={{ borderTop: `1px solid ${isDark ? '#1E293B' : '#F1F5F9'}` }}>
                        <td style={{ padding: '10px 11px' }}>
                          <div style={{ color: isDark ? '#E2E8F0' : '#0F172A', fontWeight: 700 }}>{t.subject || `Ticket #${t.id}`}</div>
                          <div style={{ marginTop: 4, color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, maxWidth: 330, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description || 'No description'}</div>
                          {t.ticket_no && <div style={{ marginTop: 3, color: isDark ? '#64748B' : '#94A3B8', fontSize: 11, fontFamily: 'monospace' }}>{t.ticket_no}</div>}
                        </td>
                        {platformMode && (
                          <td style={{ padding: '10px 11px', color: isDark ? '#CBD5E1' : '#334155' }}>
                            {t.tenant?.name ? `${t.tenant.name} (${t.tenant.slug})` : (t.tenant_id ? `Tenant #${t.tenant_id}` : 'N/A')}
                          </td>
                        )}
                        <td style={{ padding: '10px 11px' }}><Pill value={t.priority} palette={PRIORITY_COLORS[t.priority]} /></td>
                        <td style={{ padding: '10px 11px' }}><Pill value={t.status} palette={STATUS_COLORS[t.status]} /></td>
                        <td style={{ padding: '10px 11px', color: isDark ? '#CBD5E1' : '#334155' }}>{t.updatedAt ? new Date(t.updatedAt).toLocaleString() : '-'}</td>
                        <td style={{ padding: '10px 11px' }}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => setExpandedTicketId(expanded ? null : t.id)} style={{ border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`, background: isDark ? '#0B1220' : '#fff', color: isDark ? '#E2E8F0' : '#344054', borderRadius: 8, padding: '6px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{expanded ? 'Hide Thread' : `View Thread (${replies.length})`}</button>
                            {platformMode && t.status !== 'in_progress' && (
                              <button type="button" onClick={() => updateTicket(t, { status: 'in_progress' })} style={{ border: '1px solid #FDE68A', background: '#FFFBEB', color: '#92400E', borderRadius: 8, padding: '6px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>In Progress</button>
                            )}
                            {platformMode && t.status !== 'resolved' && (
                              <button type="button" onClick={() => updateTicket(t, { status: 'resolved' })} style={{ border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#166534', borderRadius: 8, padding: '6px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Resolve</button>
                            )}
                            {platformMode && t.status !== 'waiting_customer' && t.status !== 'closed' && (
                              <button type="button" onClick={() => updateTicket(t, { status: 'waiting_customer' })} style={{ border: '1px solid #FDE68A', background: '#FFFBEB', color: '#92400E', borderRadius: 8, padding: '6px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Waiting Customer</button>
                            )}
                            {platformMode && t.status !== 'closed' && (
                              <button type="button" onClick={() => updateTicket(t, { status: 'closed' })} style={{ border: '1px solid #E5E7EB', background: '#F8FAFC', color: '#374151', borderRadius: 8, padding: '6px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Close</button>
                            )}
                            {platformMode && (
                              <button type="button" onClick={() => removeTicket(t)} style={{ border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', borderRadius: 8, padding: '6px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {expanded && (
                        <tr>
                          <td colSpan={platformMode ? 6 : 5} style={{ padding: '10px 11px 14px' }}>
                            <div style={{ border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, borderRadius: 10, background: isDark ? '#0B1220' : '#FAFBFF', padding: 10 }}>
                              <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 800, color: isDark ? '#94A3B8' : '#64748B' }}>Conversation</div>
                              <div style={{ display: 'grid', gap: 8, marginBottom: 10, maxHeight: 240, overflow: 'auto' }}>
                                <div style={{ borderRadius: 8, border: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}`, background: isDark ? '#111827' : '#FFFFFF', padding: '8px 9px' }}>
                                  <div style={{ fontSize: 11, fontWeight: 800, color: isDark ? '#CBD5E1' : '#334155' }}>Initial Ticket</div>
                                  <div style={{ marginTop: 3, fontSize: 12, color: isDark ? '#E2E8F0' : '#111827' }}>{t.description || '-'}</div>
                                </div>

                                {replies.length === 0 ? (
                                  <div style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B' }}>No replies yet.</div>
                                ) : replies.map((r) => (
                                  <div key={r.id} style={{ borderRadius: 8, border: `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}`, background: isDark ? '#111827' : '#FFFFFF', padding: '8px 9px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                      <div style={{ fontSize: 11, fontWeight: 800, color: isDark ? '#CBD5E1' : '#334155' }}>{r.author?.name || r.author?.username || `User #${r.user_id}`}</div>
                                      <div style={{ fontSize: 10, color: isDark ? '#94A3B8' : '#64748B' }}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '-'}</div>
                                    </div>
                                    {r.is_internal && (
                                      <div style={{ marginTop: 4 }}>
                                        <Pill value="internal" palette={{ bg: '#F3E8FF', text: '#7C3AED' }} />
                                      </div>
                                    )}
                                    <div style={{ marginTop: 4, fontSize: 12, color: isDark ? '#E2E8F0' : '#111827', whiteSpace: 'pre-wrap' }}>{r.message}</div>
                                  </div>
                                ))}
                              </div>

                              <div style={{ display: 'grid', gap: 8 }}>
                                <textarea
                                  rows={3}
                                  value={replyDrafts[t.id] || ''}
                                  onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                  placeholder="Write your reply..."
                                  style={{ width: '100%', boxSizing: 'border-box', borderRadius: 8, border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`, background: isDark ? '#0B1220' : '#fff', color: isDark ? '#E2E8F0' : '#111827', padding: '8px 9px', fontSize: 12, resize: 'vertical' }}
                                />
                                {platformMode && (
                                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: isDark ? '#CBD5E1' : '#334155', fontWeight: 600 }}>
                                    <input
                                      type="checkbox"
                                      checked={!!replyInternal[t.id]}
                                      onChange={(e) => setReplyInternal((prev) => ({ ...prev, [t.id]: e.target.checked }))}
                                    />
                                    Send as internal note
                                  </label>
                                )}
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => (platformMode ? sendPlatformReply(t) : sendReply(t))}
                                    disabled={replyBusyId === t.id}
                                    style={{ border: 'none', borderRadius: 8, background: '#2563EB', color: '#fff', padding: '7px 11px', fontSize: 12, fontWeight: 700, cursor: replyBusyId === t.id ? 'not-allowed' : 'pointer', opacity: replyBusyId === t.id ? 0.75 : 1 }}
                                  >
                                    {replyBusyId === t.id ? 'Sending...' : 'Send Reply'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>

        {!platformMode && (
        <Surface dark={isDark} title="New Ticket" subtitle="Raise a request for support team.">
          <div style={{ display: 'grid', gap: 10 }}>
            <label>
              <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 6 }}>Subject</div>
              <input
                value={newTicket.subject}
                onChange={(e) => setNewTicket((p) => ({ ...p, subject: e.target.value }))}
                placeholder="Short summary of the issue"
                style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`, background: isDark ? '#0B1220' : '#fff', color: isDark ? '#E2E8F0' : '#111827', padding: '10px 11px', fontSize: 13 }}
              />
            </label>

            <label>
              <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 6 }}>Priority</div>
              <select
                value={newTicket.priority}
                onChange={(e) => setNewTicket((p) => ({ ...p, priority: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`, background: isDark ? '#0B1220' : '#fff', color: isDark ? '#E2E8F0' : '#111827', padding: '10px 11px', fontSize: 13 }}
              >
                {PRIORITY_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>

            <label>
              <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 6 }}>Message</div>
              <textarea
                rows={5}
                value={newTicket.message}
                onChange={(e) => setNewTicket((p) => ({ ...p, message: e.target.value }))}
                placeholder="Describe the issue, expected behavior, and impact."
                style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`, background: isDark ? '#0B1220' : '#fff', color: isDark ? '#E2E8F0' : '#111827', padding: '10px 11px', fontSize: 13, resize: 'vertical' }}
              />
            </label>

            <button
              type="button"
              onClick={createTicket}
              disabled={saving || loading}
              style={{ border: 'none', borderRadius: 10, background: '#2563EB', color: '#fff', padding: '10px 13px', fontSize: 13, fontWeight: 700, cursor: saving || loading ? 'not-allowed' : 'pointer', opacity: saving || loading ? 0.75 : 1 }}
            >
              {saving ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </Surface>
        )}

        {platformMode && (
          <Surface dark={isDark} title="Platform Desk" subtitle="Use this queue to respond, mark status, and close tickets for tenants.">
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ borderRadius: 10, border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, background: isDark ? '#0B1220' : '#fff', padding: '10px 11px', fontSize: 12, color: isDark ? '#CBD5E1' : '#334155' }}>
                1. Open a ticket thread from backlog.
              </div>
              <div style={{ borderRadius: 10, border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, background: isDark ? '#0B1220' : '#fff', padding: '10px 11px', fontSize: 12, color: isDark ? '#CBD5E1' : '#334155' }}>
                2. Reply to tenant or send an internal note.
              </div>
              <div style={{ borderRadius: 10, border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, background: isDark ? '#0B1220' : '#fff', padding: '10px 11px', fontSize: 12, color: isDark ? '#CBD5E1' : '#334155' }}>
                3. Update status: In Progress / Waiting Customer / Resolved / Closed.
              </div>
            </div>
          </Surface>
        )}
      </div>
    </div>
  );
}
