import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { getKcAccessToken } from '../../utils/kcTokenStore';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';
import { useBreakpoint } from '../../hooks/useBreakpoint';

/**
 * Full advanced WhatsApp for CRM page (English).
 * Primary path: QR Linked Device. Optional: Meta Cloud API.
 */

const EMPTY = {
  enabled: false,
  waba_id: '',
  phone_number_id: '',
  display_phone: '',
  access_token: '',
  access_token_set: false,
  app_secret: '',
  app_secret_set: false,
  verify_token: '',
  api_version: 'v21.0',
  template_confirm: '',
  template_reminder: '',
  last_error: null,
  webhook_url_hint: '/api/webhooks/whatsapp',
};

const SETUP_STEPS = [
  {
    n: '1',
    title: 'Connect salon WhatsApp',
    body: 'Open WhatsApp on the salon phone → Linked Devices → Link a device → scan the QR on this page.',
  },
  {
    n: '2',
    title: 'Grant AI Access',
    body: 'Tick required permissions so the bot is allowed to reply and use salon data.',
    to: '/crm/access',
    cta: 'Open AI Access',
  },
  {
    n: '3',
    title: 'Add AI provider key',
    body: 'Save a Gemini or OpenAI key in AI Settings for smart replies.',
    to: '/crm/ai-settings',
    cta: 'AI Settings',
  },
  {
    n: '4',
    title: 'Rules & training',
    body: 'Publish AI Rules and Knowledge so replies match your salon voice.',
    to: '/crm/rules',
    cta: 'AI Rules',
  },
];

