import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';

const STAGES = [
  'new',
  'conversation',
  'qualified',
  'interested',
  'booking_requested',
  'booking_confirmed',
  'converted',
  'lost',
];

const STAGE_LABEL = {
  new: 'New',
  conversation: 'Conversation',
  qualified: 'Qualified',
  interested: 'Interested',
  booking_requested: 'Booking requested',
  booking_confirmed: 'Booking confirmed',
  converted: 'Converted',
  lost: 'Lost',
};

const FOLLOW_UP = ['none', 'pending', 'done', 'snoozed'];

function formatWhen(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return '—';
  }
}

function stageTone(stage, C) {
  if (stage === 'converted' || stage === 'booking_confirmed') return { bg: `${C.accent}18`, color: C.accent };
  if (stage === 'lost') return { bg: '#EF444418', color: '#EF4444' };
  if (stage === 'new') return { bg: '#3B82F618', color: '#3B82F6' };
  return { bg: C.hover || `${C.border}`, color: C.textSub || C.muted };
}

export default function CrmLeadsPage() {
  const { C } = usePageTheme();
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [stage, setStage] = useState('');
  const [page, setPage] = useState(1);
  const [savingId, setSavingId] = useState(null);
  const [edit, setEdit] = useState(null);
  const limit = 40;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (stage) params.stage = stage;
      if (q.trim()) params.q = q.trim();
      const { data } = await api.get('/crm/leads', { params });
      setLeads(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [page, stage, q]);

  useEffect(() => { load(); }, [load]);

  const runSearch = () => {
    const next = qDraft.trim();
    if (next === q && page === 1) {
      load();
      return;
    }
    setPage(1);
    setQ(next);
  };

  const openEdit = (lead) => {
    setEdit({
      id: lead.id,
      name: lead.name || '',
      stage: lead.stage || 'new',
      follow_up_status: lead.follow_up_status || 'none',
      campaign_source: lead.campaign_source || '',
    });
  };

  const saveEdit = async () => {
    if (!edit) return;
    setSavingId(edit.id);
    try {
      const { data } = await api.patch(`/crm/leads/${edit.id}`, {
        name: edit.name.trim() || null,
        stage: edit.stage,
        follow_up_status: edit.follow_up_status,
        campaign_source: edit.campaign_source.trim() || null,
      });
      setLeads((prev) => prev.map((l) => (l.id === data.id ? { ...l, ...data } : l)));
      setEdit(null);
      toast.success('Lead updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setSavingId(null);
    }
  };

  const quickStage = async (lead, nextStage) => {
    if (lead.stage === nextStage) return;
    setSavingId(lead.id);
    try {
      const { data } = await api.patch(`/crm/leads/${lead.id}`, { stage: nextStage });
      setLeads((prev) => prev.map((l) => (l.id === data.id ? { ...l, ...data } : l)));
      toast.success(`Stage → ${STAGE_LABEL[nextStage] || nextStage}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Stage update failed');
    } finally {
      setSavingId(null);
    }
  };

  const deleteLead = async (lead) => {
    const label = lead.name || lead.phone || `#${lead.id}`;
    if (!window.confirm(`Delete lead “${label}”?\n\nRelated CRM chats for this lead will also be removed. Salon customer record (if any) is kept.`)) {
      return;
    }
    setSavingId(lead.id);
    try {
      await api.delete(`/crm/leads/${lead.id}`);
      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
      setTotal((t) => Math.max(0, t - 1));
      if (edit?.id === lead.id) setEdit(null);
      toast.success('Lead deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setSavingId(null);
    }
  };

  const pages = Math.max(1, Math.ceil(total / limit));
  const inputStyle = {
    background: C.inputBg || C.cardBg,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: '9px 12px',
    color: C.text,
    fontSize: 14,
    outline: 'none',
  };

  return (
    <PageWrapper
      title="CRM Leads"
      subtitle="WhatsApp contacts saved as leads — filter by stage, update pipeline, open inbox."
    >
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, alignItems: 'center',
      }}>
        <input
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
          placeholder="Search phone or name…"
          style={{ ...inputStyle, minWidth: 220, flex: '1 1 220px' }}
        />
        <select
          value={stage}
          onChange={(e) => { setPage(1); setStage(e.target.value); }}
          style={{ ...inputStyle, minWidth: 180 }}
        >
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>{STAGE_LABEL[s]}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={runSearch}
          style={{
            ...inputStyle, cursor: 'pointer', fontWeight: 600, background: C.accent, color: '#fff', border: 'none',
          }}
        >
          Search
        </button>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: C.muted || C.textMuted, fontWeight: 600 }}>
          {total} lead{total === 1 ? '' : 's'}
        </div>
      </div>

      <div style={{
        background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: `1px solid ${C.border}`, background: C.hover || 'transparent' }}>
                {['Contact', 'Stage', 'Customer', 'Source', 'Follow-up', 'Last message', ''].map((h) => (
                  <th key={h || 'a'} style={{
                    padding: '12px 14px', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
                    textTransform: 'uppercase', color: C.label || C.textMuted, whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} style={{ padding: 28, color: C.muted, textAlign: 'center' }}>Loading…</td>
                </tr>
              )}
              {!loading && leads.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 28, color: C.muted, textAlign: 'center' }}>
                    No leads yet. They appear when WhatsApp messages arrive.
                  </td>
                </tr>
              )}
              {!loading && leads.map((lead) => {
                const tone = stageTone(lead.stage, C);
                return (
                  <tr key={lead.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: C.text }}>{lead.name || 'Unknown'}</div>
                      <div style={{ fontSize: 12, color: C.muted || C.textMuted, marginTop: 2 }}>{lead.phone}</div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <select
                        value={lead.stage}
                        disabled={savingId === lead.id}
                        onChange={(e) => quickStage(lead, e.target.value)}
                        style={{
                          ...inputStyle,
                          padding: '6px 10px',
                          background: tone.bg,
                          color: tone.color,
                          fontWeight: 700,
                          border: 'none',
                          maxWidth: 180,
                        }}
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>{STAGE_LABEL[s]}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '12px 14px', color: C.textSub || C.text }}>
                      {lead.customer ? (
                        <span>
                          {lead.customer.name}
                          <span style={{ display: 'block', fontSize: 12, color: C.muted }}>#{lead.customer.id}</span>
                        </span>
                      ) : (
                        <span style={{ color: C.muted }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', color: C.textSub || C.text }}>
                      {lead.campaign_source || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', color: C.textSub || C.text, textTransform: 'capitalize' }}>
                      {lead.follow_up_status || 'none'}
                    </td>
                    <td style={{ padding: '12px 14px', color: C.muted || C.textMuted, whiteSpace: 'nowrap' }}>
                      {formatWhen(lead.last_message_at)}
                    </td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={() => openEdit(lead)}
                        style={{
                          background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
                          padding: '6px 10px', cursor: 'pointer', color: C.text, fontWeight: 600, marginRight: 6,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/crm/inbox')}
                        style={{
                          background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
                          padding: '6px 10px', cursor: 'pointer', color: C.accent, fontWeight: 600, marginRight: 6,
                        }}
                      >
                        Inbox
                      </button>
                      <button
                        type="button"
                        disabled={savingId === lead.id}
                        onClick={() => deleteLead(lead)}
                        style={{
                          background: 'none', border: '1px solid #EF4444', borderRadius: 8,
                          padding: '6px 10px', cursor: savingId === lead.id ? 'wait' : 'pointer',
                          color: '#EF4444', fontWeight: 600, opacity: savingId === lead.id ? 0.6 : 1,
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 14px', borderTop: `1px solid ${C.border}`,
          }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{ ...inputStyle, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
            >
              Previous
            </button>
            <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>Page {page} / {pages}</span>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              style={{ ...inputStyle, cursor: page >= pages ? 'not-allowed' : 'pointer', opacity: page >= pages ? 0.5 : 1 }}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {edit && (
        <div
          onClick={() => setEdit(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 80,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 440, background: C.cardBg, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: 20, boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 14 }}>Edit lead</div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.label || C.muted, marginBottom: 6 }}>
              Name
            </label>
            <input
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              style={{ ...inputStyle, width: '100%', marginBottom: 12, boxSizing: 'border-box' }}
            />
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.label || C.muted, marginBottom: 6 }}>
              Stage
            </label>
            <select
              value={edit.stage}
              onChange={(e) => setEdit({ ...edit, stage: e.target.value })}
              style={{ ...inputStyle, width: '100%', marginBottom: 12 }}
            >
              {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.label || C.muted, marginBottom: 6 }}>
              Follow-up
            </label>
            <select
              value={edit.follow_up_status}
              onChange={(e) => setEdit({ ...edit, follow_up_status: e.target.value })}
              style={{ ...inputStyle, width: '100%', marginBottom: 12 }}
            >
              {FOLLOW_UP.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.label || C.muted, marginBottom: 6 }}>
              Campaign source
            </label>
            <input
              value={edit.campaign_source}
              onChange={(e) => setEdit({ ...edit, campaign_source: e.target.value })}
              style={{ ...inputStyle, width: '100%', marginBottom: 18, boxSizing: 'border-box' }}
              placeholder="e.g. facebook ads"
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setEdit(null)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingId === edit.id}
                onClick={saveEdit}
                style={{
                  ...inputStyle, cursor: 'pointer', background: C.accent, color: '#fff',
                  border: 'none', fontWeight: 700, opacity: savingId === edit.id ? 0.7 : 1,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
