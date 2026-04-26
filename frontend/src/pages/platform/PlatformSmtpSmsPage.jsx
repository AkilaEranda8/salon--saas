import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';

/* ── Icons ─────────────────────────────────────────────────────────────────── */
const IconMail    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
const IconSms     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const IconPhone   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.6a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.77 3h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.09a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
const IconSave    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IconTest    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>;
const IconRefresh = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
const IconEye     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconEyeOff  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;

/* ── Source badge ───────────────────────────────────────────────────────────── */
function SourceBadge({ source, dark }) {
  const MAP = {
    db:   { label: 'DB Override', bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
    env:  { label: '.env Default', bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' },
    none: { label: 'Not Configured', bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
  };
  const s = MAP[source] || MAP.none;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
      background: dark ? 'rgba(255,255,255,0.06)' : s.bg,
      color: dark ? (source === 'none' ? '#F87171' : source === 'db' ? '#34D399' : '#60A5FA') : s.text,
      border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : s.border}`,
      fontFamily: "'Inter',sans-serif",
    }}>
      {source === 'db' ? '● ' : source === 'env' ? '○ ' : '✕ '}{s.label}
    </span>
  );
}

/* ── Section card ───────────────────────────────────────────────────────────── */
function Section({ title, subtitle, icon, source, dark, children }) {
  return (
    <div style={{
      borderRadius: 16,
      border: `1px solid ${dark ? '#1E293B' : '#E5E7EB'}`,
      background: dark ? '#0F172A' : '#FFFFFF',
      boxShadow: dark ? '0 4px 24px rgba(0,0,0,0.25)' : '0 2px 12px rgba(15,23,42,0.06)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${dark ? '#1E293B' : '#F1F5F9'}`,
        background: dark ? '#0B1220' : 'linear-gradient(180deg,#F8F9FC,#F1F3F9)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: dark ? '#818CF8' : '#6366F1' }}>{icon}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: dark ? '#F1F5F9' : '#0F172A', fontFamily: "'Inter',sans-serif" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: dark ? '#64748B' : '#64748B', marginTop: 1, fontFamily: "'Inter',sans-serif" }}>{subtitle}</div>}
          </div>
        </div>
        <SourceBadge source={source} dark={dark} />
      </div>
      <div style={{ padding: '20px 20px' }}>{children}</div>
    </div>
  );
}

/* ── Field component ────────────────────────────────────────────────────────── */
function Field({ label, value, onChange, placeholder, type = 'text', hint, dark, showToggle }) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputType = showToggle ? (show ? 'text' : 'password') : type;

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: dark ? '#64748B' : '#64748B', marginBottom: 5, fontFamily: "'Inter',sans-serif" }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={inputType}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: showToggle ? '9px 36px 9px 12px' : '9px 12px',
            borderRadius: 8,
            border: `1.5px solid ${focused ? '#6366F1' : (dark ? '#1E293B' : '#D1D5DB')}`,
            background: dark ? '#0B1220' : '#FFFFFF',
            color: dark ? '#F1F5F9' : '#111827',
            fontSize: 13, outline: 'none',
            fontFamily: "'Inter',monospace",
            transition: 'border-color 0.15s',
          }}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: dark ? '#64748B' : '#9CA3AF', padding: 0,
            }}
          >
            {show ? <IconEyeOff /> : <IconEye />}
          </button>
        )}
      </div>
      {hint && <div style={{ fontSize: 11, color: dark ? '#475569' : '#9CA3AF', marginTop: 4, fontFamily: "'Inter',sans-serif" }}>{hint}</div>}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */
