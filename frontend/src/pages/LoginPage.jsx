import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MaintenancePage from './MaintenancePage';
import { normalizeBranding, resolveBrandName } from '../utils/branding';

/* ── Theme palettes ── */
const DARK = {
  bg:       '#0B0D14',
  bgGrad:   'radial-gradient(ellipse 90% 70% at 50% -5%, #1C1624 0%, #0B0D14 65%)',
  card:     '#13151E',
  surface:  '#1C1F2B',
  border:   '#252935',
  text:     '#F1EFF8',
  muted:    '#7A8299',
  mutedBtn: '#4A5068',
  accent:   '#C9A96E',
  accentDim:'#9A7D4E',
  accentRgb:'201,169,110',
  orb1:     'rgba(124,58,237,0.10)',
  orb2:     'rgba(201,169,110,0.06)',
  inputBg:  '#1C1F2B',
  errBg:    'rgba(239,68,68,.10)',
  errBdr:   'rgba(239,68,68,.22)',
  errText:  '#FCA5A5',
  successBg:'rgba(5,150,105,.10)',
  successBdr:'rgba(5,150,105,.25)',
  successTx:'#6EE7B7',
};
const LIGHT = {
  bg:       '#F4F2FF',
  bgGrad:   'radial-gradient(ellipse 90% 70% at 50% -5%, #E9E4FF 0%, #F4F2FF 65%)',
  card:     '#FFFFFF',
  surface:  '#F8F7FF',
  border:   '#DDD9F5',
  text:     '#1A1230',
  muted:    '#7460AA',
  mutedBtn: '#B8ADDA',
  accent:   '#7C3AED',
  accentDim:'#5B21B6',
  accentRgb:'124,58,237',
  orb1:     'rgba(124,58,237,0.12)',
  orb2:     'rgba(201,169,110,0.08)',
  inputBg:  '#F8F7FF',
  errBg:    'rgba(239,68,68,.07)',
  errBdr:   'rgba(239,68,68,.20)',
  errText:  '#DC2626',
  successBg:'rgba(5,150,105,.07)',
  successBdr:'rgba(5,150,105,.22)',
  successTx:'#059669',
};

/* ── Keyframes ── */
const ANIMS = `
@keyframes fadeUp  { from { opacity:0; transform:translateY(22px); } to { opacity:1; transform:translateY(0); } }
@keyframes float   { 0%,100% { transform:translateY(0) rotate(-1deg); } 50% { transform:translateY(-8px) rotate(1deg); } }
@keyframes spin    { to { transform:rotate(360deg); } }
@keyframes pulse-ring-d { 0%{box-shadow:0 0 0 0 rgba(201,169,110,.45);} 70%{box-shadow:0 0 0 12px rgba(201,169,110,0);} 100%{box-shadow:0 0 0 0 rgba(201,169,110,0);} }
@keyframes pulse-ring-l { 0%{box-shadow:0 0 0 0 rgba(124,58,237,.35);} 70%{box-shadow:0 0 0 12px rgba(124,58,237,0);} 100%{box-shadow:0 0 0 0 rgba(124,58,237,0);} }
`;

/* ── SVG icons ── */
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

