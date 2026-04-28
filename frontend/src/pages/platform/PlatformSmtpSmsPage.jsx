import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';

/* ── SVG Icons ──────────────────────────────────────────────────────────────── */
const IcoMail = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);
const IcoSms = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const IcoWhatsApp = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);
const IcoRefresh = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);
const IcoSave = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
  </svg>
);
const IcoSend = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);
const IcoEye = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const IcoEyeOff = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);
const IcoCheck = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IcoInfo = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

/* ── Source Status Badge ─────────────────────────────────────────────────────── */
function StatusBadge({ source, dark }) {
  const cfg = {
    db:   { label: 'DB Override', dot: '#10B981', bg: dark ? 'rgba(16,185,129,0.12)' : '#D1FAE5', text: dark ? '#34D399' : '#065F46', border: dark ? 'rgba(16,185,129,0.25)' : '#6EE7B7' },
    env:  { label: '.env Default', dot: '#3B82F6', bg: dark ? 'rgba(59,130,246,0.12)' : '#DBEAFE', text: dark ? '#60A5FA' : '#1E40AF', border: dark ? 'rgba(59,130,246,0.25)' : '#93C5FD' },
    none: { label: 'Not Configured', dot: '#EF4444', bg: dark ? 'rgba(239,68,68,0.1)' : '#FEE2E2', text: dark ? '#F87171' : '#991B1B', border: dark ? 'rgba(239,68,68,0.22)' : '#FCA5A5' },
  };
  const c = cfg[source] || cfg.none;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      letterSpacing: '0.02em', fontFamily: "'Inter',sans-serif",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, display: 'inline-block', flexShrink: 0 }} />
      {c.label}
    </span>
  );
}

/* ── Tab Button ──────────────────────────────────────────────────────────────── */
function Tab({ label, icon, active, source, dark, onClick }) {
  const dotColor = source === 'db' ? '#10B981' : source === 'env' ? '#3B82F6' : '#EF4444';
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
        background: active
          ? (dark ? 'rgba(99,102,241,0.15)' : '#EEF2FF')
          : 'transparent',
        color: active
          ? (dark ? '#818CF8' : '#4338CA')
          : (dark ? '#64748B' : '#6B7280'),
        fontWeight: active ? 700 : 500, fontSize: 13,
        fontFamily: "'Inter',sans-serif",
        transition: 'all 0.15s',
        outline: 'none', position: 'relative',
        borderBottom: active ? `2px solid ${dark ? '#818CF8' : '#6366F1'}` : '2px solid transparent',
      }}
    >
      <span style={{ color: active ? (dark ? '#818CF8' : '#6366F1') : (dark ? '#475569' : '#9CA3AF') }}>{icon}</span>
      {label}
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: dotColor,
        marginLeft: 2, flexShrink: 0,
        boxShadow: source !== 'none' ? `0 0 5px ${dotColor}` : 'none',
      }} />
    </button>
  );
}

/* ── Field ───────────────────────────────────────────────────────────────────── */
function Field({ label, value, onChange, placeholder, type = 'text', hint, dark, showToggle, required }) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputType = showToggle ? (show ? 'text' : 'password') : type;

  return (
    <div>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
        color: dark ? '#94A3B8' : '#6B7280', marginBottom: 6,
        fontFamily: "'Inter',sans-serif",
      }}>
        {label}
        {required && <span style={{ color: '#EF4444', fontSize: 10 }}>*</span>}
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
            padding: showToggle ? '10px 38px 10px 13px' : '10px 13px',
            borderRadius: 9,
            border: `1.5px solid ${focused
              ? (dark ? '#818CF8' : '#6366F1')
              : (dark ? '#1E293B' : '#E2E8F0')}`,
            background: dark
              ? (focused ? '#0F1929' : '#080E1A')
              : (focused ? '#FAFBFF' : '#F8FAFC'),
            color: dark ? '#F1F5F9' : '#0F172A',
            fontSize: 13, outline: 'none',
            fontFamily: "'Inter',monospace",
            transition: 'border-color 0.15s, background 0.15s',
            boxShadow: focused ? (dark ? '0 0 0 3px rgba(129,140,248,0.12)' : '0 0 0 3px rgba(99,102,241,0.08)') : 'none',
          }}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            style={{
              position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: dark ? '#475569' : '#94A3B8',
              display: 'flex', alignItems: 'center',
            }}
          >
            {show ? <IcoEyeOff /> : <IcoEye />}
          </button>
        )}
      </div>
      {hint && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 11, color: dark ? '#475569' : '#94A3B8', marginTop: 5,
          fontFamily: "'Inter',sans-serif",
        }}>
          <IcoInfo size={11} />
          {hint}
        </div>
      )}
    </div>
  );
}

