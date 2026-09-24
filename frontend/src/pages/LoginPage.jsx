import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MaintenancePage from './MaintenancePage';
import { normalizeBranding, resolveBrandName, resolveBrandLogo } from '../utils/branding';
import { getTenantSlug } from '../utils/tenant';

const WORKSPACE_FEATURES = [
  'Appointments & walk-ins',
  'POS payments & packages',
  'Staff schedules & commissions',
  'Client CRM & loyalty',
  'Inventory & suppliers',
];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

@keyframes lp-in { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
@keyframes lp-spin { to { transform:rotate(360deg); } }

.lp-root {
  min-height: 100vh;
  height: 100vh;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(280px, 32%) 1fr;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  color: #0f172a;
  overflow: hidden;
  background: #0b1220;
}

/* ── Left info panel ───────────────────────────────────────── */
.lp-side {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: clamp(28px, 3.5vw, 44px) clamp(24px, 3vw, 40px);
  background: linear-gradient(165deg, #0c1526 0%, #111827 55%, #0a101c 100%);
  color: #e2e8f0;
  border-right: 1px solid rgba(255,255,255,.06);
  overflow-y: auto;
}
.lp-side-top { display: flex; flex-direction: column; gap: 28px; }
.lp-logo-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.lp-logo-row img {
  height: 40px;
  width: auto;
  max-width: 180px;
  object-fit: contain;
  object-position: left center;
}
.lp-logo-text {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: #f8fafc;
}
.lp-logo-text span { color: #94a3b8; font-weight: 500; display: block; font-size: 10px; letter-spacing: .14em; margin-top: 2px; }
.lp-host {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
  word-break: break-all;
}
.lp-welcome {
  margin: 0;
  font-size: clamp(26px, 2.6vw, 34px);
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -.03em;
  color: #f8fafc;
}
.lp-welcome em {
  font-style: normal;
  color: #a5b4fc;
}
.lp-side-sub {
  margin: 12px 0 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13.5px;
  line-height: 1.55;
  color: #94a3b8;
}
.lp-side-sub svg { flex-shrink: 0; margin-top: 2px; color: #818cf8; }
.lp-include-label {
  margin: 8px 0 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: #64748b;
}
.lp-checklist { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.lp-checklist li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 500;
  color: #e2e8f0;
}
.lp-check {
  width: 20px; height: 20px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(99,102,241,.18);
  color: #a5b4fc;
  flex-shrink: 0;
}
.lp-side-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding-top: 28px;
  font-size: 11.5px;
  color: #64748b;
  font-weight: 500;
}
.lp-side-foot span { display: inline-flex; align-items: center; gap: 6px; }

/* ── Right visual + card ───────────────────────────────────── */
.lp-visual {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(20px, 3vw, 40px);
  background:
    linear-gradient(180deg, rgba(15,23,42,.55) 0%, rgba(15,23,42,.72) 100%),
    url('/login-salon-bg.jpg') center / cover no-repeat;
  animation: lp-in .5s ease-out both;
  overflow: auto;
}
.lp-visual::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 60% at 50% 40%, transparent 0%, rgba(15,23,42,.35) 100%);
  pointer-events: none;
}
.lp-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 20px;
  padding: clamp(28px, 3.5vw, 36px) clamp(24px, 3vw, 34px) 28px;
  box-shadow: 0 28px 64px rgba(15,23,42,.35);
}
.lp-card-logo {
  display: flex;
  justify-content: center;
  margin-bottom: 22px;
}
.lp-card-logo img {
  height: 36px;
  width: auto;
  max-width: 160px;
  object-fit: contain;
}
.lp-eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: #4f46e5;
  text-align: center;
}
.lp-h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -.03em;
  color: #0f172a;
  text-align: center;
}
.lp-h2 {
  margin: 6px 0 22px;
  font-size: 13.5px;
  color: #64748b;
  text-align: center;
  line-height: 1.45;
}
.lp-field { margin-bottom: 14px; }
.lp-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
}
.lp-label {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 7px;
}
.lp-label-row .lp-label { margin-bottom: 0; }
.lp-forgot-inline {
  background: none; border: none;
  color: #4f46e5;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  padding: 0;
}
.lp-forgot-inline:hover { color: #4338ca; }
.lp-input-wrap { position: relative; }
.lp-input-icon {
  position: absolute;
  left: 14px; top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  display: flex;
  pointer-events: none;
}
.lp-input {
  width: 100%;
  padding: 12px 14px 12px 42px;
  border-radius: 11px;
  font-size: 14px;
  color: #0f172a;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color .15s, box-shadow .15s, background .15s;
}
.lp-input::placeholder { color: #94a3b8; }
.lp-input:focus {
  background: #fff;
  border-color: #818cf8;
  box-shadow: 0 0 0 3px rgba(99,102,241,.15);
}
.lp-eye {
  position: absolute;
  right: 12px; top: 50%;
  transform: translateY(-50%);
  background: none; border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  display: flex;
}
.lp-eye:hover { color: #64748b; }
.lp-btn {
  width: 100%;
  margin-top: 6px;
  padding: 13px 16px;
  border-radius: 11px;
  border: none;
  font-size: 14.5px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  color: #fff;
  background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
  box-shadow: 0 10px 24px rgba(79,70,229,.28);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform .15s, box-shadow .15s, opacity .15s;
}
.lp-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 14px 30px rgba(79,70,229,.38);
}
.lp-btn:disabled { opacity: .55; cursor: not-allowed; transform: none; box-shadow: none; }
.lp-back {
  width: 100%;
  margin-top: 14px;
  padding: 10px;
  border: none;
  background: none;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.lp-back:hover { color: #334155; }
.lp-alert {
  padding: 11px 14px;
  border-radius: 10px;
  margin-bottom: 16px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid;
}
.lp-alert-err { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }
.lp-alert-ok  { background: #ecfdf5; border-color: #a7f3d0; color: #047857; }
.lp-card-foot {
  margin-top: 20px;
  text-align: center;
  font-size: 13px;
  color: #64748b;
}
.lp-card-foot a {
  color: #4f46e5;
  font-weight: 600;
  text-decoration: none;
}
.lp-card-foot a:hover { text-decoration: underline; }
.lp-page-foot {
  position: absolute;
  bottom: 16px;
  left: 0; right: 0;
  z-index: 1;
  text-align: center;
  font-size: 11.5px;
  color: rgba(248,250,252,.72);
  font-weight: 500;
  pointer-events: none;
}
@media (max-width: 900px) {
  .lp-root { grid-template-columns: 1fr; height: auto; min-height: 100vh; overflow: auto; }
  .lp-side { display: none; }
  .lp-visual {
    min-height: 100vh;
    padding: 28px 18px 48px;
    align-items: flex-start;
  }
  .lp-page-foot { position: static; margin-top: 24px; color: rgba(248,250,252,.8); }
}
`;

const IconEye = ({ open }) => open ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
);

const IconMail = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
);

const IconLock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
);

const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
);

const IconStore = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
);

export default function LoginPage({ platformMode = false }) {
  const { login, logout, verify2FA } = useAuth();
  const navigate = useNavigate();

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

  const brandName = platformMode ? 'Hexalyte Platform' : resolveBrandName(branding);
  const logoSrc = resolveBrandLogo(branding, 'login') || '/kogo.png?v=6';
  const hostLabel = typeof window !== 'undefined' ? window.location.host : '';
  const tenantSlug = !platformMode ? getTenantSlug() : null;

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
          <p className="lp-eyebrow">Security</p>
          <h1 className="lp-h1">Two-factor auth</h1>
          <p className="lp-h2">Enter the 6-digit code from your authenticator app</p>
          {error && <div className="lp-alert lp-alert-err">{error}</div>}
          <form onSubmit={handleTotp}>
            <div className="lp-field">
              <label className="lp-label">Verification code</label>
              <div className="lp-input-wrap">
                <input
                  className="lp-input"
                  style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, letterSpacing: 10, fontFamily: 'monospace', paddingLeft: 14 }}
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
          <p className="lp-eyebrow">Account</p>
          <h1 className="lp-h1">Reset password</h1>
          <p className="lp-h2">We&apos;ll email a reset link if your account has an address on file</p>
          {forgotError && <div className="lp-alert lp-alert-err">{forgotError}</div>}
          {forgotSent ? (
            <div className="lp-alert lp-alert-ok" style={{ textAlign: 'center', padding: '18px 14px' }}>
              <strong>Check your email</strong>
              <p style={{ margin: '6px 0 0', fontSize: 13, opacity: .9 }}>If an account was found, a reset link has been sent.</p>
            </div>
          ) : (
            <form onSubmit={handleForgot}>
              <div className="lp-field">
                <label className="lp-label">Username</label>
                <div className="lp-input-wrap">
                  <span className="lp-input-icon"><IconMail /></span>
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
              </div>
              <button type="submit" className="lp-btn" disabled={forgotLoading}>
                {forgotLoading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}
          <button type="button" className="lp-back" onClick={() => { setStepForgot(false); setShowPw(false); }}>← Back to sign in</button>
        </>
      );
    }

    return (
      <>
        <p className="lp-eyebrow">Sign in</p>
        <h1 className="lp-h1">Welcome back</h1>
        <p className="lp-h2">
          {platformMode
            ? 'Sign in to Hexalyte platform administration'
            : `Sign in to ${brandName}`}
        </p>
        {error && <div className="lp-alert lp-alert-err">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="lp-field">
            <label className="lp-label">{platformMode ? 'Username' : 'Email / username'}</label>
            <div className="lp-input-wrap">
              <span className="lp-input-icon"><IconMail /></span>
              <input
                className="lp-input"
                name="username"
                value={form.username}
                onChange={handleChange}
                placeholder={platformMode ? 'platform admin username' : 'you@salon.com'}
                autoFocus
                autoComplete="username"
                required
              />
            </div>
          </div>
          <div className="lp-field">
            <div className="lp-label-row">
              <label className="lp-label">Password</label>
              <button
                type="button"
                className="lp-forgot-inline"
                onClick={() => { setStepForgot(true); setForgotSent(false); setForgotUsername(''); setForgotError(''); setShowPw(false); }}
              >
                Forgot password?
              </button>
            </div>
            <div className="lp-input-wrap">
              <span className="lp-input-icon"><IconLock /></span>
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
              <button type="button" className="lp-eye" onClick={() => setShowPw((s) => !s)} aria-label="Toggle password"><IconEye open={showPw} /></button>
            </div>
          </div>
          <button type="submit" className="lp-btn" disabled={loading || maintenance.enabled}>
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'lp-spin .7s linear infinite' }} />
                Signing in…
              </span>
            ) : (
              <>
                Sign in to dashboard
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </>
            )}
          </button>
        </form>
        {!platformMode && (
          <div className="lp-card-foot">
            Don&apos;t have an account?{' '}
            <a href="https://admin.hexalyte.com/register">Start free trial</a>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="lp-root">
      <style>{CSS}</style>

      <aside className="lp-side">
        <div className="lp-side-top">
          <div className="lp-logo-row">
            <img src={logoSrc} alt={brandName} onError={(e) => { e.currentTarget.src = '/kogo.png?v=6'; }} />
          </div>
          <div className="lp-host">{hostLabel}</div>
          <div>
            <h2 className="lp-welcome">
              {platformMode ? (
                <>Welcome to <em>Hexalyte Platform</em></>
              ) : (
                <>Welcome to <em>{brandName}</em></>
              )}
            </h2>
            <p className="lp-side-sub">
              <IconStore />
              {platformMode
                ? 'Platform console — manage tenants, billing, and system controls.'
                : 'Salon workspace — sign in to manage appointments, payments, and clients.'}
            </p>
          </div>
          {!platformMode && (
            <div>
              <div className="lp-include-label">Your workspace includes</div>
              <ul className="lp-checklist">
                {WORKSPACE_FEATURES.map((item) => (
                  <li key={item}>
                    <span className="lp-check"><IconCheck /></span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {platformMode && (
            <div>
              <div className="lp-include-label">Admin tools</div>
              <ul className="lp-checklist">
                {['Tenant management', 'Subscriptions & invoices', 'Announcements', 'System monitoring', 'Support tickets'].map((item) => (
                  <li key={item}>
                    <span className="lp-check"><IconCheck /></span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="lp-side-foot">
          <span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            SSL Secured
          </span>
          <span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
            Cloud hosted
          </span>
          {tenantSlug && <span>{tenantSlug}</span>}
        </div>
      </aside>

      <section className="lp-visual">
        <div className="lp-card">
          <div className="lp-card-logo">
            <img src={logoSrc} alt={brandName} onError={(e) => { e.currentTarget.src = '/kogo.png?v=6'; }} />
          </div>
          {renderForm()}
        </div>
        <div className="lp-page-foot">© {new Date().getFullYear()} HEXALYTE — Secure multi-tenant salon platform</div>
      </section>
    </div>
  );
}
