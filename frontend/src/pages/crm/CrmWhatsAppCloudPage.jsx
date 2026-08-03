import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { getKcAccessToken } from '../../utils/kcTokenStore';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';

function SectionCard({ title, subtitle, children }) {
  const { C } = usePageTheme();
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: C.shadow }}>
      <div style={{ padding: '16px 22px', borderBottom: `1px solid ${C.border}`, background: C.headerGrad }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: C.label, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '20px 22px' }}>{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, hint, secret, type = 'text' }) {
  const { C } = usePageTheme();
  const [show, setShow] = useState(false);
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.label, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type={secret ? (show ? 'text' : 'password') : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', borderRadius: 10, border: `1.5px solid ${C.inputBdr}`,
            background: C.inputBg, color: C.text, padding: secret ? '10px 40px 10px 13px' : '10px 13px',
            fontSize: 13.5, outline: 'none', boxSizing: 'border-box',
          }}
        />
        {secret && (
          <button type="button" onClick={() => setShow((s) => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', color: C.muted, cursor: 'pointer' }}>
            {show ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {hint && <div style={{ marginTop: 5, fontSize: 12, color: C.muted }}>{hint}</div>}
    </label>
  );
}

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

export default function CrmWhatsAppCloudPage() {
  const { C } = usePageTheme();
  const { tenant, user } = useAuth();
  const waTenantId = tenant?.id ?? user?.tenant_id ?? user?.tenantId ?? null;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [testTo, setTestTo] = useState('');
  const [waStatus, setWaStatus] = useState({ status: 'disconnected' });
  const [waQrImage, setWaQrImage] = useState(null);
  const [waBusy, setWaBusy] = useState(false);
  const waSocketRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/crm/whatsapp-cloud');
      setForm({ ...EMPTY, ...data });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load WABA settings');
    } finally {
      setLoading(false);
    }
  };

  const loadWaStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/whatsapp/status');
      setWaStatus(data || { status: 'disconnected' });
      if (data?.qrImage) setWaQrImage(data.qrImage);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    loadWaStatus();
    const token = getKcAccessToken()
      || document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('token='))?.split('=')[1];
    const socket = io({ auth: { token } });
    waSocketRef.current = socket;
    socket.on('connect', () => {
      if (waTenantId) socket.emit('whatsapp:join', { tenantId: waTenantId });
    });
    socket.on('whatsapp:qr', ({ qrImage }) => { if (qrImage) setWaQrImage(qrImage); });
    socket.on('whatsapp:status', (payload) => {
      setWaStatus((prev) => ({ ...prev, ...payload }));
      if (payload.status === 'connected') {
        setWaQrImage(null);
        toast.success('WhatsApp QR connected');
      }
      if (payload.status === 'disconnected') setWaQrImage(null);
    });
    return () => {
      socket.disconnect();
      waSocketRef.current = null;
    };
  }, [waTenantId, loadWaStatus]);

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
    if (!window.confirm('Disconnect WhatsApp QR? You will need to scan again.')) return;
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
      if (data.ok) toast.success(data.message || 'OK');
      else toast.error(data.message || 'Failed');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Test failed');
    }
  };

  const sendTest = async () => {
    if (!testTo) return toast.error('Enter recipient phone');
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

  return (
    <PageWrapper
      title="WhatsApp for CRM"
      subtitle="Connect via QR (quick start) or Meta Cloud API. Inbound messages feed CRM Inbox, Leads, and AI."
    >
      {loading ? (
        <div style={{ color: C.muted, padding: 24 }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gap: 18, maxWidth: 720 }}>
          <SectionCard
            title="QR connect (Baileys)"
            subtitle="Scan with WhatsApp → Linked Devices. Same session as Notifications. Best for quick CRM AI without Meta setup."
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Status</span>
              {waStatus.status === 'connected' ? (
                <span style={{ fontSize: 10, fontWeight: 700, background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: 6 }}>Connected</span>
              ) : waStatus.status === 'connecting' ? (
                <span style={{ fontSize: 10, fontWeight: 700, background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 6 }}>Scan QR</span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 700, background: '#F3F4F6', color: '#6B7280', padding: '2px 8px', borderRadius: 6 }}>Not connected</span>
              )}
            </div>

            {waStatus.status === 'connected' ? (
              <div style={{
                padding: '12px 14px', marginBottom: 12, borderRadius: 10,
                background: '#F0FDF4', border: '1px solid #BBF7D0', fontSize: 13, color: '#166534',
              }}>
                <strong>Connected:</strong> +{waStatus.phone || '—'}
                {waStatus.push_name ? ` (${waStatus.push_name})` : ''}
              </div>
            ) : waQrImage ? (
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: C.label, margin: '0 0 10px' }}>
                  Open WhatsApp → Linked Devices → Link a Device → Scan this QR
                </p>
                <img
                  src={waQrImage}
                  alt="WhatsApp QR"
                  style={{ width: 280, height: 280, borderRadius: 12, border: `1px solid ${C.border}` }}
                />
              </div>
            ) : (
              <p style={{ fontSize: 13, color: C.muted, margin: '0 0 12px' }}>
                Click Connect to generate a QR code for this salon.
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {waStatus.status !== 'connected' && (
                <button type="button" disabled={waBusy} onClick={handleWaConnect} style={primaryBtn(C, waBusy)}>
                  {waBusy ? 'Starting…' : waQrImage ? 'Refresh QR' : 'Connect WhatsApp QR'}
                </button>
              )}
              {(waStatus.status === 'connected' || waStatus.status === 'connecting') && (
                <button type="button" disabled={waBusy} onClick={handleWaDisconnect} style={ghostBtn(C)}>
                  Disconnect
                </button>
              )}
              <button type="button" onClick={loadWaStatus} style={ghostBtn(C)}>Refresh status</button>
            </div>
          </SectionCard>

          <SectionCard title="Cloud API (Meta)" subtitle="Official WABA for production. Prefer this when available; QR stays as fallback.">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              <span style={{ fontWeight: 600, color: C.text }}>Enable WhatsApp Cloud for AI CRM</span>
            </label>
            <div style={{ display: 'grid', gap: 14 }}>
              <Field label="Phone Number ID" value={form.phone_number_id} onChange={(v) => setForm((f) => ({ ...f, phone_number_id: v }))} hint="From Meta WhatsApp → API Setup" />
              <Field label="WABA ID" value={form.waba_id} onChange={(v) => setForm((f) => ({ ...f, waba_id: v }))} />
              <Field label="Display phone" value={form.display_phone} onChange={(v) => setForm((f) => ({ ...f, display_phone: v }))} placeholder="+94…" />
              <Field label="API version" value={form.api_version} onChange={(v) => setForm((f) => ({ ...f, api_version: v }))} placeholder="v21.0" />
            </div>
          </SectionCard>

          <SectionCard title="Credentials" subtitle="Encrypted at rest. Never returned in full.">
            <div style={{ display: 'grid', gap: 14 }}>
              <Field
                label="Access token"
                value={form.access_token}
                onChange={(v) => setForm((f) => ({ ...f, access_token: v }))}
                secret
                placeholder={form.access_token_set ? 'Saved — paste to replace' : 'EAA…'}
              />
              <Field
                label="App secret"
                value={form.app_secret}
                onChange={(v) => setForm((f) => ({ ...f, app_secret: v }))}
                secret
                placeholder={form.app_secret_set ? 'Saved — paste to replace' : 'For webhook signature'}
                hint="Used to verify X-Hub-Signature-256"
              />
              <Field
                label="Webhook verify token"
                value={form.verify_token}
                onChange={(v) => setForm((f) => ({ ...f, verify_token: v }))}
                hint="Same string you enter in Meta webhook subscription"
              />
            </div>
            <div style={{ marginTop: 12, fontSize: 12.5, color: C.muted }}>
              Webhook callback URL: <code style={{ color: C.text }}>{form.webhook_url_hint || '/api/webhooks/whatsapp'}</code>
              {' '}(full URL = your API host + this path)
            </div>
            {form.last_error && (
              <div style={{ marginTop: 10, color: '#DC2626', fontSize: 13 }}>Last error: {form.last_error}</div>
            )}
          </SectionCard>

          <SectionCard title="Templates (optional)" subtitle="HSM names for confirm/reminder outside 24h window. Body params expected: {{1}} name, {{2}} service, {{3}} date+time.">
            <div style={{ display: 'grid', gap: 14 }}>
              <Field label="Confirm template" value={form.template_confirm} onChange={(v) => setForm((f) => ({ ...f, template_confirm: v }))} hint="Sent right after AI books an appointment" />
              <Field label="Reminder template" value={form.template_reminder} onChange={(v) => setForm((f) => ({ ...f, template_reminder: v }))} hint="Day-before cron at 09:05 — falls back to session text if unset" />
            </div>
          </SectionCard>

          <SectionCard title="Automations" subtitle="Manual run (cron also runs daily/hourly).">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const { data } = await api.post('/crm/follow-ups/run-reminders');
                    toast.success(`Reminders sent=${data.sent} skipped=${data.skipped} (${data.date})`);
                  } catch (err) {
                    toast.error(err.response?.data?.message || 'Failed');
                  }
                }}
                style={ghostBtn(C)}
              >
                Run day-before reminders
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const { data } = await api.post('/crm/follow-ups/run-abandoned');
                    toast.success(`Abandoned nudges sent=${data.sent}`);
                  } catch (err) {
                    toast.error(err.response?.data?.message || 'Failed');
                  }
                }}
                style={ghostBtn(C)}
              >
                Run abandoned nudges
              </button>
            </div>
          </SectionCard>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={save} disabled={saving} style={primaryBtn(C, saving)}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={testConn} style={ghostBtn(C)}>Test connection</button>
            <button type="button" onClick={load} style={ghostBtn(C)}>Refresh</button>
          </div>

          <SectionCard title="Send test message" subtitle="Works inside the 24h customer service window (or use a template later).">
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="9477…"
                style={{ flex: 1, borderRadius: 10, border: `1px solid ${C.inputBdr}`, background: C.inputBg, color: C.text, padding: '10px 12px' }}
              />
              <button type="button" onClick={sendTest} style={primaryBtn(C)}>Send test</button>
            </div>
          </SectionCard>
        </div>
      )}
    </PageWrapper>
  );
}

function primaryBtn(C, disabled) {
  return {
    padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: C.primary || '#2563EB', color: '#fff', fontWeight: 700, fontSize: 13.5,
    opacity: disabled ? 0.7 : 1,
  };
}
function ghostBtn(C) {
  return {
    padding: '10px 18px', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer',
    background: C.cardBg, color: C.text, fontWeight: 600, fontSize: 13.5,
  };
}
