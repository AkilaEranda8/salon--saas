import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';
import { useBreakpoint } from '../../hooks/useBreakpoint';

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

const PIPELINE_COLUMNS = [
  'new',
  'conversation',
  'qualified',
  'interested',
  'booking_requested',
  'booking_confirmed',
];

function formatWhen(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return '—';
  }
}

function stageTone(stage, C) {
  if (stage === 'converted' || stage === 'booking_confirmed') return { bg: '#DCFCE7', color: '#166534' };
  if (stage === 'lost') return { bg: '#FEE2E2', color: '#991B1B' };
  if (stage === 'new') return { bg: '#DBEAFE', color: '#1D4ED8' };
  if (stage === 'booking_requested') return { bg: '#FEF3C7', color: '#92400E' };
  if (stage === 'interested' || stage === 'qualified') return { bg: '#E0E7FF', color: '#3730A3' };
  return { bg: C.hover || `${C.border}`, color: C.textSub || C.muted };
}

/**
 * Full advanced CRM Leads page (English).
 * Pipeline board + list, filters, bulk actions, manual add, inbox deep-link.
 */
export default function CrmLeadsPage() {
  const { C } = usePageTheme();
  const { isMobile } = useBreakpoint();
  const navigate = useNavigate();

  const [leads, setLeads] = useState([]);
  const [summary, setSummary] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [stage, setStage] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [optOut, setOptOut] = useState('');
  const [hasCustomer, setHasCustomer] = useState('');
  const [sort, setSort] = useState('recent');
  const [view, setView] = useState('list'); // list | pipeline
  const [page, setPage] = useState(1);
  const [savingId, setSavingId] = useState(null);
  const [edit, setEdit] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ phone: '', name: '', stage: 'new', campaign_source: 'manual' });
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const limit = view === 'pipeline' ? 200 : 40;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit, sort };
      if (stage) params.stage = stage;
      if (followUp) params.follow_up = followUp;
      if (optOut !== '') params.opt_out = optOut;
      if (hasCustomer !== '') params.has_customer = hasCustomer;
      if (q.trim()) params.q = q.trim();
      const { data } = await api.get('/crm/leads', { params });
      setLeads(data.data || []);
      setTotal(data.total || 0);
      setSummary(data.summary || null);
      setSelected(new Set());
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [page, stage, followUp, optOut, hasCustomer, q, sort, limit]);

  useEffect(() => { load(); }, [load]);

  const runSearch = () => {
    const next = qDraft.trim();
    setPage(1);
    setQ(next);
  };

  const openInbox = (lead) => {
    const convId = lead.conversation?.id;
    if (convId) {
      navigate(`/crm/inbox?conversation=${convId}`);
      return;
    }
    navigate(`/crm/inbox?phone=${encodeURIComponent(lead.phone || '')}`);
  };

  const openEdit = (lead) => {
    setEdit({
      id: lead.id,
      name: lead.name || '',
      stage: lead.stage || 'new',
      follow_up_status: lead.follow_up_status || 'none',
      campaign_source: lead.campaign_source || '',
      interest_tags: Array.isArray(lead.interest_tags) ? lead.interest_tags.join(', ') : '',
      marketing_opt_out: !!lead.marketing_opt_out,
      phone: lead.phone,
      conversation: lead.conversation,
      customer: lead.customer,
    });
  };

  const saveEdit = async () => {
    if (!edit) return;
    setSavingId(edit.id);
    try {
      const tags = edit.interest_tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const { data } = await api.patch(`/crm/leads/${edit.id}`, {
        name: edit.name.trim() || null,
        stage: edit.stage,
        follow_up_status: edit.follow_up_status,
        campaign_source: edit.campaign_source.trim() || null,
        interest_tags: tags.length ? tags : null,
        marketing_opt_out: !!edit.marketing_opt_out,
      });
      setLeads((prev) => prev.map((l) => (l.id === data.id ? { ...l, ...data } : l)));
      setEdit(null);
      toast.success('Lead updated');
      load();
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
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Stage update failed');
    } finally {
      setSavingId(null);
    }
  };

  const deleteLead = async (lead) => {
    const label = lead.name || lead.phone || `#${lead.id}`;
    if (!window.confirm(`Delete lead “${label}”? Related CRM chats will also be removed. Salon customer record is kept.`)) {
      return;
    }
    setSavingId(lead.id);
    try {
      await api.delete(`/crm/leads/${lead.id}`);
      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
      setTotal((t) => Math.max(0, t - 1));
      if (edit?.id === lead.id) setEdit(null);
      toast.success('Lead deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setSavingId(null);
    }
  };

  const createLead = async () => {
    if (!createForm.phone.trim()) {
      toast.error('Phone is required');
      return;
    }
    setBusy(true);
    try {
      await api.post('/crm/leads', {
        phone: createForm.phone,
        name: createForm.name.trim() || null,
        stage: createForm.stage,
        campaign_source: createForm.campaign_source.trim() || 'manual',
      });
      toast.success('Lead created');
      setCreateOpen(false);
      setCreateForm({ phone: '', name: '', stage: 'new', campaign_source: 'manual' });
      setPage(1);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(leads.map((l) => l.id)));
  const clearSelection = () => setSelected(new Set());

  const bulk = async (patch) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    try {
      const { data } = await api.post('/crm/leads/bulk', { ids, ...patch });
      toast.success(`Updated ${data.updated || ids.length} leads`);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk update failed');
    } finally {
      setBusy(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / limit));
  const byStage = summary?.byStage || {};

  const pipelineGroups = useMemo(() => {
    const map = {};
    for (const s of PIPELINE_COLUMNS) map[s] = [];
    for (const lead of leads) {
      if (map[lead.stage]) map[lead.stage].push(lead);
      else if (!['converted', 'lost'].includes(lead.stage)) {
        // show unknown open stages under conversation
        if (!map.conversation) map.conversation = [];
      }
    }
    return map;
  }, [leads]);

  const inputStyle = {
    background: C.inputBg || C.cardBg,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: '9px 12px',
    color: C.text,
    fontSize: 13.5,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <PageWrapper
      title="CRM Leads"
      subtitle="WhatsApp contacts in your sales pipeline — filter, update stages, follow up, and open Inbox."
      actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/crm/inbox" style={linkBtn(C)}>Inbox</Link>
          <Link to="/crm/whatsapp-cloud" style={linkBtn(C)}>WhatsApp</Link>
          <button type="button" onClick={() => setCreateOpen(true)} style={primaryBtn(C)}>Add lead</button>
          <button type="button" onClick={load} style={ghostBtn(C)}>Refresh</button>
        </div>
      )}
    >
      <div style={{ display: 'grid', gap: isMobile ? 14 : 18, width: '100%' }}>
        {/* Hero */}
        <section style={{
          borderRadius: 18, padding: isMobile ? 16 : 22,
          border: `1px solid ${C.border}`,
          background: C.isDark
            ? 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'
            : 'linear-gradient(135deg, #EFF6FF 0%, #F8FAFC 45%, #ECFDF5 100%)',
          boxShadow: C.shadow,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 16 }}>
            <div>
              <div style={kicker(C)}>Lead pipeline</div>
              <h2 style={{
                margin: '6px 0 0', fontSize: isMobile ? 22 : 26, fontWeight: 800,
                color: C.text, letterSpacing: '-0.02em',
              }}>
                Track every WhatsApp enquiry to booking
              </h2>
              <p style={{ margin: '10px 0 0', color: C.muted, fontSize: 14, lineHeight: 1.55, maxWidth: 620 }}>
                Leads are created automatically when customers message the linked salon WhatsApp.
                Move stages, set follow-ups, and jump straight into the conversation.
              </p>
            </div>
            <div style={{
              background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14,
              display: 'grid', gap: 8,
            }}>
              <Meter label="Total leads" value={summary?.total ?? total} C={C} />
              <Meter label="Open pipeline" value={summary?.openPipeline ?? '—'} ok C={C} />
              <Meter label="Follow-up pending" value={summary?.followUpPending ?? '—'} C={C} />
              <Meter label="Linked customers" value={summary?.linkedCustomers ?? '—'} C={C} />
              <Meter label="Marketing opt-out" value={summary?.optOut ?? '—'} C={C} />
            </div>
          </div>
        </section>

        {/* Stage chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Chip
            C={C}
            active={!stage}
            onClick={() => { setStage(''); setPage(1); }}
            label={`All · ${summary?.total ?? total}`}
          />
          {STAGES.map((s) => (
            <Chip
              key={s}
              C={C}
              active={stage === s}
              onClick={() => { setStage(s); setPage(1); }}
              label={`${STAGE_LABEL[s]} · ${byStage[s] || 0}`}
              tone={stageTone(s, C)}
            />
          ))}
        </div>

        {/* Filters */}
        <section style={shell(C)}>
          <div style={{
            padding: '12px 16px',
            display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
          }}>
            <input
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              placeholder="Search phone, name, or source…"
              style={{ ...inputStyle, minWidth: 200, flex: '1 1 200px' }}
            />
            <select value={followUp} onChange={(e) => { setPage(1); setFollowUp(e.target.value); }} style={{ ...inputStyle, minWidth: 140 }}>
              <option value="">All follow-ups</option>
              {FOLLOW_UP.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={optOut} onChange={(e) => { setPage(1); setOptOut(e.target.value); }} style={{ ...inputStyle, minWidth: 140 }}>
              <option value="">Opt-out: any</option>
              <option value="0">Not opted out</option>
              <option value="1">Opted out</option>
            </select>
            <select value={hasCustomer} onChange={(e) => { setPage(1); setHasCustomer(e.target.value); }} style={{ ...inputStyle, minWidth: 150 }}>
              <option value="">Customer link: any</option>
              <option value="1">Linked to customer</option>
              <option value="0">Not linked</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ ...inputStyle, minWidth: 130 }}>
              <option value="recent">Recent activity</option>
              <option value="oldest">Oldest activity</option>
              <option value="name">Name A–Z</option>
              <option value="stage">By stage</option>
            </select>
            <button type="button" onClick={runSearch} style={primaryBtn(C)}>Search</button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => { setView('list'); setPage(1); }} style={view === 'list' ? primaryBtn(C) : ghostBtn(C)}>
                List
              </button>
              <button type="button" onClick={() => { setView('pipeline'); setPage(1); }} style={view === 'pipeline' ? primaryBtn(C) : ghostBtn(C)}>
                Pipeline
              </button>
            </div>
          </div>

          {selected.size > 0 && (
            <div style={{
              padding: '10px 16px', borderTop: `1px solid ${C.border}`,
              display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
              background: C.inputBg || 'rgba(0,0,0,0.02)',
            }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{selected.size} selected</span>
              <button type="button" disabled={busy} onClick={() => bulk({ stage: 'qualified' })} style={ghostBtn(C)}>Mark qualified</button>
              <button type="button" disabled={busy} onClick={() => bulk({ stage: 'interested' })} style={ghostBtn(C)}>Mark interested</button>
              <button type="button" disabled={busy} onClick={() => bulk({ follow_up_status: 'pending' })} style={ghostBtn(C)}>Follow-up pending</button>
              <button type="button" disabled={busy} onClick={() => bulk({ follow_up_status: 'done' })} style={ghostBtn(C)}>Follow-up done</button>
              <button type="button" disabled={busy} onClick={() => bulk({ stage: 'lost' })} style={ghostBtn(C)}>Mark lost</button>
              <button type="button" onClick={clearSelection} style={ghostBtn(C)}>Clear</button>
            </div>
          )}
        </section>

        {/* Content */}
        {view === 'pipeline' ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : `repeat(${PIPELINE_COLUMNS.length}, minmax(180px, 1fr))`,
            gap: 10,
            overflowX: 'auto',
          }}>
            {PIPELINE_COLUMNS.map((s) => {
              const tone = stageTone(s, C);
              const items = pipelineGroups[s] || [];
              return (
                <div key={s} style={{ ...shell(C), minWidth: isMobile ? undefined : 180 }}>
                  <div style={{
                    padding: '10px 12px', borderBottom: `1px solid ${C.border}`,
                    background: tone.bg, color: tone.color, fontWeight: 800, fontSize: 12.5,
                  }}>
                    {STAGE_LABEL[s]} · {byStage[s] || items.length}
                  </div>
                  <div style={{ padding: 8, display: 'grid', gap: 8, maxHeight: 520, overflowY: 'auto' }}>
                    {loading && <div style={{ color: C.muted, fontSize: 12, padding: 8 }}>Loading…</div>}
                    {!loading && !items.length && (
                      <div style={{ color: C.muted, fontSize: 12, padding: 8 }}>Empty</div>
                    )}
                    {items.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => openEdit(lead)}
                        style={{
                          textAlign: 'left', padding: 10, borderRadius: 10,
                          border: `1px solid ${C.border}`, background: C.cardBg,
                          cursor: 'pointer', color: C.text,
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{lead.name || 'Unknown'}</div>
                        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>+{lead.phone}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                          {formatWhen(lead.last_message_at)}
                        </div>
                        {lead.follow_up_status && lead.follow_up_status !== 'none' && (
                          <div style={{ marginTop: 6, fontSize: 10.5, fontWeight: 700, color: '#92400E' }}>
                            FU · {lead.follow_up_status}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <section style={shell(C)}>
            <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
              <button type="button" onClick={selectAll} style={ghostBtn(C)}>Select all</button>
              <button type="button" onClick={clearSelection} style={ghostBtn(C)}>Clear</button>
              <div style={{ marginLeft: 'auto', fontSize: 13, color: C.muted, fontWeight: 600, alignSelf: 'center' }}>
                Showing {leads.length} of {total}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: `1px solid ${C.border}`, background: C.hover || 'transparent' }}>
                    {['', 'Contact', 'Stage', 'Customer', 'Source', 'Follow-up', 'Last message', ''].map((h, i) => (
                      <th key={`${h}-${i}`} style={{
                        padding: '12px 14px', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
                        textTransform: 'uppercase', color: C.label || C.muted, whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={8} style={{ padding: 28, color: C.muted, textAlign: 'center' }}>Loading…</td>
                    </tr>
                  )}
                  {!loading && leads.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: 28, color: C.muted, textAlign: 'center', lineHeight: 1.5 }}>
                        No leads yet. They appear when WhatsApp messages arrive, or click <strong style={{ color: C.text }}>Add lead</strong>.
                      </td>
                    </tr>
                  )}
                  {!loading && leads.map((lead) => {
                    const tone = stageTone(lead.stage, C);
                    return (
                      <tr key={lead.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '12px 14px' }}>
                          <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} />
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 700, color: C.text }}>{lead.name || 'Unknown'}</div>
                          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>+{lead.phone}</div>
                          {lead.marketing_opt_out && (
                            <div style={{ fontSize: 11, color: '#991B1B', fontWeight: 700, marginTop: 4 }}>Opted out</div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <select
                            value={lead.stage}
                            disabled={savingId === lead.id}
                            onChange={(e) => quickStage(lead, e.target.value)}
                            style={{
                              ...inputStyle, padding: '6px 10px', background: tone.bg, color: tone.color,
                              fontWeight: 700, border: 'none', maxWidth: 180,
                            }}
                          >
                            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '12px 14px', color: C.text }}>
                          {lead.customer ? (
                            <span>
                              {lead.customer.name}
                              <span style={{ display: 'block', fontSize: 12, color: C.muted }}>#{lead.customer.id}</span>
                            </span>
                          ) : <span style={{ color: C.muted }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 14px', color: C.muted }}>{lead.campaign_source || '—'}</td>
                        <td style={{ padding: '12px 14px', color: C.text, textTransform: 'capitalize' }}>
                          {lead.follow_up_status || 'none'}
                        </td>
                        <td style={{ padding: '12px 14px', color: C.muted, whiteSpace: 'nowrap' }}>
                          {formatWhen(lead.last_message_at)}
                        </td>
                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                          <button type="button" onClick={() => openEdit(lead)} style={ghostBtn(C)}>Edit</button>
                          {' '}
                          <button type="button" onClick={() => openInbox(lead)} style={{ ...ghostBtn(C), color: C.primary || C.accent }}>Inbox</button>
                          {' '}
                          <button
                            type="button"
                            disabled={savingId === lead.id}
                            onClick={() => deleteLead(lead)}
                            style={{ ...ghostBtn(C), borderColor: '#EF4444', color: '#EF4444' }}
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

            {pages > 1 && view === 'list' && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 14px', borderTop: `1px solid ${C.border}`,
              }}>
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={ghostBtn(C)}>
                  Previous
                </button>
                <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>Page {page} / {pages}</span>
                <button type="button" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} style={ghostBtn(C)}>
                  Next
                </button>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Edit drawer/modal */}
      {edit && (
        <Modal C={C} onClose={() => setEdit(null)} title={`Edit lead · +${edit.phone}`}>
          <label style={labelStyle(C)}>Name</label>
          <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} style={{ ...inputStyle, width: '100%', marginBottom: 12 }} />

          <label style={labelStyle(C)}>Stage</label>
          <select value={edit.stage} onChange={(e) => setEdit({ ...edit, stage: e.target.value })} style={{ ...inputStyle, width: '100%', marginBottom: 12 }}>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>

          <label style={labelStyle(C)}>Follow-up</label>
          <select value={edit.follow_up_status} onChange={(e) => setEdit({ ...edit, follow_up_status: e.target.value })} style={{ ...inputStyle, width: '100%', marginBottom: 12 }}>
            {FOLLOW_UP.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <label style={labelStyle(C)}>Campaign source</label>
          <input value={edit.campaign_source} onChange={(e) => setEdit({ ...edit, campaign_source: e.target.value })} style={{ ...inputStyle, width: '100%', marginBottom: 12 }} placeholder="e.g. facebook ads" />

          <label style={labelStyle(C)}>Interest tags (comma separated)</label>
          <input value={edit.interest_tags} onChange={(e) => setEdit({ ...edit, interest_tags: e.target.value })} style={{ ...inputStyle, width: '100%', marginBottom: 12 }} placeholder="bridal, colour, facial" />

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, color: C.text, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!edit.marketing_opt_out} onChange={(e) => setEdit({ ...edit, marketing_opt_out: e.target.checked })} />
            Marketing opt-out (STOP)
          </label>

          {edit.customer && (
            <div style={{ marginBottom: 14, fontSize: 13, color: C.muted }}>
              Linked customer: <strong style={{ color: C.text }}>{edit.customer.name}</strong> #{edit.customer.id}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => openInbox(edit)} style={ghostBtn(C)}>Open Inbox</button>
            <button type="button" onClick={() => setEdit(null)} style={ghostBtn(C)}>Cancel</button>
            <button type="button" disabled={savingId === edit.id} onClick={saveEdit} style={primaryBtn(C, savingId === edit.id)}>
              Save
            </button>
          </div>
        </Modal>
      )}

      {/* Create modal */}
      {createOpen && (
        <Modal C={C} onClose={() => setCreateOpen(false)} title="Add lead manually">
          <label style={labelStyle(C)}>Phone *</label>
          <input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} style={{ ...inputStyle, width: '100%', marginBottom: 12 }} placeholder="9477…" />
          <label style={labelStyle(C)}>Name</label>
          <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} style={{ ...inputStyle, width: '100%', marginBottom: 12 }} />
          <label style={labelStyle(C)}>Stage</label>
          <select value={createForm.stage} onChange={(e) => setCreateForm({ ...createForm, stage: e.target.value })} style={{ ...inputStyle, width: '100%', marginBottom: 12 }}>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
          <label style={labelStyle(C)}>Source</label>
          <input value={createForm.campaign_source} onChange={(e) => setCreateForm({ ...createForm, campaign_source: e.target.value })} style={{ ...inputStyle, width: '100%', marginBottom: 16 }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setCreateOpen(false)} style={ghostBtn(C)}>Cancel</button>
            <button type="button" disabled={busy} onClick={createLead} style={primaryBtn(C, busy)}>Create</button>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}

function Modal({ C, title, onClose, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 80,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, background: C.cardBg, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: 20, boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 14 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function Chip({ C, label, active, onClick, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '7px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
        border: `1px solid ${active ? (C.primary || '#2563EB') : C.border}`,
        background: active ? (tone?.bg || `${C.primary || '#2563EB'}18`) : C.cardBg,
        color: active ? (tone?.color || (C.primary || '#2563EB')) : C.text,
      }}
    >
      {label}
    </button>
  );
}

function Meter({ label, value, ok, C }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ fontWeight: 700, color: ok ? '#16A34A' : C.text }}>{value}</span>
    </div>
  );
}

function labelStyle(C) {
  return { display: 'block', fontSize: 12, fontWeight: 700, color: C.label || C.muted, marginBottom: 6 };
}

function shell(C) {
  return {
    background: C.cardBg,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: C.shadow,
  };
}

function kicker(C) {
  return {
    fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: C.label || C.muted,
  };
}

function primaryBtn(C, disabled) {
  return {
    padding: '9px 14px', borderRadius: 10, border: 'none', cursor: disabled ? 'wait' : 'pointer',
    background: C.primary || C.accent || '#2563EB', color: '#fff', fontWeight: 700, fontSize: 13,
    opacity: disabled ? 0.7 : 1,
  };
}

function ghostBtn(C) {
  return {
    padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer',
    background: 'transparent', color: C.text, fontWeight: 600, fontSize: 12.5,
  };
}

function linkBtn(C) {
  return { ...ghostBtn(C), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' };
}