export default function PlatformSmtpSmsPage() {
  const { isDark } = useTheme();
  const dark = isDark;

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);
  const [notice, setNotice]     = useState({ type: '', text: '' });
  const [testEmail, setTestEmail] = useState('');

  const [form, setForm] = useState({
    smtp_host: '', smtp_port: '587', smtp_user: '', smtp_from: '', smtp_pass: '',
    sms_user_id: '', sms_api_key: '', sms_sender_id: '',
    twilio_account_sid: '', twilio_auth_token: '', twilio_whatsapp_from: '',
  });
  const [sources, setSources] = useState({ smtp: 'none', sms: 'none', twilio: 'none' });

  const set = (field) => (val) => setForm(f => ({ ...f, [field]: val }));

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/platform/system/smtp-sms');
      const d = res.data;
      setForm({
        smtp_host:          d.smtp_host          || '',
        smtp_port:          String(d.smtp_port   || '587'),
        smtp_user:          d.smtp_user          || '',
        smtp_from:          d.smtp_from          || '',
        smtp_pass:          d.smtp_pass          || '',
        sms_user_id:        d.sms_user_id        || '',
        sms_api_key:        d.sms_api_key        || '',
        sms_sender_id:      d.sms_sender_id      || '',
        twilio_account_sid:   d.twilio_account_sid   || '',
        twilio_auth_token:    d.twilio_auth_token    || '',
        twilio_whatsapp_from: d.twilio_whatsapp_from || '',
      });
      setSources({ smtp: d.smtp_source, sms: d.sms_source, twilio: d.twilio_source });
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'Failed to load settings.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    setNotice({ type: '', text: '' });
    try {
      const res = await api.put('/platform/system/smtp-sms', {
        smtp_host:          form.smtp_host,
        smtp_port:          parseInt(form.smtp_port) || 587,
        smtp_user:          form.smtp_user,
        smtp_from:          form.smtp_from,
        smtp_pass:          form.smtp_pass,
        sms_user_id:        form.sms_user_id,
        sms_api_key:        form.sms_api_key,
        sms_sender_id:      form.sms_sender_id,
        twilio_account_sid:   form.twilio_account_sid,
        twilio_auth_token:    form.twilio_auth_token,
        twilio_whatsapp_from: form.twilio_whatsapp_from,
      });
      setSources({ smtp: res.data.smtp_source, sms: res.data.sms_source, twilio: res.data.twilio_source });
      setNotice({ type: 'success', text: 'Settings saved successfully.' });
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  const testSmtp = async () => {
    if (!testEmail.trim()) { setNotice({ type: 'error', text: 'Enter a test email address.' }); return; }
    setTesting(true);
    setNotice({ type: '', text: '' });
    try {
      const res = await api.post('/platform/system/smtp-sms/test', { to_email: testEmail.trim() });
      setNotice({ type: 'success', text: res.data.message });
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'SMTP test failed.' });
    } finally {
      setTesting(false);
    }
  };

  const bg   = dark ? '#060B14' : '#F0F2F5';
  const card = dark ? '#0B1220' : '#FFFFFF';

  return (
    <div style={{ minHeight: '100vh', background: bg, padding: '28px 28px 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: dark ? '#F1F5F9' : '#0F172A', fontFamily: "'Inter',sans-serif", letterSpacing: '-0.3px' }}>
            SMTP &amp; SMS Configuration
          </div>
          <div style={{ fontSize: 13, color: dark ? '#64748B' : '#64748B', marginTop: 4, fontFamily: "'Inter',sans-serif" }}>
            Platform-level email and messaging credentials. Tenants can override these from their own notification settings.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={load}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 14px', borderRadius: 8,
              background: dark ? '#1E293B' : '#FFFFFF',
              border: `1.5px solid ${dark ? '#334155' : '#D1D5DB'}`,
              color: dark ? '#94A3B8' : '#374151',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'Inter',sans-serif",
            }}
          >
            <IconRefresh /> Refresh
          </button>
          <button
            onClick={save}
            disabled={saving || loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 18px', borderRadius: 8,
              background: 'linear-gradient(135deg, #4F46E5, #6366F1)',
              border: 'none', color: '#FFFFFF',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
              fontFamily: "'Inter',sans-serif",
              opacity: saving || loading ? 0.7 : 1,
            }}
          >
            <IconSave /> {saving ? 'Saving…' : 'Save All'}
          </button>
        </div>
      </div>

      {/* Notice */}
      {notice.text && (
        <div style={{
          marginBottom: 20, padding: '11px 16px', borderRadius: 10,
          background: notice.type === 'success' ? (dark ? 'rgba(16,185,129,0.1)' : '#D1FAE5') : (dark ? 'rgba(239,68,68,0.1)' : '#FEE2E2'),
          border: `1px solid ${notice.type === 'success' ? (dark ? '#065F46' : '#6EE7B7') : (dark ? '#7F1D1D' : '#FCA5A5')}`,
          color: notice.type === 'success' ? (dark ? '#34D399' : '#065F46') : (dark ? '#F87171' : '#991B1B'),
          fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif",
        }}>
          {notice.type === 'success' ? '✓ ' : '✕ '}{notice.text}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: dark ? '#475569' : '#9CA3AF', fontSize: 14, fontFamily: "'Inter',sans-serif" }}>
          Loading settings…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── SMTP Section ── */}
          <Section title="SMTP / Email" subtitle="Outbound email for notifications, invoices and system messages" icon={<IconMail />} source={sources.smtp} dark={dark}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 0 }}>
              <Field label="SMTP Host" value={form.smtp_host} onChange={set('smtp_host')} placeholder="smtp.gmail.com" dark={dark} />
              <Field label="SMTP Port" value={form.smtp_port} onChange={set('smtp_port')} placeholder="587" type="number" dark={dark} hint="587 for TLS · 465 for SSL" />
              <Field label="SMTP Username / Email" value={form.smtp_user} onChange={set('smtp_user')} placeholder="no-reply@yourdomain.com" dark={dark} />
              <Field label="From Address (display)" value={form.smtp_from} onChange={set('smtp_from')} placeholder="Zane Salon <no-reply@yourdomain.com>" dark={dark} hint="Shown as sender name in email clients" />
              <Field label="SMTP Password / App Password" value={form.smtp_pass} onChange={set('smtp_pass')} placeholder="Enter new password or leave to keep existing" dark={dark} showToggle />
            </div>

            {/* Test SMTP */}
            <div style={{
              marginTop: 16, padding: '14px 16px', borderRadius: 10,
              background: dark ? '#0B1220' : '#F8F9FC',
              border: `1px solid ${dark ? '#1E293B' : '#E5E7EB'}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: dark ? '#64748B' : '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Inter',sans-serif" }}>
                Test SMTP Connection
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="email"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  placeholder="test@example.com"
                  style={{
                    flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 7,
                    border: `1.5px solid ${dark ? '#1E293B' : '#D1D5DB'}`,
                    background: dark ? '#060B14' : '#FFFFFF',
                    color: dark ? '#F1F5F9' : '#111827',
                    fontSize: 13, outline: 'none', fontFamily: "'Inter',sans-serif",
                  }}
                />
                <button
                  onClick={testSmtp}
                  disabled={testing}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 7,
                    background: dark ? '#1E293B' : '#EEF2FF',
                    border: `1.5px solid ${dark ? '#334155' : '#C7D2FE'}`,
                    color: dark ? '#818CF8' : '#4338CA',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Inter',sans-serif",
                    opacity: testing ? 0.6 : 1,
                  }}
                >
                  <IconTest /> {testing ? 'Sending…' : 'Send Test Email'}
                </button>
              </div>
            </div>
          </Section>

          {/* ── SMS Section ── */}
          <Section title="SMS Provider" subtitle="SMS gateway credentials (e.g. Notify.lk)" icon={<IconSms />} source={sources.sms} dark={dark}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 0 }}>
              <Field label="User ID" value={form.sms_user_id} onChange={set('sms_user_id')} placeholder="your-user-id" dark={dark} />
              <Field label="Sender ID" value={form.sms_sender_id} onChange={set('sms_sender_id')} placeholder="NotifyDemo" dark={dark} hint="Registered sender name shown on SMS" />
              <Field label="API Key" value={form.sms_api_key} onChange={set('sms_api_key')} placeholder="Enter new API key or leave to keep existing" dark={dark} showToggle />
            </div>
          </Section>

          {/* ── Twilio / WhatsApp Section ── */}
          <Section title="WhatsApp / Twilio" subtitle="Twilio credentials for WhatsApp messaging" icon={<IconPhone />} source={sources.twilio} dark={dark}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 0 }}>
              <Field label="Account SID" value={form.twilio_account_sid} onChange={set('twilio_account_sid')} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" dark={dark} />
              <Field label="WhatsApp From Number" value={form.twilio_whatsapp_from} onChange={set('twilio_whatsapp_from')} placeholder="+1234567890" dark={dark} hint="Must be a Twilio-registered WhatsApp number" />
              <Field label="Auth Token" value={form.twilio_auth_token} onChange={set('twilio_auth_token')} placeholder="Enter new auth token or leave to keep existing" dark={dark} showToggle />
            </div>
          </Section>

          {/* Info note */}
          <div style={{
            padding: '13px 16px', borderRadius: 10,
            background: dark ? 'rgba(99,102,241,0.08)' : '#EEF2FF',
            border: `1px solid ${dark ? 'rgba(99,102,241,0.2)' : '#C7D2FE'}`,
            fontSize: 12.5, color: dark ? '#818CF8' : '#4338CA',
            fontFamily: "'Inter',sans-serif", lineHeight: 1.6,
          }}>
            <strong>Note:</strong> These are platform-level defaults. Individual tenants can configure their own SMTP/SMS credentials from their <em>Notifications → Settings</em> page, which takes priority over these values. Passwords and secrets are stored securely and shown masked after saving.
          </div>

        </div>
      )}
    </div>
  );
}
