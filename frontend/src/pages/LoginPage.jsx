import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MaintenancePage from './MaintenancePage';
import { normalizeBranding, resolveBrandLogo, resolveBrandName } from '../utils/branding';

/* ── Palette ── */
const P = {
  bg:      '#0b0e13',
  card:    '#13161d',
  surface: '#1a1e27',
  border:  '#252a35',
  gold:    '#c9a96e',
  goldDim: '#9a7d4e',
  text:    '#f1f0ec',
  muted:   '#7c8190',
  danger:  '#ef4444',
  white:   '#ffffff',
};

/* ── Keyframes ── */
const ANIMS = `
@keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
@keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
@keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }
@keyframes pulse-ring { 0% { box-shadow:0 0 0 0 rgba(201,169,110,.45); } 70% { box-shadow:0 0 0 12px rgba(201,169,110,0); } 100% { box-shadow:0 0 0 0 rgba(201,169,110,0); } }
`;

export default function LoginPage({ platformMode = false }) {
  const { login, logout, verify2FA } = useAuth();
  const navigate  = useNavigate();

  const [form,    setForm]    = useState({ username: '', password: '' });
  const [showPw,  setShowPw]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [maintenance, setMaintenance] = useState({ enabled: false, message: '' });
  const [mounted, setMounted] = useState(false);
  const [branding, setBranding] = useState(normalizeBranding());

  /* 2FA state */
  const [step2fa,    setStep2fa]    = useState(false);
  const [tempToken,  setTempToken]  = useState('');
  const [totpCode,   setTotpCode]   = useState('');

  /* Forgot-password state */
  const [stepForgot,      setStepForgot]      = useState(false);
  const [forgotUsername,  setForgotUsername]  = useState('');
  const [forgotSent,      setForgotSent]      = useState(false);
  const [forgotLoading,   setForgotLoading]   = useState(false);
  const [forgotError,     setForgotError]     = useState('');

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/branding/public')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setBranding(normalizeBranding(data));
      })
      .catch(() => {});

    fetch('/api/public/maintenance-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setMaintenance({
          enabled: !!data.enabled,
          message: data.message || 'System is under maintenance. Please try again later.',
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (maintenance.enabled) {
    return <MaintenancePage />;
  }

  const handleChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (maintenance.enabled) {
      setError(maintenance.message || 'System is under maintenance. Please try again later.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await login({
        username: form.username.trim(),
        password: form.password,
      });

      /* 2FA required */
      if (data?.requires2fa) {
        setTempToken(data.tempToken);
        setStep2fa(true);
        return;
      }

      if (platformMode && data?.user?.role !== 'platform_admin') {
        await logout();
        setError('Platform admin account required for this login.');
        return;
      }

      navigate(data?.user?.role === 'platform_admin' ? '/platform/dashboard' : '/dashboard');
    } catch (err) {
      setError(err?.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setForgotError('');
    if (!forgotUsername.trim()) { setForgotError('Please enter your username.'); return; }
    setForgotLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: forgotUsername.trim() }),
      });
      setForgotSent(true);
    } catch {
      setForgotError('Something went wrong. Please try again.');
    }
    setForgotLoading(false);
  };

  const handleTotp = async (e) => {
    e.preventDefault();
    if (totpCode.length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await verify2FA({ tempToken, code: totpCode });
      if (platformMode && data?.user?.role !== 'platform_admin') {
        await logout();
        setError('Platform admin account required for this login.');
        return;
      }
      navigate(data?.user?.role === 'platform_admin' ? '/platform/dashboard' : '/dashboard');
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputBase = {
    width: '100%', padding: '13px 16px', borderRadius: 12, fontSize: 15,
    color: P.text, background: P.surface, outline: 'none',
    border: `1.5px solid ${P.border}`, boxSizing: 'border-box',
    fontFamily: "'DM Sans', sans-serif", transition: 'border-color .2s, box-shadow .2s',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: `radial-gradient(ellipse 80% 60% at 50% -10%, #1a1510 0%, ${P.bg} 70%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem', fontFamily: "'DM Sans', sans-serif", position: 'relative', overflow: 'hidden',
    }}>
      <style>{ANIMS}</style>

      {/* ── Decorative elements ── */}
      <div style={{ position:'absolute', top:'-15%', left:'-10%', width:420, height:420, borderRadius:'50%', background:'radial-gradient(circle, rgba(201,169,110,.06) 0%, transparent 70%)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:'-20%', right:'-10%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle, rgba(201,169,110,.04) 0%, transparent 70%)', pointerEvents:'none' }} />

      <div style={{
        width: '100%', maxWidth: 440,
        animation: mounted ? 'fadeUp .7s ease-out both' : 'none',
      }}>
        {/* ── Brand ── */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <img
            src={resolveBrandLogo(branding, 'login')}
            alt={`${resolveBrandName(branding)} logo`}
            style={{
              width: 200,
              height: 200,
              objectFit: 'contain',
              borderRadius: 0,
              marginBottom: 10,
              animation: 'float 4s ease-in-out infinite',
              background: 'transparent',
              filter: 'drop-shadow(0 8px 28px rgba(201,169,110,.25))',
            }}
          />
          <h1 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 42, fontWeight: 700, color: P.text,
            margin: 0, letterSpacing: 2,
          }}>
            {platformMode ? 'HEXA SALON' : resolveBrandName(branding).toUpperCase()}
          </h1>
          <p style={{
            color: P.muted, margin: '8px 0 0', fontSize: 13,
            letterSpacing: 4, textTransform: 'uppercase', fontWeight: 500,
          }}>{platformMode ? 'Platform Administration' : 'Smart Salon Management System'}</p>
        </div>

        {/* ── Card ── */}
        <div style={{
          background: P.card, borderRadius: 24,
          border: `1px solid ${P.border}`,
          boxShadow: '0 20px 60px rgba(0,0,0,.35), 0 1px 0 rgba(201,169,110,.08) inset',
          padding: '2.25rem 2rem 2rem',
          backdropFilter: 'blur(20px)',
        }}>
          {maintenance.enabled && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 12,
              marginBottom: 16,
              background: 'rgba(245,158,11,.12)',
              border: '1px solid rgba(245,158,11,.35)',
              color: '#fbbf24',
              fontSize: 13,
              fontWeight: 600,
            }}>
              Maintenance Notice: {maintenance.message}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 12, marginBottom: 18,
              background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#fca5a5' }}>{error}</span>
            </div>
          )}

          {/* ── Step 1: Username + Password ── */}
          {!step2fa && (
            <>
              <div style={{ marginBottom: 28 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: P.text }}>
                  {platformMode ? 'Platform Admin Login' : 'Welcome back'}
                </h2>
                <p style={{ margin: '6px 0 0', fontSize: 14, color: P.muted }}>
                  {platformMode ? 'Sign in to manage the full SaaS platform' : 'Sign in to your account'}
                </p>
              </div>
              <form onSubmit={handleSubmit}>
                {/* Username */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{
                    display: 'block', fontSize: 12, fontWeight: 600,
                    color: P.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1,
                  }}>Username</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: P.muted, pointerEvents: 'none' }}>👤</span>
                    <input name="username" value={form.username} onChange={handleChange}
                      placeholder="Enter your username" autoFocus autoComplete="username"
                      style={{ ...inputBase, paddingLeft: 42 }}
                      onFocus={(e) => { e.target.style.borderColor = P.gold; e.target.style.boxShadow = `0 0 0 3px rgba(201,169,110,.15)`; }}
                      onBlur={(e) => { e.target.style.borderColor = P.border; e.target.style.boxShadow = 'none'; }}
                      required />
                  </div>
                </div>
                {/* Password */}
                <div style={{ marginBottom: 26 }}>
                  <label style={{
                    display: 'block', fontSize: 12, fontWeight: 600,
                    color: P.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1,
                  }}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: P.muted, pointerEvents: 'none' }}>🔒</span>
                    <input name="password" value={form.password} onChange={handleChange}
                      type={showPw ? 'text' : 'password'} placeholder="Enter your password"
                      autoComplete="current-password"
                      style={{ ...inputBase, paddingLeft: 42, paddingRight: 46 }}
                      onFocus={(e) => { e.target.style.borderColor = P.gold; e.target.style.boxShadow = `0 0 0 3px rgba(201,169,110,.15)`; }}
                      onBlur={(e) => { e.target.style.borderColor = P.border; e.target.style.boxShadow = 'none'; }}
                      required />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: P.muted, padding: 2, lineHeight: 1 }}>
                      {showPw ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>
                {/* Submit */}
                <button type="submit" disabled={loading || maintenance.enabled}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                    background: loading ? P.surface : `linear-gradient(135deg, ${P.gold}, ${P.goldDim})`,
                    color: loading ? P.muted : '#0b0e13',
                    fontSize: 15, fontWeight: 700, letterSpacing: .5,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all .25s', fontFamily: 'inherit',
                    boxShadow: loading ? 'none' : '0 6px 24px rgba(201,169,110,.3)',
                    ...(loading ? {} : { animation: 'pulse-ring 2s ease-out infinite' }),
                  }}
                  onMouseEnter={(e) => { if(!loading) e.target.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { e.target.style.transform = 'translateY(0)'; }}
                >
                  {loading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 16, height: 16, border: `2px solid ${P.muted}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
                      Signing in…
                    </span>
                  ) : 'Sign In'}
                </button>
                {!platformMode && (
                  <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <button type="button" onClick={() => { setStepForgot(true); setForgotSent(false); setForgotUsername(''); setForgotError(''); }}
                      style={{ background: 'none', border: 'none', color: P.goldDim, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', opacity: 0.8 }}>
                      Forgot password?
                    </button>
                  </div>
                )}
              </form>
            </>
          )}

          {/* ── Step 3: Forgot Password ── */}
          {stepForgot && (
            <>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(201,169,110,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🔑</div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: P.text }}>Reset Password</h2>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: P.muted }}>Enter your username to receive a reset link</p>
                  </div>
                </div>
              </div>
              {forgotError && (
                <div style={{ padding: '10px 14px', borderRadius: 12, marginBottom: 16, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#fca5a5' }}>{forgotError}</span>
                </div>
              )}
              {forgotSent ? (
                <div style={{ padding: '16px', borderRadius: 14, background: 'rgba(5,150,105,.1)', border: '1px solid rgba(5,150,105,.25)', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📧</div>
                  <p style={{ margin: 0, color: '#6ee7b7', fontSize: 14, fontWeight: 600 }}>Check your email</p>
                  <p style={{ margin: '6px 0 0', color: P.muted, fontSize: 13 }}>If an account was found with an email on file, a reset link has been sent.</p>
                </div>
              ) : (
                <form onSubmit={handleForgot}>
                  <div style={{ marginBottom: 22 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: P.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Username</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: P.muted, pointerEvents: 'none' }}>👤</span>
                      <input value={forgotUsername} onChange={e => { setForgotUsername(e.target.value); setForgotError(''); }}
                        placeholder="Enter your username" autoFocus autoComplete="username"
                        style={{ ...inputBase, paddingLeft: 42 }}
                        onFocus={e => { e.target.style.borderColor = P.gold; e.target.style.boxShadow = `0 0 0 3px rgba(201,169,110,.15)`; }}
                        onBlur={e => { e.target.style.borderColor = P.border; e.target.style.boxShadow = 'none'; }}
                        required />
                    </div>
                  </div>
                  <button type="submit" disabled={forgotLoading}
                    style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: forgotLoading ? P.surface : `linear-gradient(135deg, ${P.gold}, ${P.goldDim})`, color: forgotLoading ? P.muted : '#0b0e13', fontSize: 15, fontWeight: 700, letterSpacing: .5, cursor: forgotLoading ? 'not-allowed' : 'pointer', transition: 'all .25s', fontFamily: 'inherit' }}>
                    {forgotLoading ? 'Sending…' : 'Send Reset Link'}
                  </button>
                </form>
              )}
              <button type="button" onClick={() => setStepForgot(false)}
                style={{ width: '100%', marginTop: 14, padding: '10px', borderRadius: 12, border: 'none', background: 'none', color: P.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                ← Back to login
              </button>
            </>
          )}

          {/* ── Step 2: 2FA TOTP ── */}
          {step2fa && (
            <>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(201,169,110,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🔐</div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: P.text }}>Two-Factor Auth</h2>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: P.muted }}>Enter the code from your authenticator app</p>
                  </div>
                </div>
              </div>
              <form onSubmit={handleTotp}>
                <div style={{ marginBottom: 26 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: P.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                    6-Digit Code
                  </label>
                  <input
                    value={totpCode}
                    onChange={e => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    style={{
                      ...inputBase,
                      textAlign: 'center',
                      fontSize: 28,
                      fontWeight: 800,
                      letterSpacing: 12,
                      fontFamily: 'monospace',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = P.gold; e.target.style.boxShadow = `0 0 0 3px rgba(201,169,110,.15)`; }}
                    onBlur={(e) => { e.target.style.borderColor = P.border; e.target.style.boxShadow = 'none'; }}
                    required
                  />
                </div>
                <button type="submit" disabled={loading || totpCode.length !== 6}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                    background: totpCode.length === 6 && !loading ? `linear-gradient(135deg, ${P.gold}, ${P.goldDim})` : P.surface,
                    color: totpCode.length === 6 && !loading ? '#0b0e13' : P.muted,
                    fontSize: 15, fontWeight: 700, letterSpacing: .5,
                    cursor: totpCode.length === 6 && !loading ? 'pointer' : 'not-allowed',
                    transition: 'all .25s', fontFamily: 'inherit',
                    boxShadow: totpCode.length === 6 && !loading ? '0 6px 24px rgba(201,169,110,.3)' : 'none',
                  }}
                >
                  {loading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 16, height: 16, border: `2px solid ${P.muted}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
                      Verifying…
                    </span>
                  ) : 'Verify & Sign In'}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep2fa(false); setTempToken(''); setTotpCode(''); setError(''); }}
                  style={{ width: '100%', marginTop: 10, padding: '10px', borderRadius: 12, border: 'none', background: 'none', color: P.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
                >← Back to login</button>
              </form>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          textAlign: 'center', marginTop: 28, fontSize: 12, color: P.muted,
          animation: mounted ? 'fadeUp .7s ease-out .3s both' : 'none',
        }}>
          <span style={{ letterSpacing: 1 }}>{resolveBrandName(branding).toUpperCase()}</span>
          <span style={{ margin: '0 8px', opacity: .3 }}>·</span>
          <span>Smart Salon Management System</span>
          <span style={{ margin: '0 8px', opacity: .3 }}>·</span>
          <span style={{ opacity: .5 }}>Hexalyte Innovation</span>
        </div>
      </div>

      {/* Spinner keyframe (for loading state) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
