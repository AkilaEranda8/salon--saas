import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MaintenancePage from './MaintenancePage';
import { normalizeBranding, resolveBrandName, resolveBrandLogo } from '../utils/branding';

const FEATURES = [
  { title: 'Scheduling', desc: 'Appointments & walk-ins' },
  { title: 'Payments', desc: 'Packages & billing' },
  { title: 'Multi-Branch', desc: 'All locations, one hub' },
  { title: 'AI Assistant', desc: 'Smart customer replies' },
];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');

@keyframes lp-in   { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:none; } }
@keyframes lp-spin { to { transform:rotate(360deg); } }
@keyframes lp-glow { 0%,100% { opacity:.45; } 50% { opacity:.85; } }
@keyframes lp-drift { 0%,100% { transform:translate(0,0); } 50% { transform:translate(0,-12px); } }

.lp-root {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 480px;
  font-family: 'Inter', system-ui, sans-serif;
  background: var(--lp-bg);
  color: var(--lp-text);
}
.lp-hero {
  position: relative;
  overflow: hidden;
  padding: 40px 48px 44px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  background: var(--lp-hero-bg);
  color: #fff;
}
.lp-hero-mesh {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 10% 0%, rgba(167,139,250,.35), transparent 55%),
    radial-gradient(ellipse 60% 50% at 90% 100%, rgba(236,72,153,.2), transparent 50%),
    radial-gradient(ellipse 50% 40% at 70% 20%, rgba(59,130,246,.15), transparent 45%);
  pointer-events: none;
}
.lp-hero-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: linear-gradient(180deg, #000 0%, transparent 90%);
  pointer-events: none;
}
.lp-hero > * { position: relative; z-index: 1; }
.lp-hero h1, .lp-hero h2, .lp-hero h3 {
  color: #FFFFFF !important;
  font-family: 'Plus Jakarta Sans', sans-serif !important;
}
.lp-hero-inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 28px;
  align-items: start;
  margin-top: 28px;
  width: 100%;
  max-width: 920px;
}
.lp-brand-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.lp-brand-row img {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 10px;
  background: rgba(255,255,255,.1);
  padding: 4px;
}
.lp-brand-name {
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-weight: 800;
  font-size: 18px;
  letter-spacing: -.02em;
}
.lp-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 24px;
  padding: 6px 14px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  background: rgba(255,255,255,.1);
  border: 1px solid rgba(255,255,255,.15);
  backdrop-filter: blur(8px);
}
.lp-badge-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #34D399;
  box-shadow: 0 0 8px #34D399;
  animation: lp-glow 2s ease-in-out infinite;
}
.lp-title {
  margin: 18px 0 0;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: clamp(30px, 3.6vw, 46px);
  font-weight: 800;
  line-height: 1.12;
  letter-spacing: -.04em;
  max-width: 520px;
  color: #FFFFFF !important;
}
.lp-title em {
  font-style: normal;
  color: #F0ABFC !important;
  -webkit-text-fill-color: #F0ABFC !important;
  background: none !important;
}
.lp-sub {
  margin: 14px 0 0;
  font-size: 15px;
  line-height: 1.65;
  color: rgba(255,255,255,.82) !important;
  max-width: 440px;
}
.lp-features {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 24px;
  max-width: 480px;
}
.lp-feat {
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.1);
  transition: background .2s, border-color .2s;
}
.lp-feat:hover {
  background: rgba(255,255,255,.11);
  border-color: rgba(255,255,255,.18);
}
.lp-feat strong {
  display: block;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 3px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  color: #fff !important;
}
.lp-feat span {
  font-size: 12px;
  color: rgba(255,255,255,.72) !important;
  line-height: 1.4;
}
.lp-mock {
  margin-top: 0;
  animation: lp-drift 8s ease-in-out infinite;
}
.lp-mock-card {
  border-radius: 20px;
  padding: 20px 22px;
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.12);
  backdrop-filter: blur(20px);
  box-shadow: 0 32px 80px rgba(0,0,0,.25);
  width: 100%;
}
.lp-mock-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}
.lp-mock-stat {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(0,0,0,.15);
  border: 1px solid rgba(255,255,255,.06);
}
.lp-mock-stat label {
  display: block;
  font-size: 10px;
  opacity: .6;
  font-weight: 600;
  margin-bottom: 4px;
}
.lp-mock-stat b {
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 15px;
  font-weight: 800;
}
.lp-auth {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 40px 48px;
  background: var(--lp-auth-bg);
  border-left: 1px solid var(--lp-border);
  box-shadow: -20px 0 60px rgba(0,0,0,.18);
  position: relative;
  animation: lp-in .5s ease-out both;
}
.lp-auth::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 1px;
  background: linear-gradient(180deg, rgba(167,139,250,.35), rgba(167,139,250,.05));
  pointer-events: none;
}
.lp-auth-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 36px;
}
@media (min-width: 961px) {
  .lp-auth-logo { display: none; }
  .lp-auth-top { justify-content: flex-end; margin-bottom: 28px; }
}
@media (max-width: 1200px) {
  .lp-hero-inner { grid-template-columns: 1fr; }
  .lp-mock { max-width: 420px; }
}
.lp-auth-logo {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lp-auth-logo img {
  width: 36px;
  height: 36px;
  object-fit: contain;
}
.lp-auth-logo span {
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-weight: 800;
  font-size: 17px;
  letter-spacing: -.02em;
  color: var(--lp-text);
}
.lp-theme {
  width: 40px; height: 40px;
  border-radius: 10px;
  border: 1px solid var(--lp-border);
  background: var(--lp-surface);
  color: var(--lp-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .2s;
}
.lp-theme:hover {
  border-color: var(--lp-accent);
  color: var(--lp-accent);
}
.lp-form { max-width: 360px; width: 100%; margin: 0 auto; }
.lp-h1 {
  margin: 0;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -.03em;
  color: var(--lp-text);
}
.lp-h2 {
  margin: 6px 0 28px;
  font-size: 14px;
  color: var(--lp-muted);
  line-height: 1.5;
}
.lp-field { margin-bottom: 18px; }
.lp-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--lp-text);
  margin-bottom: 7px;
}
.lp-input-wrap { position: relative; }
.lp-input-icon {
  position: absolute;
  left: 14px; top: 50%;
  transform: translateY(-50%);
  color: var(--lp-muted);
  pointer-events: none;
  display: flex;
}
.lp-input {
  width: 100%;
  padding: 12px 14px 12px 42px;
  border-radius: 10px;
  font-size: 14px;
  color: var(--lp-text);
  background: var(--lp-input);
  border: 1.5px solid var(--lp-border);
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color .15s, box-shadow .15s;
}
.lp-input:focus {
  border-color: var(--lp-accent);
  box-shadow: 0 0 0 3px var(--lp-accent-ring);
}
.lp-eye {
  position: absolute;
  right: 12px; top: 50%;
  transform: translateY(-50%);
  background: none; border: none;
  color: var(--lp-muted);
  cursor: pointer;
  padding: 4px;
  display: flex;
}
.lp-forgot {
  text-align: right;
  margin: -6px 0 22px;
}
.lp-forgot button {
  background: none; border: none;
  color: var(--lp-accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.lp-btn {
  width: 100%;
  padding: 13px 16px;
  border-radius: 10px;
  border: none;
  font-size: 15px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: transform .15s, box-shadow .15s, opacity .15s;
  background: linear-gradient(135deg, #8B5CF6, #7C3AED);
  color: #fff;
  box-shadow: 0 8px 24px rgba(124,58,237,.35);
}
.lp-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 28px rgba(124,58,237,.42);
}
.lp-btn:disabled {
  opacity: .55;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}
.lp-back {
  width: 100%;
  margin-top: 12px;
  padding: 10px;
  border: none;
  background: none;
  color: var(--lp-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.lp-alert {
  padding: 11px 14px;
  border-radius: 10px;
  margin-bottom: 18px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid;
}
.lp-alert-err { background: var(--lp-err-bg); border-color: var(--lp-err-bdr); color: var(--lp-err-tx); }
.lp-alert-ok  { background: var(--lp-ok-bg);  border-color: var(--lp-ok-bdr);  color: var(--lp-ok-tx); }
.lp-footer {
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid var(--lp-border);
  text-align: center;
  font-size: 12px;
  color: var(--lp-muted);
}
.lp-mobile-brand { display: none; }
@media (max-width: 960px) {
  .lp-root { grid-template-columns: 1fr; }
  .lp-hero { display: none; }
  .lp-auth { border-left: none; padding: 32px 24px 40px; min-height: 100vh; }
  .lp-mobile-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 28px;
    padding: 16px;
    border-radius: 16px;
    background: var(--lp-hero-bg);
    color: #fff;
  }
  .lp-mobile-brand img { width: 36px; height: 36px; object-fit: contain; }
  .lp-mobile-brand span { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: 18px; }
}
`;

const THEMES = {
  light: {
    bg: '#F4F2FF',
    heroBg: 'linear-gradient(160deg, #5B21B6 0%, #4C1D95 40%, #312E81 100%)',
    authBg: '#FFFFFF',
    surface: '#F8F7FF',
    border: '#E8E4F8',
    text: '#0F0A1E',
    muted: '#6B7280',
    accent: '#7C3AED',
    accentRing: 'rgba(124,58,237,.12)',
    input: '#FAFAFF',
    errBg: '#FEF2F2', errBdr: '#FECACA', errTx: '#DC2626',
    okBg: '#ECFDF5', okBdr: '#A7F3D0', okTx: '#059669',
  },
  dark: {
    bg: '#09090F',
    heroBg: 'linear-gradient(160deg, #3B0764 0%, #1E1B4B 50%, #09090F 100%)',
    authBg: '#0F1017',
    surface: '#181A24',
    border: '#252836',
    text: '#F1F0F8',
    muted: '#8B92A8',
    accent: '#A78BFA',
    accentRing: 'rgba(167,139,250,.15)',
    input: '#14161F',
    errBg: 'rgba(239,68,68,.1)', errBdr: 'rgba(239,68,68,.25)', errTx: '#FCA5A5',
    okBg: 'rgba(16,185,129,.1)', okBdr: 'rgba(16,185,129,.25)', okTx: '#6EE7B7',
  },
};

const IconSun = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>
);
const IconMoon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
);
const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
);
const IconLock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
);
const IconEye = ({ open }) => open ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
);

export default function LoginPage({ platformMode = false }) {
  const { login, logout, verify2FA } = useAuth();
  const navigate = useNavigate();

  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('salon-login-theme');
    return saved ? saved === 'dark' : true;
  });
  const T = dark ? THEMES.dark : THEMES.light;

  const [form, setForm] = useState({ username: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [maintenance, setMaintenance] = useState({ enabled: false, message: '' });
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
        setMaintenance({ enabled: !!data.enabled, message: data.message || 'System is under maintenance.' });
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  if (maintenance.enabled) return <MaintenancePage />;

  const vars = {
    '--lp-bg': T.bg,
    '--lp-hero-bg': T.heroBg,
    '--lp-auth-bg': T.authBg,
    '--lp-surface': T.surface,
    '--lp-border': T.border,
    '--lp-text': T.text,
    '--lp-muted': T.muted,
    '--lp-accent': T.accent,
    '--lp-accent-ring': T.accentRing,
    '--lp-input': T.input,
    '--lp-err-bg': T.errBg, '--lp-err-bdr': T.errBdr, '--lp-err-tx': T.errTx,
    '--lp-ok-bg': T.okBg, '--lp-ok-bdr': T.okBdr, '--lp-ok-tx': T.okTx,
  };

  const handleChange = (e) => { setForm((p) => ({ ...p, [e.target.name]: e.target.value })); setError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (maintenance.enabled) { setError(maintenance.message); return; }
    setLoading(true); setError('');
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
    e.preventDefault(); setForgotError('');
    if (!forgotUsername.trim()) { setForgotError('Please enter your username.'); return; }
    setForgotLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: forgotUsername.trim() }),
      });
      setForgotSent(true);
    } catch { setForgotError('Something went wrong. Please try again.'); }
    setForgotLoading(false);
  };

  const handleTotp = async (e) => {
    e.preventDefault();
    if (totpCode.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true); setError('');
    try {
      const data = await verify2FA({ tempToken, code: totpCode });
      if (platformMode && data?.user?.role !== 'platform_admin') { await logout(); setError('Platform admin account required.'); return; }
      navigate(data?.user?.role === 'platform_admin' ? '/platform/dashboard' : '/dashboard');
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid code. Please try again.');
    } finally { setLoading(false); }
  };

  const renderForm = () => {
    if (step2fa) {
      return (
        <>
          <h1 className="lp-h1">Two-factor auth</h1>
          <p className="lp-h2">Enter the 6-digit code from your authenticator app</p>
          {error && <div className="lp-alert lp-alert-err">{error}</div>}
          <form onSubmit={handleTotp}>
            <div className="lp-field">
              <label className="lp-label">Verification code</label>
              <input
                className="lp-input"
                style={{ paddingLeft: 16, textAlign: 'center', fontSize: 24, fontWeight: 800, letterSpacing: 10, fontFamily: 'monospace' }}
                value={totpCode}
                onChange={(e) => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                placeholder="000000"
                maxLength={6}
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </div>
            <button type="submit" className="lp-btn" disabled={loading || totpCode.length !== 6}>
              {loading ? 'Verifying…' : 'Verify & sign in'}
            </button>
            <button type="button" className="lp-back" onClick={() => { setStep2fa(false); setTempToken(''); setTotpCode(''); setError(''); }}>
              ← Back to sign in
            </button>
          </form>
        </>
      );
    }

    if (stepForgot) {
      return (
        <>
          <h1 className="lp-h1">Reset password</h1>
          <p className="lp-h2">We&apos;ll email a reset link if your account has an address on file</p>
          {forgotError && <div className="lp-alert lp-alert-err">{forgotError}</div>}
          {forgotSent ? (
            <div className="lp-alert lp-alert-ok" style={{ textAlign: 'center', padding: '20px 16px' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✉️</div>
              <strong>Check your email</strong>
              <p style={{ margin: '6px 0 0', fontSize: 13, opacity: .85 }}>If an account was found, a reset link has been sent.</p>
            </div>
          ) : (
            <form onSubmit={handleForgot}>
              <div className="lp-field">
                <label className="lp-label">Username</label>
                <div className="lp-input-wrap">
                  <span className="lp-input-icon"><IconUser /></span>
                  <input className="lp-input" value={forgotUsername} onChange={(e) => { setForgotUsername(e.target.value); setForgotError(''); }} placeholder="Enter your username" autoFocus autoComplete="username" required />
                </div>
              </div>
              <button type="submit" className="lp-btn" disabled={forgotLoading}>{forgotLoading ? 'Sending…' : 'Send reset link'}</button>
            </form>
          )}
          <button type="button" className="lp-back" onClick={() => setStepForgot(false)}>← Back to sign in</button>
        </>
      );
    }

    return (
      <>
        <h1 className="lp-h1">{platformMode ? 'Platform sign in' : 'Welcome back'}</h1>
        <p className="lp-h2">{platformMode ? 'Enter your platform admin credentials' : 'Sign in to access your salon dashboard'}</p>
        {maintenance.enabled && <div className="lp-alert lp-alert-err">⚠️ {maintenance.message}</div>}
        {error && <div className="lp-alert lp-alert-err">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="lp-field">
            <label className="lp-label">Username</label>
            <div className="lp-input-wrap">
              <span className="lp-input-icon"><IconUser /></span>
              <input className="lp-input" name="username" value={form.username} onChange={handleChange} placeholder="Enter your username" autoFocus autoComplete="username" required />
            </div>
          </div>
          <div className="lp-field">
            <label className="lp-label">Password</label>
            <div className="lp-input-wrap">
              <span className="lp-input-icon"><IconLock /></span>
              <input className="lp-input" name="password" value={form.password} onChange={handleChange} type={showPw ? 'text' : 'password'} placeholder="Enter your password" autoComplete="current-password" style={{ paddingRight: 42 }} required />
              <button type="button" className="lp-eye" onClick={() => setShowPw((s) => !s)}><IconEye open={showPw} /></button>
            </div>
          </div>
          <div className="lp-forgot">
            <button type="button" onClick={() => { setStepForgot(true); setForgotSent(false); setForgotUsername(''); setForgotError(''); }}>Forgot password?</button>
          </div>
          <button type="submit" className="lp-btn" disabled={loading || maintenance.enabled}>
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'lp-spin .7s linear infinite' }} />
                Signing in…
              </span>
            ) : 'Sign in'}
          </button>
        </form>
      </>
    );
  };

  return (
    <div className="lp-root" style={vars}>
      <style>{CSS}</style>

      {/* Hero */}
      <aside className="lp-hero">
        <div className="lp-hero-mesh" />
        <div className="lp-hero-grid" />
        <div className="lp-brand-row">
          <img src={logoSrc} alt={brandName} onError={(e) => { e.currentTarget.src = '/kogo.png?v=6'; }} />
          <span className="lp-brand-name">{brandName}</span>
        </div>
        <div className="lp-badge">
          <span className="lp-badge-dot" />
          {platformMode ? 'Platform Console' : 'Salon Management SaaS'}
        </div>
        <div className="lp-hero-inner">
          <div className="lp-hero-copy">
            <h2 className="lp-title">
              {platformMode ? (
                <>Manage your <em>entire platform</em> from one place</>
              ) : (
                <>Run your salon smarter with <em>{brandName}</em></>
              )}
            </h2>
            <p className="lp-sub">
              {platformMode
                ? 'Tenants, subscriptions, monitoring and system controls — built for scale.'
                : 'Appointments, payments, inventory, loyalty and AI — all in one cloud platform.'}
            </p>
            <div className="lp-features">
              {FEATURES.map((f) => (
                <div key={f.title} className="lp-feat">
                  <strong>{f.title}</strong>
                  <span>{f.desc}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="lp-mock">
            <div className="lp-mock-card">
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.7)', marginBottom: 14 }}>Today&apos;s snapshot</div>
              <div className="lp-mock-stats">
                {[
                  { l: 'Revenue', v: 'Rs. 84K', c: '#C4B5FD' },
                  { l: 'Bookings', v: '32', c: '#93C5FD' },
                  { l: 'Walk-ins', v: '11', c: '#F9A8D4' },
                ].map((s) => (
                  <div key={s.l} className="lp-mock-stat">
                    <label>{s.l}</label>
                    <b style={{ color: s.c }}>{s.v}</b>
                  </div>
                ))}
              </div>
              {['Haircut · 10:30', 'Color · 11:45', 'Spa · 14:00'].map((row, i) => (
                <div key={row} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: i === 0 ? '1px solid rgba(255,255,255,.08)' : 'none', fontSize: 12.5, color: 'rgba(255,255,255,.88)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: ['#34D399', '#FBBF24', '#A78BFA'][i] }} />
                  {row}
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Auth panel */}
      <section className="lp-auth">
        <div className="lp-mobile-brand">
          <img src={logoSrc} alt={brandName} onError={(e) => { e.currentTarget.src = '/kogo.png?v=6'; }} />
          <span>{brandName}</span>
        </div>
        <div className="lp-auth-top">
          <div className="lp-auth-logo">
            <img src={logoSrc} alt="" onError={(e) => { e.currentTarget.src = '/kogo.png?v=6'; }} />
            <span>{brandName}</span>
          </div>
          <button type="button" className="lp-theme" onClick={() => setDark((d) => !d)} title={dark ? 'Light mode' : 'Dark mode'}>
            {dark ? <IconSun /> : <IconMoon />}
          </button>
        </div>
        <div className="lp-form">{renderForm()}</div>
        <div className="lp-footer">
          {brandName} · Powered by Hexalyte Innovation
        </div>
      </section>
    </div>
  );
}
