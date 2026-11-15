import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import api from '../../api/axios';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';


function Kpi({ label, value, sub, C, warn, onClick }) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      style={{
        background: C.cardBg, border: `1px solid ${warn ? '#F59E0B' : C.border}`, borderRadius: 14,
        padding: '16px 18px', boxShadow: C.shadow, cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s, transform 0.15s',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.label }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: warn ? '#B45309' : C.text, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/** One composed section: inbox backlog, delivery, queues, follow-ups. */
function HealthSection({ C, overview, queues, followUps }) {
  const h = overview?.health || {};
  const m = overview?.month || {};
  const num = (v) => (v == null ? '—' : v);

  const stats = [
    { label: 'Open conversations', value: num(h.open_conversations ?? m.active_chats), sub: `${num(h.human_active)} with a human` },
    { label: 'Queued handoffs', value: num(h.queued_handoffs), warn: h.queued_handoffs > 0, sub: 'Waiting for staff' },
    { label: 'Outbound pending', value: num(h.outbound_pending_7d), warn: h.outbound_pending_7d > 5, sub: 'Last 7 days' },
    { label: 'Outbound failed', value: num(h.outbound_failed_7d), warn: h.outbound_failed_7d > 0, sub: 'Last 7 days' },
    {
      label: 'AI containment',
      value: h.ai_containment_pct == null ? '—' : `${h.ai_containment_pct}%`,
      sub: `${num(h.handed_off_month)} of ${num(m.conversations)} handed off (month)`,
    },
    { label: 'Conversion', value: `${m.conversion_rate_pct ?? 0}%`, sub: `${num(m.confirmed_bookings)} bookings · ${num(m.leads)} leads` },
  ];

  const queueRows = ['wa-inbound-ai', 'wa-outbound', 'handoff']
    .map((name) => ({ name, q: queues?.queues?.[name] }))
    .filter((r) => r.q);
  const dlq = queues?.dlq;

  const fuCounts = (followUps || []).reduce((acc, j) => {
    acc[j.status] = (acc[j.status] || 0) + 1;
    return acc;
  }, {});

  const sectionTitle = { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.label, marginBottom: 8 };
  const line = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderTop: `1px solid ${C.border}`, fontSize: 13, color: C.text };

  return (
    <section style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: C.shadow, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.text }}>
        Inbox &amp; queue health
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {stats.map((s, i) => (
          <div key={s.label} style={{ padding: '14px 18px', borderLeft: i ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.label }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: s.warn ? '#B45309' : C.text }}>{s.value}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {(queueRows.length > 0 || followUps) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, padding: '16px 18px', borderTop: `1px solid ${C.border}` }}>
          {queueRows.length > 0 && (
            <div>
              <div style={sectionTitle}>Queues</div>
              {queueRows.map(({ name, q }) => (
                <div key={name} style={line}>
                  <span>{name}</span>
                  <span style={{ color: q.failed > 0 ? '#B45309' : C.muted }}>
                    {q.available === false
                      ? 'unavailable'
                      : `${q.waiting} waiting · ${q.active} active · ${q.failed} failed`}
                  </span>
                </div>
              ))}
              {dlq?.available && (
                <div style={line}>
                  <span>Dead letters</span>
                  <span style={{ color: dlq.alert ? '#DC2626' : C.muted, fontWeight: dlq.alert ? 700 : 400 }}>{dlq.depth}</span>
                </div>
              )}
            </div>
          )}
          {followUps && (
            <div>
              <div style={sectionTitle}>Follow-ups (latest 50)</div>
              {['pending', 'sent', 'failed', 'skipped'].map((s) => (
                <div key={s} style={line}>
                  <span style={{ textTransform: 'capitalize' }}>{s}</span>
                  <span style={{ color: s === 'failed' && fuCounts[s] ? '#B45309' : C.muted }}>{fuCounts[s] || 0}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function money(n, currency = 'USD') {
  const v = Number(n) || 0;
  return `${currency} ${v.toFixed(v >= 1 ? 2 : 4)}`;
}

function CostDetailsModal({ open, onClose, C, wallet, today, month, providers, recent, currency }) {
  if (!open) return null;

  const accent = C.primary || '#2563EB';
  const remaining = Number(wallet?.remaining) || 0;
  const spent = Number(wallet?.spent_total) || 0;
  const credits = Number(wallet?.credits_added) || 0;
  const pct = credits > 0 ? Math.min(100, Math.round((spent / credits) * 100)) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI cost details"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, backdrop: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto',
          background: C.cardBg, borderRadius: 18, border: `1px solid ${C.border}`,
          boxShadow: '0 24px 64px rgba(15,23,42,0.28)',
        }}
      >
        <div style={{
          padding: '18px 20px 14px',
          background: `linear-gradient(135deg, ${accent}18, transparent 70%)`,
          borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.label }}>
              CRM · AI wallet
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginTop: 4 }}>Cost overview</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
              Balance, spend, and recent model usage for this salon.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`,
              background: C.cardBg, color: C.text, cursor: 'pointer', fontSize: 18, lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 20, display: 'grid', gap: 16 }}>
          <div style={{
            borderRadius: 14, padding: 16,
            background: remaining < 5 ? 'rgba(245,158,11,0.1)' : `${accent}10`,
            border: `1px solid ${remaining < 5 ? '#F59E0B55' : `${accent}33`}`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.label, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Remaining balance
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, color: remaining < 5 ? '#B45309' : C.text, marginTop: 4 }}>
              {money(remaining, currency)}
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
              Credits {money(credits, currency)} · Spent {money(spent, currency)}
            </div>
            <div style={{
              marginTop: 12, height: 8, borderRadius: 999, background: C.border, overflow: 'hidden',
            }}>
              <div style={{
                width: `${pct}%`, height: '100%', borderRadius: 999,
                background: remaining < 5 ? '#F59E0B' : accent,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{pct}% of credits used</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Today', value: money(today?.cost, currency), sub: `${today?.calls || 0} calls` },
              { label: 'This month', value: money(month?.cost, currency), sub: `${month?.calls || 0} calls` },
              { label: 'Per conversation', value: money(month?.cost_per_conversation, currency), sub: `${month?.conversations || 0} chats` },
              { label: 'Per booking', value: money(month?.cost_per_booking, currency), sub: `${month?.bookings || 0} booked` },
            ].map((x) => (
              <div key={x.label} style={{
                padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.border}`, background: C.cardBg,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.label, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{x.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 4 }}>{x.value}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{x.sub}</div>
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.label, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              By model (month)
            </div>
            {(providers || []).length === 0 ? (
              <div style={{ fontSize: 13, color: C.muted, padding: '8px 0' }}>No AI usage yet this month.</div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {(providers || []).slice(0, 6).map((p) => (
                  <div key={`${p.provider}-${p.model}`} style={{
                    display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center',
                    padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`,
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, color: C.text, fontSize: 13 }}>{p.model || p.provider}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>{p.provider} · {p.calls} calls · {p.total_tokens} tokens</div>
                    </div>
                    <div style={{ fontWeight: 800, color: C.text, fontSize: 13 }}>{money(p.cost, currency)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.label, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Recent calls
            </div>
            {(recent || []).length === 0 ? (
              <div style={{ fontSize: 13, color: C.muted }}>No recent AI calls.</div>
            ) : (
              <div style={{ display: 'grid', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                {(recent || []).slice(0, 8).map((r) => (
                  <div key={r.id} style={{
                    display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5,
                    padding: '7px 0', borderTop: `1px solid ${C.border}`, color: C.text,
                  }}>
                    <span style={{ color: C.muted }}>
                      {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'} · {r.model || r.provider}
                    </span>
                    <span style={{ fontWeight: 700 }}>{money(r.cost, r.currency || currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(wallet?.entries || []).length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.label, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Credit history
              </div>
              <div style={{ display: 'grid', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                {wallet.entries.slice(0, 6).map((e) => (
                  <div key={e.id} style={{
                    display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5,
                    padding: '7px 0', borderTop: `1px solid ${C.border}`, color: C.text,
                  }}>
                    <span style={{ color: C.muted }}>{e.entry_type} · {e.note || '—'}</span>
                    <span style={{ fontWeight: 700 }}>{money(e.amount_usd, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, paddingTop: 4 }}>
            Tracked rates are discounted for salon CRM reporting. Credits are added by Hexaone platform admin.
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '12px 16px', borderRadius: 12, border: 'none',
              background: accent, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14,
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/** RC8 — monthly Gemini budget ($20 hard / $16 planned) + routing mix. */
function BudgetPanel({ C, budget, currency }) {
  const b = budget.budget || {};
  const pct = Number(b.pct_of_hard || 0);
  const warn = pct >= 70;
  const barColor = pct >= 95 ? '#DC2626' : pct >= 85 ? '#EA580C' : pct >= 70 ? '#D97706' : (C.primary || '#2563EB');
  const moneyUsd = (v) => `$${Number(v || 0).toFixed(4)}`;

  return (
    <section style={{ background: C.cardBg, border: `1px solid ${warn ? '#F59E0B' : C.border}`, borderRadius: 14, boxShadow: C.shadow, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, color: C.text }}>Gemini monthly budget (RC8)</div>
        <div style={{ fontSize: 12, color: C.muted }}>
          Hard ${b.hard_cap ?? 20} · Planned ${b.planned ?? 16} · Argon blocked
        </div>
      </div>
      <div style={{ padding: '14px 18px', display: 'grid', gap: 14 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
            <span style={{ color: C.text, fontWeight: 600 }}>Spend {moneyUsd(b.spent)} / ${b.hard_cap ?? 20}</span>
            <span style={{ color: barColor, fontWeight: 700 }}>{pct}% of hard cap</span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: C.border, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: barColor }} />
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
            Remaining hard {moneyUsd(b.remaining_hard)}
            {(b.alerts_pct || []).length > 0 ? ` · Alerts: ${(b.alerts_pct || []).join('%, ')}%` : ''}
            {b.hard_exhausted ? ' · HARD CAP — safe handoff only' : ''}
            {!b.allow_hydrogen ? ' · Hydrogen escalation paused' : ''}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <Kpi C={C} label="Total spend" value={money(budget.total_spend_usd, currency)} sub="This month (AiUsage)" />
          <Kpi C={C} label="Avg / conversation" value={moneyUsd(budget.avg_cost_per_conversation)} sub={`Target $${budget.target_avg_conversation ?? 0.016}`} warn={Number(budget.avg_cost_per_conversation) > 0.02} />
          <Kpi C={C} label="P95 / conversation" value={moneyUsd(budget.p95_cost_per_conversation)} sub={`${budget.conversations_with_usage || 0} convs`} />
          <Kpi C={C} label="Tokens" value={String(budget.token_consumption?.total_tokens || 0)} sub={`In ${budget.token_consumption?.prompt_tokens || 0} · Out ${budget.token_consumption?.completion_tokens || 0}`} />
          <Kpi C={C} label="Repair/retry calls" value={String(budget.repair_retry_calls || 0)} sub="Purpose match" />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: C.muted }}>
                <th style={th}>Model</th>
                <th style={th}>Calls</th>
                <th style={th}>% calls</th>
                <th style={th}>Spend</th>
                <th style={th}>% spend</th>
              </tr>
            </thead>
            <tbody>
              {(budget.spend_by_model || []).length === 0 && (
                <tr><td colSpan={5} style={{ padding: 12, color: C.muted }}>No Gemini usage this month yet.</td></tr>
              )}
              {(budget.spend_by_model || []).map((m) => {
                const dist = (budget.model_routing_distribution || []).find((d) => d.model === m.model);
                return (
                  <tr key={m.model} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td}>{m.model}</td>
                    <td style={td}>{m.calls}</td>
                    <td style={td}>{dist?.pct_calls ?? 0}%</td>
                    <td style={td}>{money(m.cost, currency)}</td>
                    <td style={td}>{m.pct_of_spend}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default function CrmAiCostPage() {
  const { C } = usePageTheme();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [budget, setBudget] = useState(null);
  const [overview, setOverview] = useState(null);
  const [queues, setQueues] = useState(null);
  const [followUps, setFollowUps] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [costRes, budRes, ovRes, qRes, fuRes] = await Promise.all([
        api.get('/crm/analytics/ai-cost'),
        api.get('/crm/analytics/ai-budget').catch(() => null),
        api.get('/crm/analytics/overview'),
        api.get('/crm/queue-stats').catch(() => null),
        api.get('/crm/follow-ups').catch(() => null),
      ]);
      setData(costRes.data);
      setBudget(budRes?.data || null);
      setOverview(ovRes.data);
      setQueues(qRes?.data || null);
      setFollowUps(fuRes?.data?.data || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load AI cost analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Open cost modal once per session when page loads with data
  useEffect(() => {
    if (!loading && data && !sessionStorage.getItem('crm_ai_cost_modal_seen')) {
      setModalOpen(true);
      sessionStorage.setItem('crm_ai_cost_modal_seen', '1');
    }
  }, [loading, data]);

  const month = data?.month || {};
  const today = data?.today || {};
  const wallet = data?.wallet || overview?.wallet || {};
  const currency = data?.currency || 'USD';
  const series = (data?.series || []).map((r) => ({
    ...r,
    dayLabel: String(r.day).slice(5),
  }));

  return (
    <PageWrapper
      title="AI Cost & CRM Analytics"
      subtitle="Token usage, spend, and WhatsApp conversion for this salon."
      actions={(
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={{
              padding: '8px 14px', borderRadius: 10, border: 'none',
              background: C.primary || '#2563EB', color: '#fff', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Cost details
          </button>
          <button
            type="button"
            onClick={load}
            style={{
              padding: '8px 14px', borderRadius: 10, border: `1px solid ${C.border}`,
              background: C.cardBg, color: C.text, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      )}
    >
      {loading && <div style={{ color: C.muted, padding: 16 }}>Loading…</div>}

      {!loading && data && (
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Kpi C={C} label="Remaining balance" value={money(wallet.remaining, currency)} sub={`Credits ${money(wallet.credits_added, currency)} · Spent ${money(wallet.spent_total, currency)}`} warn={!!wallet.low_balance} onClick={() => setModalOpen(true)} />
            <Kpi C={C} label="Today's AI Cost" value={money(today.cost, currency)} sub={`${today.calls || 0} calls · ${today.total_tokens || 0} tokens`} onClick={() => setModalOpen(true)} />
            <Kpi C={C} label="Monthly AI Cost" value={money(month.cost, currency)} sub={`${month.calls || 0} calls this month`} onClick={() => setModalOpen(true)} />
            <Kpi C={C} label="Cost / Conversation" value={money(month.cost_per_conversation, currency)} sub={`${month.conversations || 0} conversations`} />
            <Kpi C={C} label="Cost / Booking" value={money(month.cost_per_booking, currency)} sub={`${month.bookings || 0} confirmed bookings`} />
          </div>

          <div style={{
            background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14,
            padding: '14px 16px', boxShadow: C.shadow,
            display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
              Salon rates are discounted ~25% for CRM tracking. Credits are added by Hexaone platform admin.
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              style={{
                padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.border}`,
                background: C.cardBg, color: C.text, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Open cost modal
            </button>
          </div>

          {budget?.ok && (
            <BudgetPanel C={C} budget={budget} currency={currency} />
          )}

          <HealthSection C={C} overview={overview} queues={queues} followUps={followUps} />

          {(wallet.entries || []).length > 0 && (
            <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.text }}>
                Credit history
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: C.muted }}>
                      <th style={th}>When</th>
                      <th style={th}>Type</th>
                      <th style={th}>Amount</th>
                      <th style={th}>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wallet.entries.map((e) => (
                      <tr key={e.id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={td}>{e.createdAt ? new Date(e.createdAt).toLocaleString() : '—'}</td>
                        <td style={td}>{e.entry_type}</td>
                        <td style={td}>{money(e.amount_usd, currency)}</td>
                        <td style={td}>{e.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
            <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
              <div style={{ fontWeight: 700, color: C.text, marginBottom: 12 }}>AI cost (14 days)</div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="dayLabel" tick={{ fill: C.muted, fontSize: 11 }} />
                  <YAxis tick={{ fill: C.muted, fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="cost" stroke={C.primary || '#2563EB'} fill={`${C.primary || '#2563EB'}33`} name="Cost" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
              <div style={{ fontWeight: 700, color: C.text, marginBottom: 12 }}>Tokens (14 days)</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="dayLabel" tick={{ fill: C.muted, fontSize: 11 }} />
                  <YAxis tick={{ fill: C.muted, fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="tokens" fill={C.primary || '#2563EB'} name="Tokens" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.text }}>
              Cost by provider / model (month)
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: C.muted }}>
                    <th style={th}>Provider</th>
                    <th style={th}>Model</th>
                    <th style={th}>Calls</th>
                    <th style={th}>Tokens</th>
                    <th style={th}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.providers || []).length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 16, color: C.muted }}>No AI usage recorded yet.</td></tr>
                  )}
                  {(data.providers || []).map((p) => (
                    <tr key={`${p.provider}-${p.model}`} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={td}>{p.provider}</td>
                      <td style={td}>{p.model || '—'}</td>
                      <td style={td}>{p.calls}</td>
                      <td style={td}>{p.total_tokens}</td>
                      <td style={td}>{money(p.cost, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.text }}>
              Recent AI calls
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: C.muted }}>
                    <th style={th}>When</th>
                    <th style={th}>Provider</th>
                    <th style={th}>Model</th>
                    <th style={th}>Tokens</th>
                    <th style={th}>Cost</th>
                    <th style={th}>Latency</th>
                    <th style={th}>Conv</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.recent || []).map((r) => (
                    <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={td}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</td>
                      <td style={td}>{r.provider}</td>
                      <td style={td}>{r.model || '—'}</td>
                      <td style={td}>{r.total_tokens}</td>
                      <td style={td}>{money(r.cost, r.currency || currency)}</td>
                      <td style={td}>{r.latency_ms != null ? `${r.latency_ms} ms` : '—'}</td>
                      <td style={td}>{r.conversation_id || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <CostDetailsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        C={C}
        wallet={wallet}
        today={today}
        month={month}
        providers={data?.providers || []}
        recent={data?.recent || []}
        currency={currency}
      />
    </PageWrapper>
  );
}

const th = { padding: '10px 14px', fontWeight: 600 };
const td = { padding: '10px 14px' };
