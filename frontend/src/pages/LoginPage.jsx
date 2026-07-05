import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MaintenancePage from './MaintenancePage';
import { normalizeBranding, resolveBrandName, resolveBrandLogo } from '../utils/branding';

const FEATURES = [
  { icon: '📅', title: 'Smart Scheduling', desc: 'Appointments, walk-ins & calendar in one place' },
  { icon: '💳', title: 'Payments & Packages', desc: 'Record payments, bundles & membership plans' },
  { icon: '🏢', title: 'Multi-Branch', desc: 'Manage every location from a single dashboard' },
  { icon: '🤖', title: 'AI Assistant', desc: 'Automate replies and grow customer engagement' },
];

const DARK = {
  bg: '#07080F',
  panel: '#0E1018',
  card: '#13151E',
  surface: '#1A1D28',
  border: '#252935',
  text: '#F4F2FF',
  muted: '#8B93A8',
  accent: '#A78BFA',
  accentDim: '#7C3AED',
  accentRgb: '124,58,237',
  showcase: 'linear-gradient(145deg, #1a0f2e 0%, #0f172a 45%, #07080F 100%)',
  inputBg: '#1A1D28',
  errBg: 'rgba(239,68,68,.10)',
  errBdr: 'rgba(239,68,68,.22)',
  errText: '#FCA5A5',
  successBg: 'rgba(16,185,129,.10)',
  successBdr: 'rgba(16,185,129,.25)',
  successTx: '#6EE7B7',
};

const LIGHT = {
  bg: '#F8F7FF',
  panel: '#FFFFFF',
  card: '#FFFFFF',
  surface: '#F3F0FF',
  border: '#E4DFFC',
  text: '#0F0A1E',
  muted: '#6B7280',
  accent: '#7C3AED',
  accentDim: '#6D28D9',
  accentRgb: '124,58,237',
  showcase: 'linear-gradient(145deg, #4C1D95 0%, #5B21B6 35%, #312E81 100%)',
  inputBg: '#FAFAFF',
  errBg: 'rgba(239,68,68,.07)',
  errBdr: 'rgba(239,68,68,.20)',
  errText: '#DC2626',
  successBg: 'rgba(16,185,129,.07)',
  successBdr: 'rgba(16,185,129,.22)',
  successTx: '#059669',
};

const STYLES = `
@keyframes loginFadeUp { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
@keyframes loginFloat { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }
@keyframes loginSpin { to { transform:rotate(360deg); } }
@keyframes loginShimmer { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }
@keyframes loginPulse { 0%,100% { opacity:.55; } 50% { opacity:1; } }

.login-shell {
  min-height: 100vh;
  display: flex;
  font-family: 'Inter', 'DM Sans', system-ui, sans-serif;
  background: var(--login-bg);
  color: var(--login-text);
}
.login-showcase {
  flex: 1.05;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 48px 56px;
  background: var(--login-showcase);
  color: #fff;
}
.login-showcase::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 20% 20%, rgba(167,139,250,.22) 0%, transparent 42%),
    radial-gradient(circle at 80% 80%, rgba(236,72,153,.12) 0%, transparent 40%),
    linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px);
  background-size: auto, auto, 48px 48px, 48px 48px;
  pointer-events: none;
}
.login-showcase > * { position: relative; z-index: 1; }
.login-panel {
  flex: 0 0 480px;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 40px 48px;
  background: var(--login-panel);
  border-left: 1px solid var(--login-border);
  position: relative;
}
.login-theme-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 42px;
  height: 42px;
  border-radius: 11px;
  border: 1.5px solid var(--login-border);
  background: var(--login-surface);
  color: var(--login-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .2s;
}
.login-theme-btn:hover {
  border-color: var(--login-accent);
  color: var(--login-accent);
}
.login-preview {
  margin-top: 36px;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.06);
  backdrop-filter: blur(16px);
  padding: 20px;
  box-shadow: 0 24px 64px rgba(0,0,0,.28);
  animation: loginFloat 6s ease-in-out infinite;
}
.login-feature {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 14px 0;
  border-bottom: 1px solid rgba(255,255,255,.08);
}
.login-feature:last-child { border-bottom: none; padding-bottom: 0; }
.login-form-card {
  width: 100%;
  max-width: 380px;
  margin: 0 auto;
  animation: loginFadeUp .6s ease-out both;
}
@media (max-width: 1024px) {
  .login-showcase { display: none; }
  .login-panel {
    flex: 1;
    border-left: none;
    padding: 32px 24px 40px;
  }
}
@media (max-width: 480px) {
  .login-panel { padding: 24px 18px 32px; }
}
`;

