import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';

const VIEWS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'list', label: 'Automations' },
  { id: 'history', label: 'History' },
];

function fieldStyle(C) {
  return {
    width: '100%',
    borderRadius: 10,
    border: `1px solid ${C.inputBdr || C.border}`,
    background: C.inputBg || C.cardBg,
    color: C.text,
    padding: '10px 12px',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };
}

function btn(C, variant = 'default') {
  if (variant === 'primary') {
    return {
      padding: '8px 14px', borderRadius: 10, border: 'none',
      background: C.primary || C.accent || '#2563EB', color: '#fff',
      fontWeight: 700, cursor: 'pointer', fontSize: 13,
    };
  }
  if (variant === 'danger') {
    return {
      padding: '8px 12px', borderRadius: 8, border: '1px solid #EF4444',
      background: 'transparent', color: '#EF4444', fontWeight: 600, cursor: 'pointer', fontSize: 12,
    };
  }
  return {
    padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.border}`,
    background: C.cardBg, color: C.text, fontWeight: 600, cursor: 'pointer', fontSize: 13,
  };
}

function formatWhen(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString(); } catch { return '—'; }
}

const TYPE_HELP = {
  appointment_reminder: 'Wraps CRM day-before reminders (optional 2-hour window).',
  welcome_message: 'Greets newly registered customers.',
  birthday_wishes: 'Runs near 09:00 for customers with DOB today.',
  review_request: 'After completed appointments, with configurable delay.',
  rebooking_reminder: 'Customers inactive for 30 / 60 / 90 days.',
  abandoned_booking: 'Wraps existing WhatsApp abandoned booking nudges.',
  promotional_campaign: 'Manual / segment campaign send.',
};

export default function CrmAutomationsPage() {
  const { C } = usePageTheme();
  const [view, setView] = useState('list');
  const [dashboard, setDashboard] = useState(null);
  const [rows, setRows] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [history, setHistory] = useState([]);
  const [histTotal, setHistTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [edit, setEdit] = useState(null);

  const loadDashboard = useCallback(async () => {
    try {
      const { data } = await api.get('/crm/automations/dashboard');
      setDashboard(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load dashboard');
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/crm/automations');
      setRows(data.data || []);
      setCatalog(data.catalog || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load automations');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get('/crm/automations/history', { params: { limit: 50 } });
      setHistory(data.data || []);
      setHistTotal(data.total || 0);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load history');
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadDashboard(), loadList(), loadHistory()]);
  }, [loadDashboard, loadList, loadHistory]);

  useEffect(() => { refresh(); }, [refresh]);

  const descriptions = useMemo(() => {
    const map = {};
    for (const c of catalog) map[c.type] = c.description;
    return map;
  }, [catalog]);

  const toggleEnabled = async (row) => {
    setBusyId(row.id);
    try {
      const { data } = await api.put(`/crm/automations/${row.id}`, { enabled: !row.enabled });
      setRows((prev) => prev.map((r) => (r.id === data.id ? data : r)));
      toast.success(data.enabled ? 'Automation ON' : 'Automation OFF');
      loadDashboard();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const runNow = async (row) => {
    if (!window.confirm(`Run “${row.name}” now?`)) return;
    setBusyId(row.id);
    try {
      await api.post(`/crm/automations/${row.id}/run`);
      toast.success('Queued — check History shortly');
      setTimeout(loadHistory, 1500);
      loadDashboard();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Run failed');
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (row) => {
    const settings = row.settings_json || {};
    setEdit({
      id: row.id,
      name: row.name,
      type: row.type,
      enabled: !!row.enabled,
      channel: row.channel || 'whatsapp',
      delay: row.delay || '',
      schedule: row.schedule || '',
      template: settings.template || '',
      coupon_code: settings.coupon_code || '',
      segment: settings.segment || 'all',
      offer_text: settings.offer_text || '',
      review_link: settings.review_link || '',
      settings,
    });
  };

  const saveEdit = async () => {
    if (!edit) return;
    setBusyId(edit.id);
    try {
      const settings_json = {
        ...(edit.settings || {}),
        template: edit.template,
        coupon_code: edit.coupon_code || null,
        segment: edit.segment,
        offer_text: edit.offer_text,
        review_link: edit.review_link,
      };
      const { data } = await api.put(`/crm/automations/${edit.id}`, {
        name: edit.name,
        enabled: edit.enabled,
        channel: edit.channel,
        delay: edit.delay || null,
        schedule: edit.schedule || null,
        settings_json,
      });
      setRows((prev) => prev.map((r) => (r.id === data.id ? data : r)));
      setEdit(null);
      toast.success('Settings saved');
      loadDashboard();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setBusyId(null);
    }
  };

  const delayOptionsFor = (type) => {
    if (type === 'appointment_reminder') {
      return [
        { value: '1_day', label: '1 day before' },
        { value: '2_hours', label: '2 hours before' },
      ];
    }
    if (type === 'review_request') {
      return [
        { value: '2_hours', label: '2 hours after' },
        { value: '6_hours', label: '6 hours after' },
        { value: '24_hours', label: '24 hours after' },
      ];
    }
    if (type === 'rebooking_reminder') {
      return [
        { value: '30_days', label: '30 days inactive' },
        { value: '60_days', label: '60 days inactive' },
        { value: '90_days', label: '90 days inactive' },
      ];
    }
    if (type === 'abandoned_booking') {
      return [
        { value: '30_minutes', label: '30 minutes' },
        { value: '2_hours', label: '2 hours' },
        { value: '24_hours', label: '24 hours' },
      ];
    }
    return [];
  };

  const stats = [
    { label: 'Active', value: dashboard?.total_active ?? '—' },
    { label: "Today's jobs", value: dashboard?.today_executed ?? '—' },
    { label: 'Pending', value: dashboard?.pending_jobs ?? '—' },
    { label: 'Failed today', value: dashboard?.failed_jobs ?? '—' },
    { label: 'Success rate', value: dashboard ? `${dashboard.success_rate}%` : '—' },
    { label: 'Avg time', value: dashboard?.avg_execution_ms != null ? `${dashboard.avg_execution_ms} ms` : '—' },
  ];

  return (
    <PageWrapper
      title="CRM Automations"
      subtitle="Configure WhatsApp / SMS / email automations. Appointment reminders and abandoned nudges reuse existing CRM jobs."
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            style={{
              ...btn(C),
              background: view === v.id ? (C.primary || '#2563EB') : C.cardBg,
              color: view === v.id ? '#fff' : C.text,
              border: view === v.id ? 'none' : `1px solid ${C.border}`,
            }}
          >
            {v.label}
          </button>
        ))}
        <button type="button" onClick={refresh} style={{ ...btn(C), marginLeft: 'auto' }}>Refresh</button>
      </div>

      {/* Dashboard strip always visible */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10,
        marginBottom: 16,
      }}
      >
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px',
            }}
          >
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {view === 'dashboard' && (
        <div style={{
          background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16,
        }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Last execution</div>
          {dashboard?.last_execution ? (
            <div style={{ fontSize: 14, color: C.text }}>
              <strong>{dashboard.last_execution.automation?.name || 'Automation'}</strong>
              {' · '}
              {dashboard.last_execution.status}
              {' · '}
              {formatWhen(dashboard.last_execution.executed_at)}
            </div>
          ) : (
            <div style={{ color: C.muted }}>No executions yet. Toggle an automation ON or use Run Now.</div>
          )}
          {dashboard?.most_used && (
            <div style={{ marginTop: 12, fontSize: 14, color: C.muted }}>
              Most used today: <strong style={{ color: C.text }}>{dashboard.most_used.name}</strong>
            </div>
          )}
        </div>
      )}

      {view === 'list' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 14,
        }}
        >
          {loading && <div style={{ color: C.muted }}>Loading…</div>}
          {!loading && rows.map((row) => (
            <div
              key={row.id}
              style={{
                background: C.cardBg,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: C.text }}>{row.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{row.type}</div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={!!row.enabled}
                    disabled={busyId === row.id}
                    onChange={() => toggleEnabled(row)}
                  />
                  {row.enabled ? 'ON' : 'OFF'}
                </label>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.45, flex: 1 }}>
                {descriptions[row.type] || TYPE_HELP[row.type] || 'Configurable CRM automation.'}
              </p>
              <div style={{ fontSize: 12, color: C.muted }}>
                Channel: <strong style={{ color: C.text }}>{row.channel}</strong>
                {row.delay ? <> · Delay: <strong style={{ color: C.text }}>{row.delay}</strong></> : null}
                {row.schedule ? <> · Schedule: <strong style={{ color: C.text }}>{row.schedule}</strong></> : null}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => openEdit(row)} style={btn(C)}>Edit</button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => runNow(row)}
                  style={btn(C, 'primary')}
                >
                  Run Now
                </button>
                <button
                  type="button"
                  onClick={() => { setView('history'); }}
                  style={btn(C)}
                >
                  History
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'history' && (
        <div style={{
          background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden',
        }}
        >
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontWeight: 800 }}>
            Execution logs ({histTotal})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: `1px solid ${C.border}` }}>
                  {['When', 'Automation', 'Status', 'Duration', 'Error'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', color: C.muted, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!history.length && (
                  <tr>
                    <td colSpan={5} style={{ padding: 20, color: C.muted }}>No executions yet.</td>
                  </tr>
                )}
                {history.map((h) => (
                  <tr key={h.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{formatWhen(h.executed_at || h.createdAt)}</td>
                    <td style={{ padding: '10px 14px' }}>{h.automation?.name || h.automation_id}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700 }}>{h.status}</td>
                    <td style={{ padding: '10px 14px' }}>{h.duration != null ? `${h.duration} ms` : '—'}</td>
                    <td style={{ padding: '10px 14px', color: '#EF4444', maxWidth: 280 }}>
                      {h.error ? String(h.error).slice(0, 120) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {edit && (
        <div
          onClick={() => setEdit(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80, padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
              background: C.cardBg, borderRadius: 16, border: `1px solid ${C.border}`, padding: 20,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Automation settings</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>{edit.type}</div>

            <label style={labelStyle(C)}>Name</label>
            <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} style={{ ...fieldStyle(C), marginBottom: 10 }} />

            <label style={labelStyle(C)}>Channel</label>
            <select value={edit.channel} onChange={(e) => setEdit({ ...edit, channel: e.target.value })} style={{ ...fieldStyle(C), marginBottom: 10 }}>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>

            {!!delayOptionsFor(edit.type).length && (
              <>
                <label style={labelStyle(C)}>Timing</label>
                <select
                  value={edit.delay}
                  onChange={(e) => setEdit({ ...edit, delay: e.target.value })}
                  style={{ ...fieldStyle(C), marginBottom: 10 }}
                >
                  {delayOptionsFor(edit.type).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </>
            )}

            {edit.type === 'birthday_wishes' && (
              <>
                <label style={labelStyle(C)}>Schedule (local hour hint)</label>
                <input value={edit.schedule || '09:00'} onChange={(e) => setEdit({ ...edit, schedule: e.target.value })} style={{ ...fieldStyle(C), marginBottom: 10 }} />
                <label style={labelStyle(C)}>Discount coupon (optional)</label>
                <input value={edit.coupon_code} onChange={(e) => setEdit({ ...edit, coupon_code: e.target.value })} style={{ ...fieldStyle(C), marginBottom: 10 }} placeholder="BDAY10" />
              </>
            )}

            {edit.type === 'promotional_campaign' && (
              <>
                <label style={labelStyle(C)}>Segment</label>
                <select value={edit.segment} onChange={(e) => setEdit({ ...edit, segment: e.target.value })} style={{ ...fieldStyle(C), marginBottom: 10 }}>
                  <option value="all">All customers</option>
                  <option value="vip">VIP / loyalty</option>
                  <option value="inactive">Inactive</option>
                  <option value="loyalty">With loyalty points</option>
                </select>
                <label style={labelStyle(C)}>Offer text</label>
                <input value={edit.offer_text} onChange={(e) => setEdit({ ...edit, offer_text: e.target.value })} style={{ ...fieldStyle(C), marginBottom: 10 }} />
              </>
            )}

            {edit.type === 'review_request' && (
              <>
                <label style={labelStyle(C)}>Review link (optional)</label>
                <input value={edit.review_link} onChange={(e) => setEdit({ ...edit, review_link: e.target.value })} style={{ ...fieldStyle(C), marginBottom: 10 }} />
              </>
            )}

            <label style={labelStyle(C)}>Message template</label>
            <textarea
              value={edit.template}
              onChange={(e) => setEdit({ ...edit, template: e.target.value })}
              rows={5}
              style={{ ...fieldStyle(C), marginBottom: 8, resize: 'vertical' }}
            />
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>
              Variables: {'{{name}} {{salon}} {{service}} {{date}} {{time}} {{staff}} {{coupon}} {{offer}} {{review_link}}'}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontWeight: 600 }}>
              <input type="checkbox" checked={!!edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} />
              Enabled
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setEdit(null)} style={btn(C)}>Cancel</button>
              <button type="button" disabled={busyId === edit.id} onClick={saveEdit} style={btn(C, 'primary')}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

function labelStyle(C) {
  return { display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 };
}
