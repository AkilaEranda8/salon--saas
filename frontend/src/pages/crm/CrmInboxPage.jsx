import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';

const STATUS_LABEL = {
  ai_active: 'AI',
  queued: 'Queued',
  human_active: 'Human',
  ai_resume: 'AI resume',
  closed: 'Closed',
};

export default function CrmInboxPage() {
  const { C } = usePageTheme();
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [simPhone, setSimPhone] = useState('');
  const [simMsg, setSimMsg] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const params = { limit: 50 };
      if (statusFilter) params.status = statusFilter;
      if (unreadOnly) params.unread = '1';
      const { data } = await api.get('/crm/conversations', { params });
      setList(data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load inbox');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, unreadOnly]);

  const loadDetail = useCallback(async (id) => {
    if (!id) { setDetail(null); return; }
    try {
      const { data } = await api.get(`/crm/conversations/${id}`);
      setDetail(data);
      setList((prev) => prev.map((c) => (c.id === id ? { ...c, unread: false } : c)));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load thread');
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);

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

  const conv = detail?.conversation;
  const messages = detail?.messages || [];
  const unreadCount = list.filter((c) => c.unread).length;

  return (
    <PageWrapper
      title="CRM Inbox"
      subtitle="WhatsApp AI conversations — claim for human handoff, release back to AI."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 16, minHeight: 520 }}>
        {/* List */}
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ flex: 1, minWidth: 100, borderRadius: 8, border: `1px solid ${C.inputBdr}`, background: C.inputBg, color: C.text, padding: '6px 8px' }}
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
            <button type="button" onClick={loadList} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: C.text, padding: '6px 10px', cursor: 'pointer' }}>
              Refresh
            </button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && <div style={{ padding: 16, color: C.muted }}>Loading…</div>}
            {!loading && !list.length && <div style={{ padding: 16, color: C.muted }}>No conversations yet.</div>}
            {list.map((c) => (
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
                  <div style={{ fontWeight: c.unread ? 800 : 700, fontSize: 13, flex: 1 }}>{c.phone}</div>
                  {c.unread ? (
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: C.primary || '#2563EB', flexShrink: 0,
                    }}
                    />
                  ) : null}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {STATUS_LABEL[c.status] || c.status}
                  {c.lead?.stage ? ` · ${c.lead.stage}` : ''}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Thread */}
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, display: 'flex', flexDirection: 'column', minHeight: 520 }}>
          {!selectedId ? (
            <div style={{ padding: 24, color: C.muted }}>Select a conversation</div>
          ) : (
            <>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{conv?.phone}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>
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
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.direction === 'inbound' ? 'flex-start' : 'flex-end',
                      maxWidth: '75%',
                      padding: '10px 12px',
                      borderRadius: 12,
                      background: m.direction === 'inbound' ? (C.inputBg || '#f1f5f9') : (C.primary || '#2563EB'),
                      color: m.direction === 'inbound' ? C.text : '#fff',
                      fontSize: 13.5,
                    }}
                  >
                    <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 4 }}>{m.sender_type}</div>
                    {m.body}
                  </div>
                ))}
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
      </div>

      {/* Dev simulate */}
      <div style={{ marginTop: 18, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Simulate inbound (until WhatsApp Cloud webhook)</div>
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
    </PageWrapper>
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
