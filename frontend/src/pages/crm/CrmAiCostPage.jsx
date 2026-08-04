import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import api from '../../api/axios';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';


function Kpi({ label, value, sub, C, warn }) {
  return (
    <div style={{
      background: C.cardBg, border: `1px solid ${warn ? '#F59E0B' : C.border}`, borderRadius: 14,
      padding: '16px 18px', boxShadow: C.shadow,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.label }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: warn ? '#B45309' : C.text, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function money(n, currency = 'USD') {
  const v = Number(n) || 0;
  return `${currency} ${v.toFixed(v >= 1 ? 2 : 4)}`;
}

export default function CrmAiCostPage() {
  const { C } = usePageTheme();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [overview, setOverview] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [costRes, ovRes] = await Promise.all([
        api.get('/crm/analytics/ai-cost'),
        api.get('/crm/analytics/overview'),
      ]);
      setData(costRes.data);
      setOverview(ovRes.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load AI cost analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
      )}
    >
      {loading && <div style={{ color: C.muted, padding: 16 }}>Loading…</div>}

      {!loading && data && (
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Kpi C={C} label="Remaining balance" value={money(wallet.remaining, currency)} sub={`Spent ${money(wallet.spent_total, currency)}`} warn={!!wallet.low_balance} />
            <Kpi C={C} label="Today's AI Cost" value={money(today.cost, currency)} sub={`${today.calls || 0} calls · ${today.total_tokens || 0} tokens`} />
            <Kpi C={C} label="Monthly AI Cost" value={money(month.cost, currency)} sub={`${month.calls || 0} calls this month`} />
            <Kpi C={C} label="Cost / Conversation" value={money(month.cost_per_conversation, currency)} sub={`${month.conversations || 0} conversations`} />
            <Kpi C={C} label="Cost / Booking" value={money(month.cost_per_booking, currency)} sub={`${month.bookings || 0} confirmed bookings`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <Kpi C={C} label="Active Chats" value={overview?.month?.active_chats ?? '—'} sub="Open conversations" />
            <Kpi C={C} label="Leads (month)" value={overview?.month?.leads ?? '—'} />
            <Kpi C={C} label="Bookings (month)" value={overview?.month?.confirmed_bookings ?? '—'} />
            <Kpi C={C} label="Conversion" value={`${overview?.month?.conversion_rate_pct ?? 0}%`} sub="Conversations → bookings" />
          </div>

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
                    <tr><td colSpan={5} style={{ padding: 16, color: C.muted }}>No AI usage recorded yet. Run inbox simulate sync with a provider key.</td></tr>
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
    </PageWrapper>
  );
}

const th = { padding: '10px 14px', fontWeight: 600 };
const td = { padding: '10px 14px' };