export default function LoginPage({ platformMode = false }) {
  const { login, logout, verify2FA } = useAuth();
  const navigate = useNavigate();

  const [dark,    setDark]    = useState(() => {
    const saved = localStorage.getItem('salon-login-theme');
    return saved ? saved === 'dark' : true;
  });
  const P = dark ? DARK : LIGHT;

  const [form,    setForm]    = useState({ username: '', password: '' });
  const [showPw,  setShowPw]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [maintenance, setMaintenance] = useState({ enabled: false, message: '' });
  const [mounted, setMounted] = useState(false);
  const [branding, setBranding] = useState(normalizeBranding());

  const [step2fa,   setStep2fa]   = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totpCode,  setTotpCode]  = useState('');

  const [stepForgot,     setStepForgot]     = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotSent,     setForgotSent]     = useState(false);
  const [forgotLoading,  setForgotLoading]  = useState(false);
  const [forgotError,    setForgotError]    = useState('');

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    localStorage.setItem('salon-login-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    let active = true;
    fetch('/api/branding/public')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (active && data) setBranding(normalizeBranding(data)); })
      .catch(() => {});
    fetch('/api/public/maintenance-status')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!active || !data) return;
        setMaintenance({ enabled: !!data.enabled, message: data.message || 'System is under maintenance. Please try again later.' });
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  if (maintenance.enabled) return <MaintenancePage />;

  const handleChange = e => { setForm(p => ({ ...p, [e.target.name]: e.target.value })); setError(''); };

  const handleSubmit = async e => {
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

  const handleForgot = async e => {
    e.preventDefault(); setForgotError('');
    if (!forgotUsername.trim()) { setForgotError('Please enter your username.'); return; }
    setForgotLoading(true);
    try {
      await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: forgotUsername.trim() }) });
      setForgotSent(true);
    } catch { setForgotError('Something went wrong. Please try again.'); }
    setForgotLoading(false);
  };

  const handleTotp = async e => {
    e.preventDefault();
    if (totpCode.length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setLoading(true); setError('');
    try {
      const data = await verify2FA({ tempToken, code: totpCode });
      if (platformMode && data?.user?.role !== 'platform_admin') { await logout(); setError('Platform admin account required.'); return; }
      navigate(data?.user?.role === 'platform_admin' ? '/platform/dashboard' : '/dashboard');
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid code. Please try again.');
    } finally { setLoading(false); }
  };

  const inputStyle = {
    width: '100%', padding: '13px 16px 13px 44px', borderRadius: 12, fontSize: 15,
    color: P.text, background: P.inputBg, outline: 'none',
    border: `1.5px solid ${P.border}`, boxSizing: 'border-box',
    fontFamily: 'inherit', transition: 'border-color .2s, box-shadow .2s',
  };
  const focusInput  = e => { e.target.style.borderColor = P.accent; e.target.style.boxShadow = `0 0 0 3px rgba(${P.accentRgb},.15)`; };
  const blurInput   = e => { e.target.style.borderColor = P.border; e.target.style.boxShadow = 'none'; };
  const iconStyle   = { position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color: P.muted, pointerEvents:'none', display:'flex', alignItems:'center' };

  const btnPrimary = (disabled) => ({
    width: '100%', padding: '14px', borderRadius: 14, border: 'none',
    background: disabled ? P.surface : `linear-gradient(135deg, ${P.accent}, ${P.accentDim})`,
    color: disabled ? P.muted : '#FFFFFF',
    fontSize: 15, fontWeight: 700, letterSpacing: .5,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all .22s', fontFamily: 'inherit',
    boxShadow: disabled ? 'none' : `0 6px 22px rgba(${P.accentRgb},.32)`,
    animation: disabled ? 'none' : (dark ? 'pulse-ring-d 2.2s ease-out infinite' : 'pulse-ring-l 2.2s ease-out infinite'),
  });

  const sectionTitle = (t) => (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: P.text }}>{t.title}</h2>
      <p style={{ margin: '5px 0 0', fontSize: 13.5, color: P.muted }}>{t.sub}</p>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: P.bgGrad,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem 1rem',
      fontFamily: "'Inter','DM Sans',sans-serif",
      position: 'relative', overflow: 'hidden',
      transition: 'background .35s',
    }}>
      <style>{ANIMS}</style>

      {/* ── Orbs ── */}
      <div style={{ position:'absolute', top:'-12%', left:'-8%', width:440, height:440, borderRadius:'50%', background:`radial-gradient(circle, ${P.orb1} 0%, transparent 70%)`, pointerEvents:'none', transition:'background .35s' }} />
      <div style={{ position:'absolute', bottom:'-18%', right:'-8%', width:520, height:520, borderRadius:'50%', background:`radial-gradient(circle, ${P.orb2} 0%, transparent 70%)`, pointerEvents:'none', transition:'background .35s' }} />

      {/* ── Theme toggle ── */}
      <button
        onClick={() => setDark(d => !d)}
        title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        style={{
          position: 'fixed', top: 20, right: 20, zIndex: 999,
          width: 44, height: 44, borderRadius: 12,
          background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
          border: `1.5px solid ${P.border}`,
          color: P.muted, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all .22s', backdropFilter: 'blur(8px)',
          boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.08)',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = P.accent; e.currentTarget.style.color = P.accent; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = P.border; e.currentTarget.style.color = P.muted; }}
      >
        {dark ? <IconSun /> : <IconMoon />}
      </button>

      <div style={{
        width: '100%', maxWidth: 440,
        animation: mounted ? 'fadeUp .65s ease-out both' : 'none',
      }}>
        {/* ── Logo ── */}
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{
            display: 'inline-block',
            animation: 'float 5s ease-in-out infinite',
            filter: dark
              ? 'drop-shadow(0 12px 32px rgba(201,169,110,0.30))'
              : 'drop-shadow(0 12px 32px rgba(124,58,237,0.25))',
            transition: 'filter .35s',
          }}>
            <img
              src="/kogo.png?v=3"
              alt="Hexa Salon"
              style={{ width: 200, height: 200, objectFit: 'contain', display: 'block' }}
            />
          </div>
          <p style={{
            color: P.muted, margin: '16px 0 0', fontSize: 12,
            letterSpacing: 4, textTransform: 'uppercase', fontWeight: 600,
            transition: 'color .35s',
          }}>
            {platformMode ? 'Platform Administration' : 'Smart Salon Management System'}
          </p>
        </div>

        {/* ── Card ── */}
        <div style={{
          background: P.card,
          borderRadius: 24,
          border: `1px solid ${P.border}`,
          boxShadow: dark
            ? '0 24px 64px rgba(0,0,0,0.45), 0 1px 0 rgba(201,169,110,.06) inset'
            : '0 24px 64px rgba(124,58,237,0.10), 0 1px 0 rgba(255,255,255,0.9) inset',
          padding: '2.25rem 2rem 2rem',
          backdropFilter: 'blur(24px)',
          transition: 'background .35s, border-color .35s, box-shadow .35s',
        }}>

          {/* Maintenance banner */}
          {maintenance.enabled && (
            <div style={{ padding:'10px 14px', borderRadius:12, marginBottom:18, background:'rgba(245,158,11,.12)', border:'1px solid rgba(245,158,11,.35)', color:'#FBBF24', fontSize:13, fontWeight:600 }}>
              ⚠️ {maintenance.message}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding:'10px 14px', borderRadius:12, marginBottom:18, background:P.errBg, border:`1px solid ${P.errBdr}`, display:'flex', alignItems:'center', gap:8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={P.errText} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ fontSize:13, fontWeight:500, color:P.errText }}>{error}</span>
            </div>
          )}

          {/* ── Login form ── */}
          {!step2fa && !stepForgot && (
            <>
              {sectionTitle({ title: platformMode ? 'Platform Admin Login' : 'Welcome back', sub: platformMode ? 'Sign in to manage the full SaaS platform' : 'Sign in to your account to continue' })}
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display:'block', fontSize:11.5, fontWeight:700, color:P.muted, marginBottom:7, textTransform:'uppercase', letterSpacing:1 }}>Username</label>
                  <div style={{ position:'relative' }}>
                    <span style={iconStyle}><IconUser /></span>
                    <input name="username" value={form.username} onChange={handleChange}
                      placeholder="Enter your username" autoFocus autoComplete="username"
                      style={inputStyle} onFocus={focusInput} onBlur={blurInput} required />
                  </div>
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display:'block', fontSize:11.5, fontWeight:700, color:P.muted, marginBottom:7, textTransform:'uppercase', letterSpacing:1 }}>Password</label>
                  <div style={{ position:'relative' }}>
                    <span style={iconStyle}><IconLock /></span>
                    <input name="password" value={form.password} onChange={handleChange}
                      type={showPw ? 'text' : 'password'} placeholder="Enter your password"
                      autoComplete="current-password"
                      style={{ ...inputStyle, paddingRight: 46 }}
                      onFocus={focusInput} onBlur={blurInput} required />
                    <button type="button" onClick={() => setShowPw(s => !s)}
                      style={{ position:'absolute', right:13, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:P.muted, padding:3, display:'flex', alignItems:'center' }}>
                      <IconEye open={showPw} />
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading || maintenance.enabled}
                  style={btnPrimary(loading || maintenance.enabled)}
                  onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {loading ? (
                    <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:16, height:16, border:`2px solid rgba(255,255,255,0.35)`, borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin .8s linear infinite' }} />
                      Signing in…
                    </span>
                  ) : 'Sign In'}
                </button>
                <div style={{ textAlign:'center', marginTop:14 }}>
                  <button type="button" onClick={() => { setStepForgot(true); setForgotSent(false); setForgotUsername(''); setForgotError(''); }}
                    style={{ background:'none', border:'none', color:P.accent, fontSize:13, cursor:'pointer', fontFamily:'inherit', opacity:0.85 }}>
                    Forgot password?
                  </button>
                </div>
              </form>
            </>
          )}

          {/* ── Forgot password ── */}
          {stepForgot && (
            <>
              {sectionTitle({ title: 'Reset Password', sub: 'Enter your username to receive a reset link' })}
              {forgotError && (
                <div style={{ padding:'10px 14px', borderRadius:12, marginBottom:16, background:P.errBg, border:`1px solid ${P.errBdr}`, fontSize:13, fontWeight:500, color:P.errText }}>
                  {forgotError}
                </div>
              )}
              {forgotSent ? (
                <div style={{ padding:'18px 16px', borderRadius:14, background:P.successBg, border:`1px solid ${P.successBdr}`, textAlign:'center' }}>
                  <div style={{ fontSize:32, marginBottom:10 }}>📧</div>
                  <p style={{ margin:0, color:P.successTx, fontSize:14, fontWeight:700 }}>Check your email</p>
                  <p style={{ margin:'6px 0 0', color:P.muted, fontSize:13 }}>If an account was found with an email on file, a reset link has been sent.</p>
                </div>
              ) : (
                <form onSubmit={handleForgot}>
                  <div style={{ marginBottom:22 }}>
                    <label style={{ display:'block', fontSize:11.5, fontWeight:700, color:P.muted, marginBottom:7, textTransform:'uppercase', letterSpacing:1 }}>Username</label>
                    <div style={{ position:'relative' }}>
                      <span style={iconStyle}><IconUser /></span>
                      <input value={forgotUsername} onChange={e => { setForgotUsername(e.target.value); setForgotError(''); }}
                        placeholder="Enter your username" autoFocus autoComplete="username"
                        style={inputStyle} onFocus={focusInput} onBlur={blurInput} required />
                    </div>
                  </div>
                  <button type="submit" disabled={forgotLoading} style={btnPrimary(forgotLoading)}>
                    {forgotLoading ? 'Sending…' : 'Send Reset Link'}
                  </button>
                </form>
              )}
              <button type="button" onClick={() => setStepForgot(false)}
                style={{ width:'100%', marginTop:14, padding:'10px', borderRadius:12, border:'none', background:'none', color:P.muted, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
                ← Back to login
              </button>
            </>
          )}

          {/* ── 2FA TOTP ── */}
          {step2fa && (
            <>
              {sectionTitle({ title: 'Two-Factor Auth', sub: 'Enter the 6-digit code from your authenticator app' })}
              <form onSubmit={handleTotp}>
                <div style={{ marginBottom:24 }}>
                  <label style={{ display:'block', fontSize:11.5, fontWeight:700, color:P.muted, marginBottom:7, textTransform:'uppercase', letterSpacing:1 }}>6-Digit Code</label>
                  <input
                    value={totpCode}
                    onChange={e => { setTotpCode(e.target.value.replace(/\D/g,'').slice(0,6)); setError(''); }}
                    placeholder="000000" maxLength={6} autoFocus inputMode="numeric" autoComplete="one-time-code"
                    style={{ ...inputStyle, paddingLeft:16, textAlign:'center', fontSize:28, fontWeight:800, letterSpacing:14, fontFamily:'monospace' }}
                    onFocus={focusInput} onBlur={blurInput} required
                  />
                </div>
                <button type="submit" disabled={loading || totpCode.length !== 6} style={btnPrimary(loading || totpCode.length !== 6)}>
                  {loading ? (
                    <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:16, height:16, border:'2px solid rgba(255,255,255,0.35)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin .8s linear infinite' }} />
                      Verifying…
                    </span>
                  ) : 'Verify & Sign In'}
                </button>
                <button type="button" onClick={() => { setStep2fa(false); setTempToken(''); setTotpCode(''); setError(''); }}
                  style={{ width:'100%', marginTop:10, padding:'10px', borderRadius:12, border:'none', background:'none', color:P.muted, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
                  ← Back to login
                </button>
              </form>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          textAlign:'center', marginTop:24, fontSize:12, color:P.muted,
          animation: mounted ? 'fadeUp .65s ease-out .25s both' : 'none',
          transition:'color .35s',
        }}>
          <span style={{ fontWeight:600, letterSpacing:1 }}>{resolveBrandName(branding).toUpperCase()}</span>
          <span style={{ margin:'0 8px', opacity:.3 }}>·</span>
          <span>Smart Salon Management System</span>
          <span style={{ margin:'0 8px', opacity:.3 }}>·</span>
          <span style={{ opacity:.5 }}>Hexalyte Innovation</span>
        </div>
      </div>
    </div>
  );
}
