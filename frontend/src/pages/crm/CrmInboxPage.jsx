import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { getKcAccessToken } from '../../utils/kcTokenStore';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';

const STATUS_LABEL = {
  ai_active: 'AI',
  queued: 'Queued',
  human_active: 'Human',
  ai_resume: 'AI resume',
  closed: 'Closed',
};

const POLL_MS = 15000;

const DELIVERY = {
  pending: { glyph: '◷', label: 'Pending' },
  sent: { glyph: '✓', label: 'Sent' },
  delivered: { glyph: '✓✓', label: 'Delivered' },
  read: { glyph: '✓✓', label: 'Read' },
  failed: { glyph: '!', label: 'Failed' },
};

function fmtStamp(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

function pretty(v) {
  return v ? String(v).replace(/_/g, ' ') : '—';
}

function DeliveryTicks({ status }) {
  const meta = DELIVERY[status];
  if (!meta) return null;
  const failed = status === 'failed';
  const read = status === 'read';
  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      style={{
        marginLeft: 6,
        fontWeight: 700,
        letterSpacing: '-0.15em',
        color: failed ? '#FECACA' : read ? '#A7F3D0' : 'inherit',
        opacity: failed || read ? 1 : 0.75,
      }}
    >
      {meta.glyph}
      {failed ? <span style={{ marginLeft: 6, letterSpacing: 0, fontWeight: 600 }}>Failed</span> : null}
    </span>
  );
}

