import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MaintenancePage from './MaintenancePage';
import { normalizeBranding, resolveBrandName, resolveBrandLogo } from '../utils/branding';

const FEATURES = [
  {
    title: 'Appointments',
    desc: 'Bookings, walk-ins & calendar',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    title: 'Payments',
    desc: 'Packages, billing & receipts',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    title: 'Analytics',
    desc: 'Revenue & performance insights',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    title: 'Inventory',
    desc: 'Stock, products & suppliers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
  },
  {
    title: 'Client CRM',
    desc: 'History, loyalty & follow-ups',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    title: 'Multi-Branch',
    desc: 'All locations, one dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

@keyframes lp-in   { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
@keyframes lp-spin { to { transform:rotate(360deg); } }

.lp-root {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 1fr;
  font-family: 'Inter', system-ui, sans-serif;
  background: #06060b;
  color: #e8eaf0;
}
.lp-hero {
  position: relative;
  overflow: hidden;
  padding: 40px 52px 36px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #06060b;
}
.lp-hero-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 70% 55% at 0% 0%, rgba(139,92,246,.22), transparent 60%),
    radial-gradient(ellipse 55% 45% at 100% 100%, rgba(59,130,246,.14), transparent 55%);
}
.lp-hero > * { position: relative; z-index: 1; }
.lp-hero h1, .lp-hero h2, .lp-hero h3 { color: #fff !important; font-family: 'Inter', sans-serif !important; }

.lp-brand-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.lp-brand-row img {
  width: 36px;
  height: 36px;
  object-fit: contain;
  border-radius: 8px;
}
.lp-brand-name {
  font-weight: 700;
  font-size: 15px;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: #c4c9d8;
}
.lp-title {
  margin: 48px 0 0;
  font-size: clamp(32px, 3.2vw, 44px);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -.03em;
  max-width: 520px;
  color: #fff !important;
}
.lp-title em {
  font-style: normal;
  background: linear-gradient(90deg, #a855f7, #6366f1, #3b82f6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.lp-sub {
  margin: 16px 0 0;
  font-size: 15px;
  line-height: 1.65;
  color: #7a8299 !important;
  max-width: 460px;
}
.lp-features {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 36px;
  max-width: 560px;
}
.lp-feat {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 18px;
  border-radius: 12px;
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.06);
  transition: background .2s, border-color .2s;
}
.lp-feat:hover {
  background: rgba(255,255,255,.05);
  border-color: rgba(139,92,246,.2);
}
.lp-feat-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(139,92,246,.12);
  border: 1px solid rgba(139,92,246,.2);
  color: #a78bfa;
}
.lp-feat strong {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 3px;
  color: #f0f1f5 !important;
}
.lp-feat span {
  font-size: 12px;
  color: #6b7289 !important;
  line-height: 1.45;
}
.lp-hero-foot {
  margin-top: auto;
  padding-top: 32px;
  font-size: 12px;
  color: #4b5268;
  letter-spacing: .01em;
}

.lp-auth {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 48px 56px;
  background: #08080f;
  border-left: 1px solid rgba(255,255,255,.04);
  min-height: 100vh;
  animation: lp-in .45s ease-out both;
}
.lp-auth-inner {
  width: 100%;
  max-width: 380px;
}
.lp-auth-top {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.lp-theme {
  width: 36px; height: 36px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.03);
  color: #6b7289;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .2s;
}
.lp-theme:hover {
  border-color: rgba(139,92,246,.35);
  color: #a78bfa;
}
.lp-h1 {
  margin: 0;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -.02em;
  color: #fff;
}
.lp-h2 {
  margin: 8px 0 32px;
  font-size: 14px;
  color: #6b7289;
  line-height: 1.5;
}
.lp-field { margin-bottom: 20px; }
.lp-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.lp-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #9ca3b8;
}
.lp-forgot-inline {
  background: none; border: none;
  color: #818cf8;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  padding: 0;
}
.lp-forgot-inline:hover { color: #a5b4fc; }
.lp-input-wrap { position: relative; }
.lp-input {
  width: 100%;
  padding: 13px 16px;
  border-radius: 10px;
  font-size: 14px;
  color: #e8eaf0;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.08);
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color .15s, box-shadow .15s;
}
.lp-input::placeholder { color: #4b5268; }
.lp-input:focus {
  border-color: rgba(139,92,246,.5);
  box-shadow: 0 0 0 3px rgba(139,92,246,.12);
}
.lp-eye {
  position: absolute;
  right: 14px; top: 50%;
  transform: translateY(-50%);
  background: none; border: none;
  color: #6b7289;
  cursor: pointer;
  padding: 4px;
  display: flex;
}
.lp-btn {
  width: 100%;
  padding: 14px 16px;
  border-radius: 10px;
  border: none;
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: transform .15s, box-shadow .15s, opacity .15s;
  background: linear-gradient(90deg, #9333ea, #6366f1, #3b82f6);
  color: #fff;
  box-shadow: 0 4px 24px rgba(99,102,241,.35);
  margin-top: 4px;
}
.lp-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 32px rgba(99,102,241,.45);
}
.lp-btn:disabled {
  opacity: .55;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}
.lp-back {
  width: 100%;
  margin-top: 14px;
  padding: 10px;
  border: none;
  background: none;
  color: #6b7289;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}
.lp-back:hover { color: #9ca3b8; }
.lp-alert {
  padding: 11px 14px;
  border-radius: 10px;
  margin-bottom: 18px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid;
}
.lp-alert-err { background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.2); color: #fca5a5; }
.lp-alert-ok  { background: rgba(16,185,129,.08); border-color: rgba(16,185,129,.2); color: #6ee7b7; }
.lp-auth-foot {
  margin-top: 48px;
  text-align: center;
  font-size: 12px;
  color: #4b5268;
  line-height: 1.7;
}
.lp-auth-foot a {
  color: #6b7289;
  text-decoration: none;
}
.lp-auth-foot a:hover { color: #9ca3b8; }
.lp-mobile-brand { display: none; }

/* Light theme overrides */
.lp-root.lp-light {
  background: #f4f5f9;
  color: #111827;
}
.lp-root.lp-light .lp-hero { background: #f4f5f9; }
.lp-root.lp-light .lp-hero-glow {
  background:
    radial-gradient(ellipse 70% 55% at 0% 0%, rgba(139,92,246,.12), transparent 60%),
    radial-gradient(ellipse 55% 45% at 100% 100%, rgba(59,130,246,.08), transparent 55%);
}
.lp-root.lp-light .lp-brand-name { color: #374151; }
.lp-root.lp-light .lp-title { color: #111827 !important; }
.lp-root.lp-light .lp-sub { color: #6b7280 !important; }
.lp-root.lp-light .lp-feat {
  background: #fff;
  border-color: #e5e7eb;
}
.lp-root.lp-light .lp-feat:hover { border-color: #c4b5fd; }
.lp-root.lp-light .lp-feat strong { color: #111827 !important; }
.lp-root.lp-light .lp-feat span { color: #6b7280 !important; }
.lp-root.lp-light .lp-hero-foot { color: #9ca3af; }
.lp-root.lp-light .lp-auth {
  background: #fff;
  border-left-color: #e5e7eb;
}
.lp-root.lp-light .lp-h1 { color: #111827; }
.lp-root.lp-light .lp-h2 { color: #6b7280; }
.lp-root.lp-light .lp-label { color: #374151; }
.lp-root.lp-light .lp-input {
  background: #f9fafb;
  border-color: #e5e7eb;
  color: #111827;
}
.lp-root.lp-light .lp-auth-foot { color: #9ca3af; }

@media (max-width: 960px) {
  .lp-root { grid-template-columns: 1fr; }
  .lp-hero { display: none; }
  .lp-auth {
    border-left: none;
    padding: 32px 24px 40px;
    background: #06060b;
  }
  .lp-root.lp-light .lp-auth { background: #fff; }
  .lp-mobile-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 32px;
  }
  .lp-mobile-brand img { width: 36px; height: 36px; object-fit: contain; }
  .lp-mobile-brand span {
    font-weight: 700;
    font-size: 15px;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: #c4c9d8;
  }
  .lp-root.lp-light .lp-mobile-brand span { color: #374151; }
}
`;

const IconSun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>
);
const IconMoon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
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
                style={{ textAlign: 'center', fontSize: 24, fontWeight: 700, letterSpacing: 10, fontFamily: 'monospace' }}
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
              {loading ? 'Verifying…' : 'Verify & sign in →'}
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
                <input
                  className="lp-input"
                  value={forgotUsername}
                  onChange={(e) => { setForgotUsername(e.target.value); setForgotError(''); }}
                  placeholder="Enter your username"
                  autoFocus
                  autoComplete="username"
                  required
                />
              </div>
              <button type="submit" className="lp-btn" disabled={forgotLoading}>
                {forgotLoading ? 'Sending…' : 'Send reset link →'}
              </button>
            </form>
          )}
          <button type="button" className="lp-back" onClick={() => setStepForgot(false)}>← Back to sign in</button>
        </>
      );
    }

    return (
      <>
        <h1 className="lp-h1">{platformMode ? 'Platform sign in' : 'Welcome back'}</h1>
        <p className="lp-h2">{platformMode ? 'Enter your platform admin credentials' : 'Sign in to your dashboard'}</p>
        {maintenance.enabled && <div className="lp-alert lp-alert-err">⚠️ {maintenance.message}</div>}
        {error && <div className="lp-alert lp-alert-err">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="lp-field">
            <label className="lp-label">Username</label>
            <input
              className="lp-input"
              name="username"
              value={form.username}
              onChange={handleChange}
              placeholder="owner@yoursalon.com"
              autoFocus
              autoComplete="username"
              required
            />
          </div>
          <div className="lp-field">
            <div className="lp-label-row">
              <label className="lp-label">Password</label>
              <button
                type="button"
                className="lp-forgot-inline"
                onClick={() => { setStepForgot(true); setForgotSent(false); setForgotUsername(''); setForgotError(''); }}
              >
                Forgot password?
              </button>
            </div>
            <div className="lp-input-wrap">
              <input
                className="lp-input"
                name="password"
                value={form.password}
                onChange={handleChange}
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{ paddingRight: 44 }}
                required
              />
              <button type="button" className="lp-eye" onClick={() => setShowPw((s) => !s)}><IconEye open={showPw} /></button>
            </div>
          </div>
          <button type="submit" className="lp-btn" disabled={loading || maintenance.enabled}>
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'lp-spin .7s linear infinite' }} />
                Signing in…
              </span>
            ) : 'Sign in →'}
          </button>
        </form>
      </>
    );
  };

  return (
    <div className={`lp-root${dark ? '' : ' lp-light'}`}>
      <style>{CSS}</style>

      <aside className="lp-hero">
        <div className="lp-hero-glow" />
        <div className="lp-brand-row">
          <img src={logoSrc} alt={brandName} onError={(e) => { e.currentTarget.src = '/kogo.png?v=6'; }} />
          <span className="lp-brand-name">{brandName}</span>
        </div>
        <h2 className="lp-title">
          {platformMode ? (
            <>Manage your <em>entire platform</em> from one place</>
          ) : (
            <>Run your entire <em>salon</em> from one place</>
          )}
        </h2>
        <p className="lp-sub">
          {platformMode
            ? 'Tenants, subscriptions, monitoring and system controls — built for scale.'
            : `${brandName} brings appointments, payments, inventory, CRM and analytics into a single powerful platform.`}
        </p>
        <div className="lp-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-feat">
              <div className="lp-feat-icon">{f.icon}</div>
              <div>
                <strong>{f.title}</strong>
                <span>{f.desc}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="lp-hero-foot">
          256-bit encryption · JWT RS256 · Multi-branch support
        </div>
      </aside>

      <section className="lp-auth">
        <div className="lp-mobile-brand">
          <img src={logoSrc} alt={brandName} onError={(e) => { e.currentTarget.src = '/kogo.png?v=6'; }} />
          <span>{brandName}</span>
        </div>
        <div className="lp-auth-inner">
          <div className="lp-auth-top">
            <button type="button" className="lp-theme" onClick={() => setDark((d) => !d)} title={dark ? 'Light mode' : 'Dark mode'}>
              {dark ? <IconSun /> : <IconMoon />}
            </button>
          </div>
          {renderForm()}
          <div className="lp-auth-foot">
            Having trouble? Contact your system administrator
            <br />
            <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
          </div>
        </div>
      </section>
    </div>
  );
}