const IconSun = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);
const IconMoon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);
const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const IconLock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const IconEye = ({ open }) => open ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

function PreviewMock() {
  return (
    <div className="login-preview">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', opacity: .7 }}>Today&apos;s overview</span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34D399', animation: 'loginPulse 2s ease-in-out infinite' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Revenue', value: 'Rs. 84K', color: '#A78BFA' },
          { label: 'Bookings', value: '32', color: '#60A5FA' },
          { label: 'Walk-ins', value: '11', color: '#F472B6' },
        ].map((s) => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,.08)', borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, opacity: .65, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 12, padding: '12px 14px' }}>
        {['Haircut · 10:30 AM', 'Color · 11:45 AM', 'Spa · 2:00 PM'].map((row, i) => (
          <div key={row} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
            borderBottom: i < 2 ? '1px solid rgba(255,255,255,.06)' : 'none',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: i === 0 ? '#34D399' : i === 1 ? '#FBBF24' : '#A78BFA' }} />
            <span style={{ fontSize: 12, fontWeight: 500, opacity: .9 }}>{row}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LoginPage({ platformMode = false }) {
  const { login, logout, verify2FA } = useAuth();
  const navigate = useNavigate();

  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('salon-login-theme');
    return saved ? saved === 'dark' : false;
  });
  const P = dark ? DARK : LIGHT;

  const [form, setForm] = useState({ username: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [maintenance, setMaintenance] = useState({ enabled: false, message: '' });
  const [mounted, setMounted] = useState(false);
  const [branding, setBranding] = useState(normalizeBranding());

  const [step2fa, setStep2fa] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const [stepForgot, setStepForgot] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');

  const brandName = resolveBrandName(branding);
  const logoSrc = resolveBrandLogo(branding, 'login') || '/kogo.png?v=6';

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    localStorage.setItem('salon-login-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    let active = true;
    fetch('/api/branding/public')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (active && data) setBranding(normalizeBranding(data)); })
      .catch(() => {});
    fetch('/api/public/maintenance-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setMaintenance({ enabled: !!data.enabled, message: data.message || 'System is under maintenance. Please try again later.' });
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  if (maintenance.enabled) return <MaintenancePage />;

  const handleChange = (e) => { setForm((p) => ({ ...p, [e.target.name]: e.target.value })); setError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (maintenance.enabled) { setError(maintenance.message); return; }
    setLoading(true);
    setError('');
    try {
      const data = await login({ username: form.username.trim(), password: form.password });
      if (data?.requires2fa) { setTempToken(data.tempToken); setStep2fa(true); return; }
      if (platformMode && data?.user?.role !== 'platform_admin') { await logout(); setError('Platform admin account required.'); return; }
      navigate(data?.user?.role === 'platform_admin' ? '/platform/dashboard' : '/dashboard');
    } catch (err) {
      setError(err?.response?.data?.message || 'Login failed. Please try again.');
    } finally { setLoading(false); }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setForgotError('');
    if (!forgotUsername.trim()) { setForgotError('Please enter your username.'); return; }
    setForgotLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: forgotUsername.trim() }),
      });
      setForgotSent(true);
    } catch { setForgotError('Something went wrong. Please try again.'); }
    setForgotLoading(false);
  };

  const handleTotp = async (e) => {
    e.preventDefault();
    if (totpCode.length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await verify2FA({ tempToken, code: totpCode });
      if (platformMode && data?.user?.role !== 'platform_admin') { await logout(); setError('Platform admin account required.'); return; }
      navigate(data?.user?.role === 'platform_admin' ? '/platform/dashboard' : '/dashboard');
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid code. Please try again.');
    } finally { setLoading(false); }
  };

  const cssVars = {
    '--login-bg': P.bg,
    '--login-panel': P.panel,
    '--login-card': P.card,
    '--login-surface': P.surface,
    '--login-border': P.border,
    '--login-text': P.text,
    '--login-muted': P.muted,
    '--login-accent': P.accent,
    '--login-showcase': P.showcase,
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 14px 12px 42px',
    borderRadius: 11,
    fontSize: 14.5,
    color: P.text,
    background: P.inputBg,
    outline: 'none',
    border: `1.5px solid ${P.border}`,
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color .2s, box-shadow .2s',
  };
  const focusInput = (e) => {
    e.target.style.borderColor = P.accent;
    e.target.style.boxShadow = `0 0 0 3px rgba(${P.accentRgb},.14)`;
  };
  const blurInput = (e) => {
    e.target.style.borderColor = P.border;
    e.target.style.boxShadow = 'none';
  };
  const iconStyle = {
    position: 'absolute',
    left: 13,
    top: '50%',
    transform: 'translateY(-50%)',
    color: P.muted,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
  };

  const btnPrimary = (disabled) => ({
    width: '100%',
    padding: '13px 16px',
    borderRadius: 11,
    border: 'none',
    background: disabled
      ? P.surface
      : `linear-gradient(135deg, ${P.accent}, ${P.accentDim})`,
    color: disabled ? P.muted : '#FFFFFF',
    fontSize: 14.5,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'transform .18s, box-shadow .18s',
    fontFamily: 'inherit',
    boxShadow: disabled ? 'none' : `0 8px 24px rgba(${P.accentRgb},.28)`,
  });

  const sectionTitle = (t) => (
    <div style={{ marginBottom: 28 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: P.text, letterSpacing: '-.02em', lineHeight: 1.2 }}>
        {t.title}
      </h1>
      <p style={{ margin: '8px 0 0', fontSize: 14, color: P.muted, lineHeight: 1.5 }}>{t.sub}</p>
    </div>
  );

  const alertBox = (msg, type = 'error') => (
    <div style={{
      padding: '11px 14px',
      borderRadius: 11,
      marginBottom: 18,
      background: type === 'error' ? P.errBg : P.successBg,
      border: `1px solid ${type === 'error' ? P.errBdr : P.successBdr}`,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      fontWeight: 500,
      color: type === 'error' ? P.errText : P.successTx,
    }}>
      {msg}
    </div>
  );

  return (
    <div className="login-shell" style={cssVars}>
      <style>{STYLES}</style>

      {/* ── Left: SaaS showcase ── */}
      <aside className="login-showcase">
        <div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 99,
            background: 'rgba(255,255,255,.1)',
            border: '1px solid rgba(255,255,255,.14)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            marginBottom: 28,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34D399' }} />
            {platformMode ? 'Platform Console' : 'Salon Management SaaS'}
          </div>
          <h2 style={{
            margin: 0,
            fontSize: 'clamp(28px, 3.2vw, 40px)',
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-.03em',
            maxWidth: 480,
          }}>
            {platformMode
              ? 'Manage your entire salon platform from one place'
              : `Run your salon smarter with ${brandName}`}
          </h2>
          <p style={{ margin: '16px 0 0', fontSize: 15, lineHeight: 1.65, opacity: .78, maxWidth: 440 }}>
            {platformMode
              ? 'Tenant management, subscriptions, monitoring and system controls — built for scale.'
              : 'Appointments, payments, inventory, loyalty and AI — everything your team needs in one cloud platform.'}
          </p>
          <div style={{ marginTop: 32 }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="login-feature">
                <span style={{ fontSize: 20, lineHeight: 1 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{f.title}</div>
                  <div style={{ fontSize: 13, opacity: .72, lineHeight: 1.45 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <PreviewMock />
          <p style={{ marginTop: 20, fontSize: 12, opacity: .55, textAlign: 'center' }}>
            Secure · Cloud-hosted · Built by Hexalyte Innovation
          </p>
        </div>
      </aside>

      {/* ── Right: Login panel ── */}
      <main className="login-panel">
        <button
          type="button"
          className="login-theme-btn"
          onClick={() => setDark((d) => !d)}
          title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {dark ? <IconSun /> : <IconMoon />}
        </button>

        <div className="login-form-card" style={{ opacity: mounted ? 1 : 0 }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <img
              src={logoSrc}
              alt={brandName}
              style={{ width: 72, height: 72, objectFit: 'contain', display: 'inline-block' }}
              onError={(e) => { e.currentTarget.src = '/kogo.png?v=6'; }}
            />
            <div style={{ marginTop: 10, fontSize: 18, fontWeight: 800, color: P.text, letterSpacing: '-.02em' }}>
              {brandName}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: P.muted, fontWeight: 500 }}>
              {platformMode ? 'Platform Administration' : 'Sign in to your workspace'}
            </div>
          </div>

          {maintenance.enabled && alertBox(`⚠️ ${maintenance.message}`)}
          {error && alertBox(error)}

          {/* Login */}
          {!step2fa && !stepForgot && (
            <>
              {sectionTitle({
                title: platformMode ? 'Platform sign in' : 'Welcome back',
                sub: platformMode
                  ? 'Enter your platform admin credentials'
                  : 'Enter your credentials to access the dashboard',
              })}
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: P.muted, marginBottom: 6 }}>
                    Username
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={iconStyle}><IconUser /></span>
                    <input
                      name="username"
                      value={form.username}
                      onChange={handleChange}
                      placeholder="you@salon.com"
                      autoFocus
                      autoComplete="username"
                      style={inputStyle}
                      onFocus={focusInput}
                      onBlur={blurInput}
                      required
                    />
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: P.muted, marginBottom: 6 }}>
                    Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={iconStyle}><IconLock /></span>
                    <input
                      name="password"
                      value={form.password}
                      onChange={handleChange}
                      type={showPw ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      style={{ ...inputStyle, paddingRight: 44 }}
                      onFocus={focusInput}
                      onBlur={blurInput}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: P.muted,
                        padding: 3, display: 'flex', alignItems: 'center',
                      }}
                    >
                      <IconEye open={showPw} />
                    </button>
                  </div>
                </div>
                <div style={{ textAlign: 'right', marginBottom: 22 }}>
                  <button
                    type="button"
                    onClick={() => { setStepForgot(true); setForgotSent(false); setForgotUsername(''); setForgotError(''); }}
                    style={{ background: 'none', border: 'none', color: P.accent, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                  >
                    Forgot password?
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={loading || maintenance.enabled}
                  style={btnPrimary(loading || maintenance.enabled)}
                  onMouseEnter={(e) => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {loading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                      <span style={{
                        width: 16, height: 16,
                        border: '2px solid rgba(255,255,255,0.35)',
                        borderTopColor: '#fff',
                        borderRadius: '50%',
                        display: 'inline-block',
                        animation: 'loginSpin .8s linear infinite',
                      }} />
                      Signing in…
                    </span>
                  ) : 'Sign in to dashboard'}
                </button>
              </form>
            </>
          )}

          {/* Forgot password */}
          {stepForgot && (
            <>
              {sectionTitle({ title: 'Reset password', sub: 'We\'ll send a reset link if your account has an email on file' })}
              {forgotError && alertBox(forgotError)}
              {forgotSent ? (
                <div style={{ padding: '20px 16px', borderRadius: 14, background: P.successBg, border: `1px solid ${P.successBdr}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📧</div>
                  <p style={{ margin: 0, color: P.successTx, fontSize: 14, fontWeight: 700 }}>Check your email</p>
                  <p style={{ margin: '6px 0 0', color: P.muted, fontSize: 13 }}>
                    If an account was found, a reset link has been sent.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleForgot}>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: P.muted, marginBottom: 6 }}>Username</label>
                    <div style={{ position: 'relative' }}>
                      <span style={iconStyle}><IconUser /></span>
                      <input
                        value={forgotUsername}
                        onChange={(e) => { setForgotUsername(e.target.value); setForgotError(''); }}
                        placeholder="Enter your username"
                        autoFocus
                        autoComplete="username"
                        style={inputStyle}
                        onFocus={focusInput}
                        onBlur={blurInput}
                        required
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={forgotLoading} style={btnPrimary(forgotLoading)}>
                    {forgotLoading ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>
              )}
              <button
                type="button"
                onClick={() => setStepForgot(false)}
                style={{ width: '100%', marginTop: 14, padding: 10, borderRadius: 11, border: 'none', background: 'none', color: P.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
              >
                ← Back to sign in
              </button>
            </>
          )}

          {/* 2FA */}
          {step2fa && (
            <>
              {sectionTitle({ title: 'Two-factor authentication', sub: 'Enter the 6-digit code from your authenticator app' })}
              <form onSubmit={handleTotp}>
                <div style={{ marginBottom: 22 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: P.muted, marginBottom: 6 }}>Verification code</label>
                  <input
                    value={totpCode}
                    onChange={(e) => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    style={{ ...inputStyle, paddingLeft: 16, textAlign: 'center', fontSize: 26, fontWeight: 800, letterSpacing: 12, fontFamily: 'monospace' }}
                    onFocus={focusInput}
                    onBlur={blurInput}
                    required
                  />
                </div>
                <button type="submit" disabled={loading || totpCode.length !== 6} style={btnPrimary(loading || totpCode.length !== 6)}>
                  {loading ? 'Verifying…' : 'Verify & sign in'}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep2fa(false); setTempToken(''); setTotpCode(''); setError(''); }}
                  style={{ width: '100%', marginTop: 10, padding: 10, borderRadius: 11, border: 'none', background: 'none', color: P.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                >
                  ← Back to sign in
                </button>
              </form>
            </>
          )}

          <div style={{ marginTop: 36, paddingTop: 20, borderTop: `1px solid ${P.border}`, textAlign: 'center', fontSize: 12, color: P.muted }}>
            <span style={{ fontWeight: 600 }}>{brandName}</span>
            <span style={{ margin: '0 8px', opacity: .35 }}>·</span>
            <span>Powered by Hexalyte Innovation</span>
          </div>
        </div>
      </main>
    </div>
  );
}