export default function CrmWhatsAppCloudPage() {
  const { C } = usePageTheme();
  const { isMobile } = useBreakpoint();
  const { tenant, user } = useAuth();
  const waTenantId = tenant?.id ?? user?.tenant_id ?? user?.tenantId ?? null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [testTo, setTestTo] = useState('');
  const [waStatus, setWaStatus] = useState({ status: 'disconnected' });
  const [waQrImage, setWaQrImage] = useState(null);
  const [waBusy, setWaBusy] = useState(false);
  const [ai, setAi] = useState(null);
  const [accessReady, setAccessReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [autoTab, setAutoTab] = useState('reminders');
  const waSocketRef = useRef(null);

  const loadCloud = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/crm/whatsapp-cloud');
      setForm({ ...EMPTY, ...data });
      if (data?.enabled) setCloudOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load Cloud settings');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWaStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/whatsapp/status');
      setWaStatus(data || { status: 'disconnected' });
      if (data?.qrImage) setWaQrImage(data.qrImage);
      if (data?.status === 'connected') setWaQrImage(null);
    } catch { /* silent */ }
  }, []);

  const loadExtras = useCallback(async () => {
    try {
      const [aiRes, accessRes] = await Promise.all([
        api.get('/crm/ai-settings').catch(() => ({ data: null })),
        api.get('/crm/ai-access').catch(() => ({ data: null })),
      ]);
      setAi(aiRes.data || null);
      setAccessReady(!!accessRes.data?.ready);
    } catch { /* silent */ }
  }, []);

  const loadMessages = useCallback(async () => {
    setMsgLoading(true);
    try {
      const { data } = await api.get('/notifications/whatsapp/messages', { params: { limit: 12 } });
      setMessages(data.messages || data.data || data.rows || []);
    } catch {
      setMessages([]);
    } finally {
      setMsgLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCloud();
    loadExtras();
  }, [loadCloud, loadExtras]);

  useEffect(() => {
    loadWaStatus();
    loadMessages();
    const poll = setInterval(() => {
      loadWaStatus();
    }, 12000);
    return () => clearInterval(poll);
  }, [loadWaStatus, loadMessages]);

  useEffect(() => {
    const token = getKcAccessToken()
      || document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('token='))?.split('=')[1];
    const socket = io({ auth: { token } });
    waSocketRef.current = socket;
    socket.on('connect', () => {
      if (waTenantId) socket.emit('whatsapp:join', { tenantId: waTenantId });
    });
    socket.on('whatsapp:qr', ({ qrImage }) => {
      if (qrImage) setWaQrImage(qrImage);
    });
    socket.on('whatsapp:status', (payload) => {
      setWaStatus((prev) => ({ ...prev, ...payload }));
      if (payload.status === 'connected') {
        setWaQrImage(null);
        toast.success('WhatsApp connected');
        loadMessages();
      }
      if (payload.status === 'disconnected') setWaQrImage(null);
    });
    return () => {
      socket.disconnect();
      waSocketRef.current = null;
    };
  }, [waTenantId, loadMessages]);

  const waOk = waStatus.status === 'connected';
  const waConnecting = waStatus.status === 'connecting';
  const keyOk = ai
    ? (ai.provider === 'gemini'
      ? !!ai.gemini_api_key_set
      : ai.provider === 'openai'
        ? !!ai.openai_api_key_set
        : true)
    : false;
  const cloudOk = !!(form.enabled && form.phone_number_id && form.access_token_set);

  const readiness = useMemo(() => {
    if (waOk && accessReady && keyOk) return { label: 'Ready for CRM AI replies', tone: 'ok' };
    if (!waOk && !cloudOk) return { label: 'Connect WhatsApp QR to start', tone: 'warn' };
    if (!accessReady) return { label: 'WhatsApp OK — grant AI Access next', tone: 'warn' };
    if (!keyOk) return { label: 'Access OK — add AI API key next', tone: 'warn' };
    return { label: 'Almost ready — check connections below', tone: 'warn' };
  }, [waOk, cloudOk, accessReady, keyOk]);

  const handleWaConnect = async () => {
    setWaBusy(true);
    try {
      const { data } = await api.post('/notifications/whatsapp/connect');
      setWaStatus(data);
      if (data.qrImage) setWaQrImage(data.qrImage);
      toast.success(data.message || 'Scan QR with WhatsApp');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to connect WhatsApp');
    } finally {
      setWaBusy(false);
    }
  };

  const handleWaDisconnect = async () => {
    if (!window.confirm('Disconnect WhatsApp? You will need to scan the QR again.')) return;
    setWaBusy(true);
    try {
      await api.post('/notifications/whatsapp/disconnect');
      setWaStatus({ status: 'disconnected' });
      setWaQrImage(null);
      toast.success('WhatsApp disconnected');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to disconnect');
    } finally {
      setWaBusy(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        enabled: form.enabled,
        waba_id: form.waba_id,
        phone_number_id: form.phone_number_id,
        display_phone: form.display_phone,
        verify_token: form.verify_token,
        api_version: form.api_version || 'v21.0',
        template_confirm: form.template_confirm,
        template_reminder: form.template_reminder,
      };
      if (form.access_token && !String(form.access_token).startsWith('••••')) {
        payload.access_token = form.access_token;
      }
      if (form.app_secret && !String(form.app_secret).startsWith('••••')) {
        payload.app_secret = form.app_secret;
      }
      const { data } = await api.put('/crm/whatsapp-cloud', payload);
      setForm({ ...EMPTY, ...data });
      toast.success('WhatsApp Cloud settings saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const testConn = async () => {
    try {
      const { data } = await api.post('/crm/whatsapp-cloud/test');
      if (data.ok) toast.success(data.message || 'Cloud connection OK');
      else toast.error(data.message || 'Cloud test failed');
      loadCloud();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Test failed');
    }
  };

  const sendTest = async () => {
    if (!testTo) return toast.error('Enter recipient phone (e.g. 9477…)');
    try {
      const { data } = await api.post('/crm/whatsapp-cloud/send-test', {
        to: testTo,
        message: 'HEXAONE AI CRM — WhatsApp Cloud test message',
      });
      if (data.ok) toast.success(`Sent ${data.waMessageId || ''}`);
      else toast.error(data.message || 'Send failed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Send failed');
    }
  };

  const runReminders = async () => {
    try {
      const { data } = await api.post('/crm/follow-ups/run-reminders');
      toast.success(`Reminders sent=${data.sent} skipped=${data.skipped} (${data.date})`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const runAbandoned = async () => {
    try {
      const { data } = await api.post('/crm/follow-ups/run-abandoned');
      toast.success(`Abandoned nudges sent=${data.sent}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const copyWebhook = async () => {
    const path = form.webhook_url_hint || '/api/webhooks/whatsapp';
    const full = `${window.location.origin.replace(/:\d+$/, '')}${path.startsWith('/api') ? path : `/api${path}`}`;
    try {
      await navigator.clipboard.writeText(full);
      toast.success('Webhook URL copied');
    } catch {
      toast.error('Copy failed — select the URL manually');
    }
  };

  return (
    <PageWrapper
      title="WhatsApp for CRM"
      subtitle="Link the salon WhatsApp for Inbox, Leads, and AI replies. QR is the recommended quick start; Cloud API is optional for Meta production."
      actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/crm/access" style={linkBtn(C)}>AI Access</Link>
          <Link to="/crm/inbox" style={linkBtn(C)}>Inbox</Link>
          <button type="button" onClick={() => { loadWaStatus(); loadCloud(); loadExtras(); loadMessages(); }} style={ghostBtn(C)}>
            Refresh
          </button>
        </div>
      )}
    >
      <div style={{ display: 'grid', gap: isMobile ? 14 : 18, width: '100%' }}>
        {/* Hero readiness */}
        <section style={{
          borderRadius: 18, padding: isMobile ? 16 : 22,
          border: `1px solid ${C.border}`,
          background: C.isDark
            ? 'linear-gradient(135deg, #052e16 0%, #0F172A 55%, #1E293B 100%)'
            : 'linear-gradient(135deg, #ECFDF5 0%, #F0FDF4 40%, #EFF6FF 100%)',
          boxShadow: C.shadow,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 16 }}>
            <div>
              <div style={kicker(C)}>WhatsApp channel</div>
              <h2 style={{
                margin: '6px 0 0', fontSize: isMobile ? 22 : 26, fontWeight: 800,
                color: C.text, letterSpacing: '-0.02em',
              }}>
                Connect once — power Inbox, Leads & AI
              </h2>
              <p style={{ margin: '10px 0 0', color: C.muted, fontSize: 14, lineHeight: 1.55, maxWidth: 640 }}>
                Scan with the salon phone (Linked Devices). The same QR session is used for CRM AI and notification alerts.
                Keep the phone online with a stable connection.
              </p>
            </div>
            <div style={{
              background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14,
              display: 'grid', gap: 8,
            }}>
              <Meter label="QR Linked Device" value={waOk ? `+${waStatus.phone || 'connected'}` : waConnecting ? 'Scan QR…' : 'Not connected'} ok={waOk} C={C} />
              <Meter label="Cloud API" value={cloudOk ? 'Enabled' : form.enabled ? 'Incomplete' : 'Optional / off'} ok={cloudOk} C={C} />
              <Meter label="AI Access grants" value={accessReady ? 'Ready' : 'Needs ticks'} ok={accessReady} C={C} />
              <Meter label="AI API key" value={keyOk ? (ai?.provider || 'set') : 'Missing'} ok={keyOk} C={C} />
              <div style={{
                marginTop: 4, padding: '8px 10px', borderRadius: 10, fontSize: 12.5, fontWeight: 700,
                background: readiness.tone === 'ok' ? '#DCFCE7' : '#FEF3C7',
                color: readiness.tone === 'ok' ? '#166534' : '#92400E',
              }}>
                {readiness.label}
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: 10,
        }}>
          <Stat C={C} label="QR status" value={statusLabel(waStatus.status)} accent={waOk ? '#16A34A' : undefined} />
          <Stat C={C} label="Linked phone" value={waStatus.phone ? `+${waStatus.phone}` : '—'} />
          <Stat C={C} label="Display name" value={waStatus.push_name || '—'} />
          <Stat C={C} label="Session saved" value={waStatus.has_session ? 'Yes' : 'No'} />
        </div>

        {/* Main grid: QR + setup */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.2fr) minmax(280px, 0.8fr)',
          gap: 16,
          alignItems: 'start',
        }}>
          {/* QR panel */}
          <section style={shell(C)}>
            <div style={{
              padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
              display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center',
            }}>
              <div>
                <div style={kicker(C)}>01 · Recommended</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>QR Linked Device</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                  WhatsApp → Linked Devices → Link a device → scan below
                </div>
              </div>
              <StatusPill status={waStatus.status} />
            </div>

            <div style={{ padding: isMobile ? 16 : 22 }}>
              {waOk ? (
                <div style={{
                  padding: 16, borderRadius: 14, marginBottom: 14,
                  background: C.isDark ? '#052e16' : '#F0FDF4',
                  border: '1px solid #BBF7D0',
                }}>
                  <div style={{ fontWeight: 800, color: '#166534', fontSize: 15 }}>Connected</div>
                  <div style={{ marginTop: 6, fontSize: 14, color: C.text }}>
                    +{waStatus.phone || '—'}
                    {waStatus.push_name ? ` · ${waStatus.push_name}` : ''}
                  </div>
                  {waStatus.connected_at && (
                    <div style={{ marginTop: 4, fontSize: 12, color: C.muted }}>
                      Since {formatWhen(waStatus.connected_at)}
                    </div>
                  )}
                  <p style={{ margin: '10px 0 0', fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                    Keep this phone online. Customers messaging this number appear in CRM Inbox for AI or staff handoff.
                  </p>
                </div>
              ) : waQrImage ? (
                <div style={{ textAlign: 'center', marginBottom: 14 }}>
                  <div style={{
                    display: 'inline-block', padding: 14, borderRadius: 16,
                    background: '#fff', border: `1px solid ${C.border}`, boxShadow: C.shadow,
                  }}>
                    <img
                      src={waQrImage}
                      alt="WhatsApp QR code"
                      style={{ width: isMobile ? 240 : 300, height: isMobile ? 240 : 300, display: 'block' }}
                    />
                  </div>
                  <ol style={{
                    textAlign: 'left', maxWidth: 420, margin: '14px auto 0',
                    paddingLeft: 18, color: C.muted, fontSize: 13, lineHeight: 1.55,
                  }}>
                    <li>Open WhatsApp on the <strong style={{ color: C.text }}>salon phone</strong></li>
                    <li>Tap <strong style={{ color: C.text }}>Linked Devices</strong> → Link a device</li>
                    <li>Scan this QR (refreshes if it expires)</li>
                  </ol>
                </div>
              ) : (
                <div style={{
                  padding: 18, borderRadius: 14, marginBottom: 14,
                  border: `1px dashed ${C.border}`, textAlign: 'center',
                }}>
                  <div style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>No active QR yet</div>
                  <p style={{ margin: '8px 0 0', fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>
                    Click <strong style={{ color: C.text }}>Connect WhatsApp QR</strong> to generate a code for this salon only.
                  </p>
                </div>
              )}

              {waStatus.last_error && !waOk && (
                <div style={{
                  marginBottom: 12, padding: '10px 12px', borderRadius: 10,
                  background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 13,
                }}>
                  Last error: {waStatus.last_error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!waOk && (
                  <button type="button" disabled={waBusy} onClick={handleWaConnect} style={primaryBtn(C, waBusy)}>
                    {waBusy ? 'Starting…' : waQrImage ? 'Refresh QR' : 'Connect WhatsApp QR'}
                  </button>
                )}
                {(waOk || waConnecting) && (
                  <button type="button" disabled={waBusy} onClick={handleWaDisconnect} style={ghostBtn(C)}>
                    Disconnect
                  </button>
                )}
                <button type="button" onClick={loadWaStatus} style={ghostBtn(C)}>Refresh status</button>
                <button type="button" onClick={loadMessages} style={ghostBtn(C)}>Refresh messages</button>
              </div>
            </div>
          </section>

          {/* Setup checklist */}
          <section style={shell(C)}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
              <div style={kicker(C)}>Setup checklist</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Get CRM AI live</div>
            </div>
            <div style={{ padding: 12, display: 'grid', gap: 8 }}>
              {SETUP_STEPS.map((s) => (
                <div key={s.n} style={{
                  padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: C.cardBg,
                }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                      display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800,
                      background: C.primary || '#2563EB', color: '#fff',
                    }}>{s.n}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: C.text, fontSize: 13.5 }}>{s.title}</div>
                      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3, lineHeight: 1.45 }}>{s.body}</div>
                      {s.to && (
                        <Link to={s.to} style={{ ...linkBtn(C), display: 'inline-flex', marginTop: 8, padding: '6px 10px', fontSize: 12 }}>
                          {s.cta}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Recent messages */}
        <section style={shell(C)}>
          <div style={{
            padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <div>
              <div style={kicker(C)}>02 · Activity</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Recent WhatsApp messages</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>Last messages on this salon’s QR session</div>
            </div>
            <Link to="/crm/inbox" style={linkBtn(C)}>Open Inbox</Link>
          </div>
          <div style={{ padding: 14 }}>
            {msgLoading && <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>}
            {!msgLoading && !messages.length && (
              <div style={{ color: C.muted, fontSize: 13.5 }}>
                No messages yet. After customers text the linked number, they appear here and in Inbox.
              </div>
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              {messages.slice(0, 12).map((m, i) => (
                <div key={m.id || i} style={{
                  display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '90px 120px 1fr auto',
                  gap: 8, padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`,
                  alignItems: 'start',
                }}>
                  <Badge C={C} tone={m.direction === 'in' || m.direction === 'inbound' ? 'ok' : 'muted'}>
                    {(m.direction || '—').toString().toUpperCase()}
                  </Badge>
                  <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>+{m.phone || m.from || '—'}</div>
                  <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.4, wordBreak: 'break-word' }}>
                    {String(m.body || m.message || m.text || '').slice(0, 160) || '—'}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.muted, whiteSpace: 'nowrap' }}>
                    {formatWhen(m.createdAt || m.created_at || m.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Cloud API */}
        <section style={shell(C)}>
          <button
            type="button"
            onClick={() => setCloudOpen((v) => !v)}
            style={{
              width: '100%', textAlign: 'left', cursor: 'pointer',
              padding: '14px 18px', border: 'none', background: 'transparent',
              borderBottom: cloudOpen ? `1px solid ${C.border}` : 'none',
              display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center',
            }}
          >
            <div>
              <div style={kicker(C)}>03 · Optional</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Meta Cloud API</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                Official WABA for production scale. QR remains the fallback for CRM AI.
              </div>
            </div>
            <span style={{ fontWeight: 700, color: C.muted, fontSize: 13 }}>{cloudOpen ? 'Hide ▲' : 'Show ▼'}</span>
          </button>

          {cloudOpen && (
            <div style={{ padding: isMobile ? 16 : 20, display: 'grid', gap: 16 }}>
              {loading ? (
                <div style={{ color: C.muted }}>Loading Cloud settings…</div>
              ) : (
                <>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`,
                  }}>
                    <input
                      type="checkbox"
                      checked={!!form.enabled}
                      onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                    />
                    <span style={{ fontWeight: 600, color: C.text }}>Enable WhatsApp Cloud for AI CRM</span>
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                    <Field label="Phone Number ID" value={form.phone_number_id} onChange={(v) => setForm((f) => ({ ...f, phone_number_id: v }))} hint="Meta WhatsApp → API Setup" C={C} />
                    <Field label="WABA ID" value={form.waba_id} onChange={(v) => setForm((f) => ({ ...f, waba_id: v }))} C={C} />
                    <Field label="Display phone" value={form.display_phone} onChange={(v) => setForm((f) => ({ ...f, display_phone: v }))} placeholder="+94…" C={C} />
                    <Field label="API version" value={form.api_version} onChange={(v) => setForm((f) => ({ ...f, api_version: v }))} placeholder="v21.0" C={C} />
                  </div>

                  <div style={{ fontWeight: 800, color: C.text, fontSize: 14 }}>Credentials</div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                    <Field
                      label="Access token"
                      value={form.access_token}
                      onChange={(v) => setForm((f) => ({ ...f, access_token: v }))}
                      secret
                      placeholder={form.access_token_set ? 'Saved — paste to replace' : 'EAA…'}
                      C={C}
                    />
                    <Field
                      label="App secret"
                      value={form.app_secret}
                      onChange={(v) => setForm((f) => ({ ...f, app_secret: v }))}
                      secret
                      placeholder={form.app_secret_set ? 'Saved — paste to replace' : 'Webhook signature'}
                      hint="Verifies X-Hub-Signature-256"
                      C={C}
                    />
                    <Field
                      label="Webhook verify token"
                      value={form.verify_token}
                      onChange={(v) => setForm((f) => ({ ...f, verify_token: v }))}
                      hint="Same string in Meta webhook subscription"
                      C={C}
                    />
                  </div>

                  <div style={{
                    display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                    padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.inputBg || 'transparent',
                  }}>
                    <span style={{ fontSize: 12.5, color: C.muted }}>Webhook URL:</span>
                    <code style={{ fontSize: 12.5, color: C.text }}>{form.webhook_url_hint || '/api/webhooks/whatsapp'}</code>
                    <button type="button" onClick={copyWebhook} style={ghostBtn(C)}>Copy</button>
                  </div>

                  {form.last_error && (
                    <div style={{ color: '#DC2626', fontSize: 13 }}>Last error: {form.last_error}</div>
                  )}

                  <div style={{ fontWeight: 800, color: C.text, fontSize: 14 }}>Templates (optional)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                    <Field label="Confirm template" value={form.template_confirm} onChange={(v) => setForm((f) => ({ ...f, template_confirm: v }))} hint="After AI books" C={C} />
                    <Field label="Reminder template" value={form.template_reminder} onChange={(v) => setForm((f) => ({ ...f, template_reminder: v }))} hint="Day-before cron" C={C} />
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={save} disabled={saving} style={primaryBtn(C, saving)}>
                      {saving ? 'Saving…' : 'Save Cloud settings'}
                    </button>
                    <button type="button" onClick={testConn} style={ghostBtn(C)}>Test Cloud connection</button>
                  </div>

                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                    <div style={{ fontWeight: 700, color: C.text, marginBottom: 8 }}>Send Cloud test message</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        value={testTo}
                        onChange={(e) => setTestTo(e.target.value)}
                        placeholder="9477…"
                        style={{
                          flex: 1, minWidth: 160, borderRadius: 10, border: `1px solid ${C.inputBdr}`,
                          background: C.inputBg, color: C.text, padding: '10px 12px', fontSize: 13.5,
                        }}
                      />
                      <button type="button" onClick={sendTest} style={primaryBtn(C)}>Send test</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* Automations + tips */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
          <section style={shell(C)}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
              <div style={kicker(C)}>04 · Follow-ups</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Manual automation runs</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>Cron also runs these daily/hourly</div>
            </div>
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setAutoTab('reminders')}
                  style={autoTab === 'reminders' ? primaryBtn(C) : ghostBtn(C)}
                >
                  Day-before reminders
                </button>
                <button
                  type="button"
                  onClick={() => setAutoTab('abandoned')}
                  style={autoTab === 'abandoned' ? primaryBtn(C) : ghostBtn(C)}
                >
                  Abandoned nudges
                </button>
              </div>
              {autoTab === 'reminders' ? (
                <>
                  <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                    Sends day-before appointment reminders to customers with a linked WhatsApp number.
                  </p>
                  <button type="button" onClick={runReminders} style={primaryBtn(C)}>Run reminders now</button>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                    Nudges leads who started booking but did not finish.
                  </p>
                  <button type="button" onClick={runAbandoned} style={primaryBtn(C)}>Run abandoned nudges</button>
                </>
              )}
              <Link to="/crm/automations" style={{ ...linkBtn(C), alignSelf: 'start' }}>Open Automations</Link>
            </div>
          </section>

          <section style={shell(C)}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
              <div style={kicker(C)}>Tips</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Keep the link healthy</div>
            </div>
            <ul style={{ margin: 0, padding: '14px 18px 18px 34px', color: C.muted, fontSize: 13.5, lineHeight: 1.6 }}>
              <li>Use the <strong style={{ color: C.text }}>salon business phone</strong>, not a personal staff phone.</li>
              <li>Leave WhatsApp logged in and the phone charged with internet.</li>
              <li>If status stuck on “connecting”, click Refresh QR or Disconnect then Connect again.</li>
              <li>After reconnecting, verify a test chat appears in Inbox.</li>
              <li>Grant AI Access and save an API key before expecting AI auto-replies.</li>
            </ul>
          </section>
        </div>
      </div>
    </PageWrapper>
  );
}

function statusLabel(s) {
  if (s === 'connected') return 'Connected';
  if (s === 'connecting') return 'Scan QR';
  return 'Disconnected';
}

function formatWhen(v) {
  if (!v) return '—';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  } catch {
    return String(v);
  }
}

function StatusPill({ status }) {
  if (status === 'connected') {
    return <span style={pill('#DCFCE7', '#166534')}>Connected</span>;
  }
  if (status === 'connecting') {
    return <span style={pill('#FEF3C7', '#92400E')}>Scan QR</span>;
  }
  return <span style={pill('#F3F4F6', '#6B7280')}>Not connected</span>;
}

function pill(bg, color) {
  return { fontSize: 11, fontWeight: 800, background: bg, color, padding: '4px 10px', borderRadius: 8 };
}

function Meter({ label, value, ok, C }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ fontWeight: 700, color: ok ? '#16A34A' : C.text }}>{value}</span>
    </div>
  );
}

function Stat({ C, label, value, accent }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.border}`, background: C.cardBg }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent || C.text, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, hint, secret, C }) {
  const [show, setShow] = useState(false);
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.label || C.muted, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type={secret ? (show ? 'text' : 'password') : 'text'}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', borderRadius: 10, border: `1.5px solid ${C.inputBdr}`,
            background: C.inputBg, color: C.text, padding: secret ? '10px 48px 10px 13px' : '10px 13px',
            fontSize: 13.5, outline: 'none', boxSizing: 'border-box',
          }}
        />
        {secret && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', color: C.muted, cursor: 'pointer', fontSize: 12 }}
          >
            {show ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {hint && <div style={{ marginTop: 5, fontSize: 12, color: C.muted }}>{hint}</div>}
    </label>
  );
}

function Badge({ C, children, tone }) {
  const color = tone === 'ok' ? '#16A34A' : C.muted;
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 800, color, letterSpacing: 0.3,
      padding: '2px 7px', borderRadius: 6, border: `1px solid ${tone === 'ok' ? 'rgba(22,163,74,0.35)' : C.border}`,
      width: 'fit-content',
    }}>
      {children}
    </span>
  );
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
    padding: '10px 16px', borderRadius: 10, border: 'none', cursor: disabled ? 'wait' : 'pointer',
    background: C.primary || '#2563EB', color: '#fff', fontWeight: 700, fontSize: 13.5,
    opacity: disabled ? 0.7 : 1,
  };
}

function ghostBtn(C) {
  return {
    padding: '9px 14px', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer',
    background: 'transparent', color: C.text, fontWeight: 600, fontSize: 13,
  };
}

function linkBtn(C) {
  return {
    ...ghostBtn(C),
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  };
}