/* ── Divider ─────────────────────────────────────────────────────────────────── */
function Divider({ label, dark }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 18px' }}>
      <div style={{ flex: 1, height: 1, background: dark ? '#1E293B' : '#E5E7EB' }} />
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: dark ? '#334155' : '#CBD5E1', fontFamily: "'Inter',sans-serif" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: dark ? '#1E293B' : '#E5E7EB' }} />
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────────── */
export default function PlatformSmtpSmsPage() {
  const { isDark } = useTheme();
  const dark = isDark;

  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [testing, setTesting]     = useState(false);
  const [notice, setNotice]       = useState({ type: '', text: '' });
  const [testEmail, setTestEmail] = useState('');
  const [activeTab, setActiveTab] = useState('smtp');

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
        smtp_host:            d.smtp_host            || '',
        smtp_port:            String(d.smtp_port     || '587'),
        smtp_user:            d.smtp_user            || '',
        smtp_from:            d.smtp_from            || '',
        smtp_pass:            d.smtp_pass            || '',
        sms_user_id:          d.sms_user_id          || '',
        sms_api_key:          d.sms_api_key          || '',
        sms_sender_id:        d.sms_sender_id        || '',
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
        smtp_host:            form.smtp_host,
        smtp_port:            parseInt(form.smtp_port) || 587,
        smtp_user:            form.smtp_user,
        smtp_from:            form.smtp_from,
        smtp_pass:            form.smtp_pass,
        sms_user_id:          form.sms_user_id,
        sms_api_key:          form.sms_api_key,
        sms_sender_id:        form.sms_sender_id,
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

  const bg = dark ? '#060B14' : '#F0F2F7';

  /* ── Tab config ── */
  const TABS = [
    { id: 'smtp',    label: 'SMTP / Email',       icon: <IcoMail size={16} />,     source: sources.smtp },
    { id: 'sms',     label: 'SMS (Notify.lk)',     icon: <IcoSms size={16} />,      source: sources.sms },
    { id: 'twilio',  label: 'WhatsApp / Twilio',   icon: <IcoWhatsApp size={16} />, source: sources.twilio },
  ];

  return (
    <div style={{ minHeight: '100vh', background: bg, padding: '28px 28px 64px', fontFamily: "'Inter',sans-serif" }}>

      {/* ── Page Header ── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
          }}>
            <IcoMail size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: dark ? '#F1F5F9' : '#0F172A', letterSpacing: '-0.3px' }}>
              SMTP &amp; SMS Configuration
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: dark ? '#64748B' : '#6B7280' }}>
              Platform-level messaging credentials · Tenants can override from their own Notifications settings
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={load}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 14px', borderRadius: 9,
              background: dark ? '#1E293B' : '#FFFFFF',
              border: `1.5px solid ${dark ? '#334155' : '#E2E8F0'}`,
              color: dark ? '#94A3B8' : '#374151',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              boxShadow: dark ? 'none' : '0 1px 4px rgba(15,23,42,0.07)',
              opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s',
            }}
          >
            <IcoRefresh size={13} /> Refresh
          </button>
          <button
            onClick={save}
            disabled={saving || loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 20px', borderRadius: 9,
              background: saving || loading ? (dark ? '#334155' : '#C7D2FE') : 'linear-gradient(135deg, #4F46E5, #6366F1)',
              border: 'none', color: '#FFFFFF',
              fontSize: 13, fontWeight: 700, cursor: saving || loading ? 'not-allowed' : 'pointer',
              boxShadow: saving || loading ? 'none' : '0 2px 10px rgba(99,102,241,0.4)',
              transition: 'all 0.15s',
            }}
          >
            <IcoSave size={14} /> {saving ? 'Saving…' : 'Save All'}
          </button>
        </div>
      </div>

      {/* ── Notice Banner ── */}
      {notice.text && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 10,
          background: notice.type === 'success'
            ? (dark ? 'rgba(16,185,129,0.1)' : '#D1FAE5')
            : (dark ? 'rgba(239,68,68,0.1)' : '#FEE2E2'),
          border: `1px solid ${notice.type === 'success'
            ? (dark ? 'rgba(16,185,129,0.25)' : '#6EE7B7')
            : (dark ? 'rgba(239,68,68,0.25)' : '#FCA5A5')}`,
          color: notice.type === 'success'
            ? (dark ? '#34D399' : '#065F46')
            : (dark ? '#F87171' : '#991B1B'),
          fontSize: 13, fontWeight: 600,
        }}>
          <span style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            background: notice.type === 'success' ? '#10B981' : '#EF4444',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}>
            {notice.type === 'success' ? <IcoCheck size={12} /> : <span style={{ fontSize: 12, fontWeight: 900 }}>✕</span>}
          </span>
          {notice.text}
          <button
            onClick={() => setNotice({ type: '', text: '' })}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'inherit', opacity: 0.6, lineHeight: 1 }}
          >×</button>
        </div>
      )}

      {loading ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: 300, gap: 14,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            border: `3px solid ${dark ? '#1E293B' : '#E5E7EB'}`,
            borderTopColor: '#6366F1', animation: 'spin 0.7s linear infinite',
          }} />
          <span style={{ fontSize: 13, color: dark ? '#475569' : '#9CA3AF' }}>Loading settings…</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* ── Status Overview Row ── */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20,
          }}>
            {TABS.map(tab => {
              const isActive = tab.source !== 'none';
              return (
                <div
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    borderRadius: 12, cursor: 'pointer',
                    border: `1.5px solid ${activeTab === tab.id
                      ? (dark ? '#818CF8' : '#6366F1')
                      : (dark ? '#1E293B' : '#E5E7EB')}`,
                    background: activeTab === tab.id
                      ? (dark ? 'rgba(99,102,241,0.1)' : '#EEF2FF')
                      : (dark ? '#0B1220' : '#FFFFFF'),
                    padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    boxShadow: activeTab === tab.id
                      ? (dark ? '0 0 0 1px rgba(129,140,248,0.2)' : '0 0 0 3px rgba(99,102,241,0.1)')
                      : (dark ? 'none' : '0 1px 4px rgba(15,23,42,0.05)'),
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive
                      ? (tab.id === 'smtp' ? 'rgba(99,102,241,0.12)' : tab.id === 'sms' ? 'rgba(16,185,129,0.12)' : 'rgba(20,184,166,0.12)')
                      : (dark ? 'rgba(255,255,255,0.04)' : '#F1F5F9'),
                    color: isActive
                      ? (tab.id === 'smtp' ? '#6366F1' : tab.id === 'sms' ? '#10B981' : '#14B8A6')
                      : (dark ? '#475569' : '#9CA3AF'),
                  }}>
                    {tab.icon}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: dark ? '#F1F5F9' : '#0F172A', whiteSpace: 'nowrap' }}>
                      {tab.label}
                    </div>
                    <StatusBadge source={tab.source} dark={dark} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Tab Bar ── */}
          <div style={{
            display: 'flex', gap: 2, borderRadius: 12,
            background: dark ? '#0B1220' : '#FFFFFF',
            border: `1px solid ${dark ? '#1E293B' : '#E5E7EB'}`,
            padding: '6px 8px',
            marginBottom: 16,
            boxShadow: dark ? 'none' : '0 1px 4px rgba(15,23,42,0.05)',
          }}>
            {TABS.map(tab => (
              <Tab
                key={tab.id}
                label={tab.label}
                icon={tab.icon}
                active={activeTab === tab.id}
                source={tab.source}
                dark={dark}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </div>

          {/* ── SMTP Panel ── */}
          {activeTab === 'smtp' && (
            <div style={{
              borderRadius: 16,
              border: `1px solid ${dark ? '#1E293B' : '#E5E7EB'}`,
              background: dark ? '#0B1220' : '#FFFFFF',
              boxShadow: dark ? '0 4px 24px rgba(0,0,0,0.2)' : '0 4px 20px rgba(15,23,42,0.07)',
              overflow: 'hidden',
            }}>
              {/* Card Header */}
              <div style={{
                padding: '16px 22px',
                background: dark
                  ? 'linear-gradient(135deg, #0B1220 0%, #111827 100%)'
                  : 'linear-gradient(135deg, #F0F4FF 0%, #EEF2FF 100%)',
                borderBottom: `1px solid ${dark ? '#1E293B' : '#E0E7FF'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: 'linear-gradient(135deg, #4F46E5, #6366F1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 3px 10px rgba(99,102,241,0.35)', color: '#fff',
                  }}>
                    <IcoMail size={17} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: dark ? '#F1F5F9' : '#0F172A' }}>SMTP / Email</div>
                    <div style={{ fontSize: 12, color: dark ? '#64748B' : '#6B7280', marginTop: 1 }}>
                      Outbound email · notifications, invoices, system messages
                    </div>
                  </div>
                </div>
                <StatusBadge source={sources.smtp} dark={dark} />
              </div>

              {/* Card Body */}
              <div style={{ padding: '24px 22px' }}>
                <Divider label="Server" dark={dark} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 14, marginBottom: 14 }}>
                  <Field label="SMTP Host" value={form.smtp_host} onChange={set('smtp_host')} placeholder="smtp.gmail.com" dark={dark} required />
                  <Field label="Port" value={form.smtp_port} onChange={set('smtp_port')} placeholder="587" type="number" dark={dark} hint="587 TLS · 465 SSL" />
                </div>

                <Divider label="Authentication" dark={dark} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <Field label="SMTP Username / Email" value={form.smtp_user} onChange={set('smtp_user')} placeholder="no-reply@yourdomain.com" dark={dark} required />
                  <Field label="Password / App Password" value={form.smtp_pass} onChange={set('smtp_pass')} placeholder="Leave blank to keep existing" dark={dark} showToggle />
                </div>

                <Divider label="Display" dark={dark} />
                <Field label="From Address (sender display name)" value={form.smtp_from} onChange={set('smtp_from')} placeholder='HEXA SALON <no-reply@yourdomain.com>' dark={dark} hint="Shown as sender name in email clients" />

                {/* Test Panel */}
                <div style={{
                  marginTop: 20, padding: '16px 18px', borderRadius: 12,
                  background: dark ? 'rgba(99,102,241,0.06)' : '#F5F7FF',
                  border: `1px dashed ${dark ? 'rgba(99,102,241,0.2)' : '#C7D2FE'}`,
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
                    color: dark ? '#818CF8' : '#4338CA', marginBottom: 10,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <IcoSend size={11} /> Test SMTP Connection
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      type="email"
                      value={testEmail}
                      onChange={e => setTestEmail(e.target.value)}
                      placeholder="Send test email to…"
                      style={{
                        flex: 1, minWidth: 200, padding: '9px 13px', borderRadius: 8,
                        border: `1.5px solid ${dark ? '#1E293B' : '#C7D2FE'}`,
                        background: dark ? '#060B14' : '#FFFFFF',
                        color: dark ? '#F1F5F9' : '#111827',
                        fontSize: 13, outline: 'none', fontFamily: "'Inter',sans-serif",
                      }}
                    />
                    <button
                      onClick={testSmtp}
                      disabled={testing}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '9px 18px', borderRadius: 8,
                        background: testing
                          ? (dark ? '#1E293B' : '#EEF2FF')
                          : 'linear-gradient(135deg, #4F46E5, #6366F1)',
                        border: 'none',
                        color: testing ? (dark ? '#64748B' : '#6366F1') : '#fff',
                        fontSize: 13, fontWeight: 700, cursor: testing ? 'not-allowed' : 'pointer',
                        boxShadow: testing ? 'none' : '0 2px 8px rgba(99,102,241,0.35)',
                        fontFamily: "'Inter',sans-serif",
                      }}
                    >
                      <IcoSend size={13} /> {testing ? 'Sending…' : 'Send Test Email'}
                    </button>
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: 11.5, color: dark ? '#475569' : '#6B7280', lineHeight: 1.5 }}>
                    Sends a live test email using the credentials above. Save settings first before testing.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── SMS Panel ── */}
          {activeTab === 'sms' && (
            <div style={{
              borderRadius: 16,
              border: `1px solid ${dark ? '#1E293B' : '#E5E7EB'}`,
              background: dark ? '#0B1220' : '#FFFFFF',
              boxShadow: dark ? '0 4px 24px rgba(0,0,0,0.2)' : '0 4px 20px rgba(15,23,42,0.07)',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '16px 22px',
                background: dark
                  ? 'linear-gradient(135deg, #0B1220 0%, #0D1F18 100%)'
                  : 'linear-gradient(135deg, #F0FDF9 0%, #ECFDF5 100%)',
                borderBottom: `1px solid ${dark ? '#1E293B' : '#BBF7D0'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: 'linear-gradient(135deg, #059669, #10B981)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 3px 10px rgba(16,185,129,0.35)', color: '#fff',
                  }}>
                    <IcoSms size={17} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: dark ? '#F1F5F9' : '#0F172A' }}>SMS Provider</div>
                    <div style={{ fontSize: 12, color: dark ? '#64748B' : '#6B7280', marginTop: 1 }}>
                      Notify.lk gateway · appointment reminders & OTPs
                    </div>
                  </div>
                </div>
                <StatusBadge source={sources.sms} dark={dark} />
              </div>

              <div style={{ padding: '24px 22px' }}>
                <Divider label="Notify.lk Credentials" dark={dark} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <Field label="User ID" value={form.sms_user_id} onChange={set('sms_user_id')} placeholder="your-notify-user-id" dark={dark} required />
                  <Field label="Sender ID" value={form.sms_sender_id} onChange={set('sms_sender_id')} placeholder="NotifyDemo" dark={dark} hint="Registered sender name shown on SMS" />
                </div>
                <Field label="API Key" value={form.sms_api_key} onChange={set('sms_api_key')} placeholder="Leave blank to keep existing API key" dark={dark} showToggle required />

                <div style={{
                  marginTop: 20, padding: '13px 16px', borderRadius: 10,
                  background: dark ? 'rgba(16,185,129,0.06)' : '#F0FDF9',
                  border: `1px dashed ${dark ? 'rgba(16,185,129,0.2)' : '#6EE7B7'}`,
                  fontSize: 12, color: dark ? '#34D399' : '#059669', lineHeight: 1.6,
                }}>
                  <strong>Notify.lk</strong> — Obtain credentials from your{' '}
                  <a href="https://app.notify.lk" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                    Notify.lk dashboard
                  </a>
                  . The Sender ID must be registered and approved before use.
                </div>
              </div>
            </div>
          )}

          {/* ── Twilio / WhatsApp Panel ── */}
          {activeTab === 'twilio' && (
            <div style={{
              borderRadius: 16,
              border: `1px solid ${dark ? '#1E293B' : '#E5E7EB'}`,
              background: dark ? '#0B1220' : '#FFFFFF',
              boxShadow: dark ? '0 4px 24px rgba(0,0,0,0.2)' : '0 4px 20px rgba(15,23,42,0.07)',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '16px 22px',
                background: dark
                  ? 'linear-gradient(135deg, #0B1220 0%, #0C1A1E 100%)'
                  : 'linear-gradient(135deg, #F0FDFC 0%, #CCFBF1 100%)',
                borderBottom: `1px solid ${dark ? '#1E293B' : '#99F6E4'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: 'linear-gradient(135deg, #0D9488, #14B8A6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 3px 10px rgba(20,184,166,0.35)', color: '#fff',
                  }}>
                    <IcoWhatsApp size={17} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: dark ? '#F1F5F9' : '#0F172A' }}>WhatsApp / Twilio</div>
                    <div style={{ fontSize: 12, color: dark ? '#64748B' : '#6B7280', marginTop: 1 }}>
                      Twilio credentials · WhatsApp Business messaging
                    </div>
                  </div>
                </div>
                <StatusBadge source={sources.twilio} dark={dark} />
              </div>

              <div style={{ padding: '24px 22px' }}>
                <Divider label="Twilio Account" dark={dark} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <Field label="Account SID" value={form.twilio_account_sid} onChange={set('twilio_account_sid')} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" dark={dark} required />
                  <Field label="WhatsApp From Number" value={form.twilio_whatsapp_from} onChange={set('twilio_whatsapp_from')} placeholder="+1234567890" dark={dark} hint="Twilio-registered WhatsApp number" required />
                </div>
                <Field label="Auth Token" value={form.twilio_auth_token} onChange={set('twilio_auth_token')} placeholder="Leave blank to keep existing auth token" dark={dark} showToggle required />

                <div style={{
                  marginTop: 20, padding: '13px 16px', borderRadius: 10,
                  background: dark ? 'rgba(20,184,166,0.06)' : '#F0FDFC',
                  border: `1px dashed ${dark ? 'rgba(20,184,166,0.2)' : '#5EEAD4'}`,
                  fontSize: 12, color: dark ? '#2DD4BF' : '#0D9488', lineHeight: 1.6,
                }}>
                  <strong>WhatsApp Business via Twilio</strong> — The From Number must be approved in your{' '}
                  <a href="https://console.twilio.com" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                    Twilio Console
                  </a>{' '}
                  for WhatsApp. Sandbox numbers work for testing only.
                </div>
              </div>
            </div>
          )}

          {/* ── Footer Note ── */}
          <div style={{
            marginTop: 20, padding: '14px 18px', borderRadius: 12,
            background: dark ? 'rgba(99,102,241,0.07)' : '#EEF2FF',
            border: `1px solid ${dark ? 'rgba(99,102,241,0.15)' : '#C7D2FE'}`,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <span style={{ color: dark ? '#818CF8' : '#6366F1', flexShrink: 0, marginTop: 1 }}><IcoInfo size={15} /></span>
            <p style={{ margin: 0, fontSize: 12.5, color: dark ? '#818CF8' : '#4338CA', lineHeight: 1.6 }}>
              <strong>Platform defaults:</strong> These credentials are used when a tenant has not configured their own.
              Individual tenants can override from <em>Notifications → Settings</em>. Passwords and secrets are stored
              encrypted and shown masked after saving.
            </p>
          </div>

        </div>
      )}
    </div>
  );
}
