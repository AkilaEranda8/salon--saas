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

  const loadList = useCallback(async () => {
    try {
      const params = { limit: 50 };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/crm/conversations', { params });
      setList(data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load inbox');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const loadDetail = useCallback(async (id) => {
    if (!id) { setDetail(null); return; }
    try {
      const { data } = await api.get(`/crm/conversations/${id}`);
      setDetail(data);
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

  return (
    <PageWrapper
      title="CRM Inbox"
      subtitle="WhatsApp AI conversations — claim for human handoff, release back to AI."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 16, minHeight: 520 }}>
        {/* List */}
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ flex: 1, borderRadius: 8, border: `1px solid ${C.inputBdr}`, background: C.inputBg, color: C.text, padding: '6px 8px' }}
            >
              <option value="">All statuses</option>
              {Object.keys(STATUS_LABEL).map((k) => (
                <option key={k} value={k}>{STATUS_LABEL[k]}</option>
              ))}
            </select>
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
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.phone}</div>
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
                  placeholder="Agent reply…"
                  style={{ flex: 1, borderRadius: 10, border: `1px solid ${C.inputBdr}`, background: C.inputBg, color: C.text, padding: '10px 12px' }}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendReply(); }}
                />
                <button type="button" onClick={sendReply} style={{ ...btnStyle(C), background: C.primary || '#2563EB', color: '#fff', border: 'none' }}>
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