export default function CrmInboxPage() {
  const { C } = usePageTheme();
  const { tenant, user } = useAuth();
  const tenantId = tenant?.id ?? user?.tenant_id ?? user?.tenantId ?? null;

  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [simPhone, setSimPhone] = useState('');
  const [simMsg, setSimMsg] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [live, setLive] = useState(false);

  const threadRef = useRef(null);
  const nearBottomRef = useRef(true);
  const selectedIdRef = useRef(null);
  const liveRef = useRef(false);
  const listTimer = useRef(null);
  const detailTimer = useRef(null);

  const loadList = useCallback(async ({ silent = false } = {}) => {
    try {
      const params = { limit: 50 };
      if (statusFilter) params.status = statusFilter;
      if (unreadOnly) params.unread = '1';
      const { data } = await api.get('/crm/conversations', { params });
      setList(data.data || []);
    } catch (err) {
      if (!silent) toast.error(err.response?.data?.message || 'Failed to load inbox');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, unreadOnly]);

  const loadDetail = useCallback(async (id, { silent = false } = {}) => {
    if (!id) { setDetail(null); return; }
    try {
      const { data } = await api.get(`/crm/conversations/${id}`);
      if (selectedIdRef.current !== id) return;
      setDetail(data);
      setList((prev) => prev.map((c) => (c.id === id ? { ...c, unread: false } : c)));
    } catch (err) {
      if (!silent) toast.error(err.response?.data?.message || 'Failed to load thread');
    }
  }, []);

  // Latest loaders for socket / interval callbacks (avoid reconnecting on filter change)
  const loadListRef = useRef(loadList);
  const loadDetailRef = useRef(loadDetail);
  loadListRef.current = loadList;
  loadDetailRef.current = loadDetail;

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    nearBottomRef.current = true;
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  /* ── Real-time: Socket.io (crm:message / crm:conversation) ───────────── */
  useEffect(() => {
    const scheduleList = () => {
      clearTimeout(listTimer.current);
      listTimer.current = setTimeout(() => loadListRef.current({ silent: true }), 400);
    };
    const scheduleDetail = () => {
      clearTimeout(detailTimer.current);
      detailTimer.current = setTimeout(() => {
        const id = selectedIdRef.current;
        if (id && document.visibilityState === 'visible') loadDetailRef.current(id, { silent: true });
      }, 400);
    };
    const mergeMessage = (cid, msg) => {
      setDetail((prev) => {
        if (!prev || Number(prev.conversation?.id) !== cid) return prev;
        const msgs = prev.messages || [];
        const idx = msgs.findIndex((m) => m.id === msg.id);
        if (idx >= 0) {
          const next = msgs.slice();
          next[idx] = { ...msgs[idx], ...msg };
          return { ...prev, messages: next };
        }
        return { ...prev, messages: [...msgs, msg] };
      });
    };
    const patchDelivery = (messageId, status) => {
      setDetail((prev) => {
        if (!prev) return prev;
        if (!(prev.messages || []).some((m) => m.id === messageId)) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) => (m.id === messageId ? { ...m, delivery_status: status } : m)),
        };
      });
    };

    const token = getKcAccessToken()
      || document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('token='))?.split('=')[1];
    const socket = io({ auth: { token } });

    socket.on('connect', () => {
      liveRef.current = true;
      setLive(true);
      socket.emit('crm:join', tenantId ? { tenantId } : {});
    });
    socket.on('disconnect', () => { liveRef.current = false; setLive(false); });
    socket.on('connect_error', () => { liveRef.current = false; setLive(false); });

    socket.on('crm:message', (p = {}) => {
      const cid = Number(p.conversation_id);
      const open = cid && cid === Number(selectedIdRef.current);
      if (p.message) {
        if (open) mergeMessage(cid, p.message);
        if (open && p.message.direction === 'inbound') scheduleDetail(); // marks read
        scheduleList();
      } else if (p.message_id && p.delivery_status) {
        patchDelivery(p.message_id, p.delivery_status);
      }
    });
    socket.on('crm:conversation', (p = {}) => {
      const cid = Number(p.conversation_id);
      if (p.reason === 'deleted' && cid === Number(selectedIdRef.current)) {
        setSelectedId(null);
        setDetail(null);
      } else if (cid && cid === Number(selectedIdRef.current)) {
        scheduleDetail();
      }
      scheduleList();
    });

    return () => {
      clearTimeout(listTimer.current);
      clearTimeout(detailTimer.current);
      socket.disconnect();
    };
  }, [tenantId]);

  /* ── Fallback polling while tab is visible ───────────────────────────── */
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      loadListRef.current({ silent: true });
      if (!liveRef.current && selectedIdRef.current) {
        loadDetailRef.current(selectedIdRef.current, { silent: true });
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  /* ── Auto-scroll thread ──────────────────────────────────────────────── */
  const messages = detail?.messages || [];
  const lastMsgId = messages.length ? messages[messages.length - 1].id : null;
  useEffect(() => {
    const el = threadRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastMsgId, selectedId]);

  const onThreadScroll = (e) => {
    const el = e.currentTarget;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  /* ── Actions ─────────────────────────────────────────────────────────── */
  const claim = async () => {
    try {
      await api.post(`/crm/conversations/${selectedId}/claim`);
      toast.success('Claimed');
      loadList();
      loadDetail(selectedId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Claim failed');
    }
  };

  const release = async () => {
    try {
      await api.post(`/crm/conversations/${selectedId}/release`);
      toast.success('Released to AI');
      loadList();
      loadDetail(selectedId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Release failed');
    }
  };

  const closeConv = async () => {
    try {
      await api.post(`/crm/conversations/${selectedId}/close`, { reason: 'closed_by_agent' });
      toast.success('Conversation closed');
      loadList();
      loadDetail(selectedId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Close failed');
    }
  };

  const deleteConv = async () => {
    if (!selectedId) return;
    const phone = detail?.conversation?.phone || selectedId;
    if (!window.confirm(`Delete this chat (${phone})?\n\nAll messages in this thread will be removed. The lead record is kept.`)) {
      return;
    }
    try {
      await api.delete(`/crm/conversations/${selectedId}`);
      toast.success('Chat deleted');
      setSelectedId(null);
      setDetail(null);
      setReply('');
      loadList();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const markAllRead = async () => {
    try {
      const { data } = await api.post('/crm/conversations/mark-all-read');
      toast.success(`Marked ${data.affected ?? 0} read`);
      loadList();
      if (selectedId) loadDetail(selectedId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Mark all read failed');
    }
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    nearBottomRef.current = true;
    try {
      await api.post(`/crm/conversations/${selectedId}/agent-reply`, { message: reply.trim() });
      setReply('');
      toast.success('Reply queued');
      loadDetail(selectedId);
      loadList();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reply failed');
    }
  };

  const simulate = async (sync) => {
    if (!simPhone || !simMsg) {
      toast.error('Phone and message required');
      return;
    }
    try {
      const { data } = await api.post('/crm/dev/simulate-inbound', {
        phone: simPhone,
        message: simMsg,
        sync,
      });
      toast.success(sync ? 'AI replied (sync)' : `Queued job ${data.jobId || ''}`);
      setSimMsg('');
      await loadList();
      if (data.result?.conversationId) {
        setSelectedId(data.result.conversationId);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Simulate failed');
    }
  };

  /* ── Derived ─────────────────────────────────────────────────────────── */
  const conv = detail?.conversation;
  const lead = conv?.lead;
  const customer = detail?.customer;
  const appointments = detail?.recent_appointments || [];
  const unreadCount = list.filter((c) => c.unread).length;

  const visibleList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    const digits = q.replace(/\D/g, '');
    return list.filter((c) => {
      const name = String(c.lead?.name || '').toLowerCase();
      const phone = String(c.phone || '').replace(/\D/g, '');
      return name.includes(q) || (digits && phone.includes(digits));
    });
  }, [list, search]);

  const field = {
    borderRadius: 8, border: `1px solid ${C.inputBdr}`, background: C.inputBg, color: C.text, padding: '6px 8px',
  };

  return (
    <PageWrapper
      title="CRM Inbox"
      subtitle="WhatsApp AI conversations — claim for human handoff, release back to AI."
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: selectedId
          ? 'minmax(240px, 300px) minmax(0, 1fr) minmax(220px, 270px)'
          : 'minmax(260px, 320px) 1fr',
        gap: 16,
        minHeight: 520,
      }}
      >
        {/* List */}
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone"
              aria-label="Search conversations"
              style={{ ...field, flexBasis: '100%', padding: '8px 10px' }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ ...field, flex: 1, minWidth: 100 }}
            >
              <option value="">All statuses</option>
              {Object.keys(STATUS_LABEL).map((k) => (
                <option key={k} value={k}>{STATUS_LABEL[k]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setUnreadOnly((v) => !v)}
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                background: unreadOnly ? `${C.primary || '#2563EB'}22` : 'transparent',
                color: C.text,
                padding: '6px 10px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              Unread{unreadCount ? ` (${unreadCount})` : ''}
            </button>
            <button type="button" onClick={markAllRead} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: C.text, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>
              Mark all read
            </button>
            <button type="button" onClick={() => loadList()} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: C.text, padding: '6px 10px', cursor: 'pointer' }}>
              Refresh
            </button>
            <div style={{ flexBasis: '100%', fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: live ? '#10B981' : '#9CA3AF' }} />
              {live ? 'Live updates on' : 'Live updates off — refreshing every 15s'}
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && <div style={{ padding: 16, color: C.muted }}>Loading…</div>}
            {!loading && !list.length && <div style={{ padding: 16, color: C.muted }}>No conversations yet.</div>}
            {!loading && !!list.length && !visibleList.length && (
              <div style={{ padding: 16, color: C.muted }}>No matches for “{search}”.</div>
            )}
            {visibleList.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px',
                  border: 'none', borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                  background: selectedId === c.id ? (C.primary ? `${C.primary}18` : '#2563EB18') : 'transparent',
                  color: C.text,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight: c.unread ? 800 : 700, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.lead?.name || c.phone}
                  </div>
                  <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>{fmtStamp(c.updatedAt)}</span>
                  {c.unread ? (
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: C.primary || '#2563EB', flexShrink: 0,
                    }}
                    />
                  ) : null}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {c.lead?.name ? `${c.phone} · ` : ''}
                  {STATUS_LABEL[c.status] || c.status}
                  {c.lead?.stage ? ` · ${pretty(c.lead.stage)}` : ''}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Thread */}
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, display: 'flex', flexDirection: 'column', minHeight: 520, minWidth: 0 }}>
          {!selectedId ? (
            <div style={{ padding: 24, color: C.muted }}>Select a conversation</div>
          ) : (
            <>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{lead?.name || conv?.phone}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>
                    {lead?.name ? `${conv?.phone} · ` : ''}
                    {STATUS_LABEL[conv?.status] || conv?.status}
                    {conv?.handoff_reason ? ` · ${conv.handoff_reason}` : ''}
                  </div>
                </div>
                <button type="button" onClick={claim} style={btnStyle(C)}>Claim</button>
                <button type="button" onClick={release} style={btnStyle(C)}>Release to AI</button>
                <button type="button" onClick={closeConv} style={btnStyle(C)} disabled={conv?.status === 'closed'}>
                  Close
                </button>
                <button
                  type="button"
                  onClick={deleteConv}
                  style={{
                    ...btnStyle(C),
                    border: '1px solid #EF4444',
                    color: '#EF4444',
                    background: 'transparent',
                  }}
                >
                  Delete
                </button>
              </div>
              <div
                ref={threadRef}
                onScroll={onThreadScroll}
                style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 560 }}
              >
                {messages.map((m) => {
                  const outbound = m.direction !== 'inbound';
                  return (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: outbound ? 'flex-end' : 'flex-start',
                        maxWidth: '75%',
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: outbound ? (C.primary || '#2563EB') : (C.inputBg || '#f1f5f9'),
                        color: outbound ? '#fff' : C.text,
                        fontSize: 13.5,
                      }}
                    >
                      <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 4 }}>{m.sender_type}</div>
                      <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</div>
                      <div style={{ fontSize: 10, opacity: 0.8, marginTop: 4, textAlign: 'right' }}>
                        {fmtStamp(m.createdAt)}
                        {outbound ? <DeliveryTicks status={m.delivery_status} /> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={conv?.status === 'closed' ? 'Conversation closed' : 'Agent reply…'}
                  disabled={conv?.status === 'closed'}
                  style={{ flex: 1, borderRadius: 10, border: `1px solid ${C.inputBdr}`, background: C.inputBg, color: C.text, padding: '10px 12px' }}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendReply(); }}
                />
                <button
                  type="button"
                  onClick={sendReply}
                  disabled={conv?.status === 'closed'}
                  style={{ ...btnStyle(C), background: C.primary || '#2563EB', color: '#fff', border: 'none', opacity: conv?.status === 'closed' ? 0.5 : 1 }}
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>

        {/* Context panel */}
        {selectedId && (
          <aside style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, alignSelf: 'start', fontSize: 13, color: C.text }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Lead</div>
            <PanelRow C={C} label="Name" value={lead?.name || '—'} />
            <PanelRow C={C} label="Phone" value={conv?.phone || lead?.phone || '—'} />
            <PanelRow C={C} label="Stage" value={pretty(lead?.stage)} />
            <PanelRow C={C} label="Source" value={pretty(lead?.campaign_source || conv?.campaign_source)} />
            <PanelRow C={C} label="Status" value={STATUS_LABEL[conv?.status] || conv?.status || '—'} />

            <div style={{ fontWeight: 700, margin: '16px 0 8px', paddingTop: 14, borderTop: `1px solid ${C.border}` }}>Customer</div>
            {customer ? (
              <>
                <div style={{ fontWeight: 600 }}>{customer.name}</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{customer.phone}</div>
                <Link to="/customers" style={{ display: 'inline-block', marginTop: 8, color: C.primary || '#2563EB', fontWeight: 600, fontSize: 12 }}>
                  Open customers
                </Link>
              </>
            ) : (
              <div style={{ color: C.muted }}>Not linked to a salon customer yet.</div>
            )}

            {customer && (
              <>
                <div style={{ fontWeight: 700, margin: '16px 0 8px', paddingTop: 14, borderTop: `1px solid ${C.border}` }}>Recent appointments</div>
                {!appointments.length && <div style={{ color: C.muted }}>No appointments.</div>}
                {appointments.map((a) => (
                  <div key={a.id} style={{ padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontWeight: 600 }}>{a.service?.name || 'Appointment'}</div>
                    <div style={{ color: C.muted, fontSize: 12 }}>
                      {a.date} {a.time ? String(a.time).slice(0, 5) : ''} · {pretty(a.status)}
                    </div>
                  </div>
                ))}
                {!!appointments.length && (
                  <Link to="/appointments" style={{ display: 'inline-block', marginTop: 8, color: C.primary || '#2563EB', fontWeight: 600, fontSize: 12 }}>
                    View all appointments
                  </Link>
                )}
              </>
            )}
          </aside>
        )}
      </div>

      {/* Dev simulate — hidden in production builds */}
      {import.meta.env.DEV && (
        <div style={{ marginTop: 18, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Simulate inbound (dev only)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto auto', gap: 8 }}>
            <input
              value={simPhone}
              onChange={(e) => setSimPhone(e.target.value)}
              placeholder="Phone"
              style={{ borderRadius: 10, border: `1px solid ${C.inputBdr}`, background: C.inputBg, color: C.text, padding: '10px 12px' }}
            />
            <input
              value={simMsg}
              onChange={(e) => setSimMsg(e.target.value)}
              placeholder="Customer message"
              style={{ borderRadius: 10, border: `1px solid ${C.inputBdr}`, background: C.inputBg, color: C.text, padding: '10px 12px' }}
            />
            <button type="button" onClick={() => simulate(true)} style={btnStyle(C)}>Run sync</button>
            <button type="button" onClick={() => simulate(false)} style={btnStyle(C)}>Queue</button>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
            Sync calls ai_engine immediately (needs engine running + AI keys). Queue needs Redis + workers.
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

function PanelRow({ C, label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0' }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  );
}

function btnStyle(C) {
  return {
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.cardBg,
    color: C.text,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
  };
}
