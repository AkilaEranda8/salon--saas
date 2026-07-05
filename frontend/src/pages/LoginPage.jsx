import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MaintenancePage from './MaintenancePage';
import { normalizeBranding, resolveBrandName, resolveBrandLogo } from '../utils/branding';

const FEATURES = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    title: 'Smart Scheduling',
    desc: 'Appointments, walk-ins & calendar in one place',
    color: '#A78BFA',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
    ),
    title: 'Payments & Packages',
    desc: 'Record payments, bundles & membership plans',
    color: '#60A5FA',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
    title: 'Multi-Branch',
    desc: 'Manage every location from a single dashboard',
    color: '#F472B6',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
      </svg>
    ),
    title: 'AI Assistant',
    desc: 'Automate replies and grow customer engagement',
    color: '#34D399',
  },
];

const TRUST_BADGES = ['SSL Secure', 'Cloud Hosted', '24/7 Access'];

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
  showcase: 'linear-gradient(145deg, #5B21B6 0%, #4C1D95 28%, #312E81 55%, #1E1B4B 100%)',
  inputBg: '#FAFAFF',
  errBg: 'rgba(239,68,68,.07)',
  errBdr: 'rgba(239,68,68,.20)',
  errText: '#DC2626',
  successBg: 'rgba(16,185,129,.07)',
  successBdr: 'rgba(16,185,129,.22)',
  successTx: '#059669',
};

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap');

@keyframes loginFadeUp { from { opacity:0; transform:translateY(22px); } to { opacity:1; transform:translateY(0); } }
@keyframes loginFadeIn { from { opacity:0; } to { opacity:1; } }
@keyframes loginFloat { 0%,100% { transform:translateY(0) rotate(0deg); } 50% { transform:translateY(-10px) rotate(.4deg); } }
@keyframes loginSpin { to { transform:rotate(360deg); } }
@keyframes loginPulse { 0%,100% { opacity:.5; transform:scale(1); } 50% { opacity:1; transform:scale(1.15); } }
@keyframes loginOrb1 { 0%,100% { transform:translate(0,0) scale(1); } 50% { transform:translate(24px,-18px) scale(1.08); } }
@keyframes loginOrb2 { 0%,100% { transform:translate(0,0) scale(1); } 50% { transform:translate(-20px,14px) scale(1.06); } }
@keyframes loginShine { 0% { left:-120%; } 100% { left:120%; } }
@keyframes loginBarGrow { from { transform:scaleY(0); } to { transform:scaleY(1); } }

.login-shell {
  min-height: 100vh;
  display: flex;
  font-family: 'Inter', system-ui, sans-serif;
  background: var(--login-bg);
  color: var(--login-text);
}
.login-showcase {
  flex: 1.12;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 52px 60px;
  background: var(--login-showcase);
  color: #fff;
}
.login-showcase::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 15% 15%, rgba(167,139,250,.28) 0%, transparent 45%),
    radial-gradient(circle at 85% 75%, rgba(236,72,153,.18) 0%, transparent 42%),
    radial-gradient(circle at 60% 30%, rgba(96,165,250,.12) 0%, transparent 35%),
    linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px);
  background-size: auto, auto, auto, 56px 56px, 56px 56px;
  pointer-events: none;
}
.login-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
  z-index: 0;
}
.login-orb-1 {
  width: 320px; height: 320px;
  top: -80px; right: -60px;
  background: rgba(167,139,250,.35);
  animation: loginOrb1 9s ease-in-out infinite;
}
.login-orb-2 {
  width: 260px; height: 260px;
  bottom: 10%; left: -40px;
  background: rgba(244,114,182,.22);
  animation: loginOrb2 11s ease-in-out infinite;
}
.login-showcase > * { position: relative; z-index: 1; }
.login-headline {
  font-family: 'Outfit', 'Inter', sans-serif;
  margin: 0;
  font-size: clamp(30px, 3.4vw, 44px);
  font-weight: 800;
  line-height: 1.12;
  letter-spacing: -0.035em;
  max-width: 500px;
}
.login-headline span {
  background: linear-gradient(135deg, #fff 0%, #E9D5FF 45%, #FBCFE8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.login-panel {
  flex: 0 0 500px;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 44px 52px;
  background: var(--login-panel);
  border-left: 1px solid var(--login-border);
  position: relative;
  overflow: hidden;
}
.login-panel::before {
  content: '';
  position: absolute;
  top: -120px; right: -120px;
  width: 280px; height: 280px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(124,58,237,.08) 0%, transparent 70%);
  pointer-events: none;
}
.login-theme-btn {
  position: absolute;
  top: 22px;
  right: 22px;
  z-index: 2;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1.5px solid var(--login-border);
  background: var(--login-surface);
  color: var(--login-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .22s;
  box-shadow: 0 2px 8px rgba(0,0,0,.04);
}
.login-theme-btn:hover {
  border-color: var(--login-accent);
  color: var(--login-accent);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(124,58,237,.12);
}
.login-form-wrap {
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
  padding: 32px 30px 28px;
  border-radius: 24px;
  background: var(--login-form-bg);
  border: 1px solid var(--login-border);
  box-shadow: var(--login-form-shadow);
  animation: loginFadeUp .7s cubic-bezier(.22,1,.36,1) both;
  position: relative;
  z-index: 1;
}
.login-logo-ring {
  width: 88px;
  height: 88px;
  margin: 0 auto 14px;
  border-radius: 22px;
  padding: 3px;
  background: linear-gradient(135deg, var(--login-accent), #EC4899, var(--login-accent));
  box-shadow: 0 12px 32px rgba(124,58,237,.22);
  animation: loginFadeUp .7s cubic-bezier(.22,1,.36,1) .1s both;
}
.login-logo-inner {
  width: 100%;
  height: 100%;
  border-radius: 19px;
  background: var(--login-panel);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.login-logo-inner img {
  width: 58px;
  height: 58px;
  object-fit: contain;
}
.login-btn-primary {
  position: relative;
  overflow: hidden;
}
.login-btn-primary:not(:disabled)::after {
  content: '';
  position: absolute;
  top: 0; left: -120%;
  width: 60%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent);
  animation: loginShine 3.5s ease-in-out infinite;
}
.login-preview {
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,.14);
  background: linear-gradient(145deg, rgba(255,255,255,.12) 0%, rgba(255,255,255,.04) 100%);
  backdrop-filter: blur(20px);
  padding: 22px;
  box-shadow: 0 28px 70px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.12);
  animation: loginFloat 7s ease-in-out infinite;
}
.login-feature {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.08);
  margin-bottom: 10px;
  transition: background .2s, transform .2s, border-color .2s;
}
.login-feature:hover {
  background: rgba(255,255,255,.09);
  border-color: rgba(255,255,255,.16);
  transform: translateX(4px);
}
.login-feature-icon {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(255,255,255,.1);
  border: 1px solid rgba(255,255,255,.12);
}
.login-trust-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 28px;
}
.login-trust-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 99px;
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.12);
  letter-spacing: .02em;
}
.login-bar {
  flex: 1;
  border-radius: 4px 4px 0 0;
  background: linear-gradient(180deg, rgba(167,139,250,.9), rgba(167,139,250,.35));
  transform-origin: bottom;
  animation: loginBarGrow .8s cubic-bezier(.22,1,.36,1) both;
}
.login-mobile-hero {
  display: none;
  text-align: center;
  margin-bottom: 24px;
  padding: 20px 16px;
  border-radius: 18px;
  background: var(--login-showcase);
  color: #fff;
  position: relative;
  overflow: hidden;
}
.login-mobile-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 30%, rgba(167,139,250,.3), transparent 60%);
}
.login-mobile-hero > * { position: relative; z-index: 1; }
.login-form-logo { display: block; }
@media (max-width: 1024px) {
  .login-showcase { display: none; }
  .login-mobile-hero { display: block; }
  .login-form-logo { display: none; }
  .login-panel {
    flex: 1;
    border-left: none;
    padding: 28px 20px 36px;
    background: var(--login-bg);
  }
  .login-form-wrap {
    padding: 28px 22px 24px;
    box-shadow: var(--login-form-shadow);
  }
}
@media (max-width: 480px) {
  .login-panel { padding: 20px 14px 28px; }
  .login-form-wrap { padding: 24px 18px 20px; border-radius: 20px; }
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
  const bars = [42, 68, 55, 80, 62, 90, 74];
  return (
    <div className="login-preview">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', opacity: .75 }}>Today&apos;s overview</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, opacity: .8 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34D399', animation: 'loginPulse 2s ease-in-out infinite' }} />
          Live
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Revenue', value: 'Rs. 84K', color: '#C4B5FD' },
          { label: 'Bookings', value: '32', color: '#93C5FD' },
          { label: 'Walk-ins', value: '11', color: '#F9A8D4' },
        ].map((s) => (
          <div key={s.label} style={{
            background: 'rgba(255,255,255,.09)',
            borderRadius: 14,
            padding: '12px 12px',
            border: '1px solid rgba(255,255,255,.08)',
          }}>
            <div style={{ fontSize: 10, opacity: .65, marginBottom: 5, fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: s.color, fontFamily: "'Outfit',sans-serif" }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 52, marginBottom: 14, padding: '0 4px' }}>
        {bars.map((h, i) => (
          <div key={i} className="login-bar" style={{ height: `${h}%`, animationDelay: `${i * 0.06}s` }} />
        ))}
      </div>
      <div style={{ background: 'rgba(0,0,0,.15)', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,.06)' }}>
        {['Haircut · 10:30 AM', 'Color · 11:45 AM', 'Spa · 2:00 PM'].map((row, i) => (
          <div key={row} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
            borderBottom: i < 2 ? '1px solid rgba(255,255,255,.06)' : 'none',
          }}>
            <span style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: i === 0 ? 'rgba(52,211,153,.2)' : i === 1 ? 'rgba(251,191,36,.2)' : 'rgba(167,139,250,.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800,
              color: i === 0 ? '#6EE7B7' : i === 1 ? '#FCD34D' : '#C4B5FD',
            }}>
              {i + 1}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 500, opacity: .92 }}>{row}</span>
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
    '--login-form-bg': dark ? 'rgba(19,21,30,.85)' : '#FFFFFF',
    '--login-form-shadow': dark
      ? '0 24px 60px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04) inset'
      : '0 20px 50px rgba(124,58,237,.08), 0 4px 16px rgba(15,10,30,.04)',
  };

  const inputStyle = {
    width: '100%',
    padding: '13px 14px 13px 44px',
    borderRadius: 12,
    fontSize: 14.5,
    color: P.text,
    background: P.inputBg,
    outline: 'none',
    border: `1.5px solid ${P.border}`,
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color .2s, box-shadow .2s, background .2s',
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
    padding: '14px 16px',
    borderRadius: 12,
    border: 'none',
    background: disabled
      ? P.surface
      : `linear-gradient(135deg, ${P.accent} 0%, ${P.accentDim} 50%, #6D28D9 100%)`,
    color: disabled ? P.muted : '#FFFFFF',
    fontSize: 15,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'transform .2s, box-shadow .2s',
    fontFamily: 'inherit',
    boxShadow: disabled ? 'none' : `0 10px 28px rgba(${P.accentRgb},.35)`,
    letterSpacing: '.01em',
  });

  const sectionTitle = (t) => (
    <div style={{ marginBottom: 26 }}>
      <h1 style={{
        margin: 0,
        fontSize: 24,
        fontWeight: 800,
        color: P.text,
        letterSpacing: '-.03em',
        lineHeight: 1.2,
        fontFamily: "'Outfit', 'Inter', sans-serif",
      }}>
        {t.title}
      </h1>
      <p style={{ margin: '7px 0 0', fontSize: 13.5, color: P.muted, lineHeight: 1.55 }}>{t.sub}</p>
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
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 16px',
            borderRadius: 99,
            background: 'rgba(255,255,255,.1)',
            border: '1px solid rgba(255,255,255,.16)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            marginBottom: 30,
            backdropFilter: 'blur(8px)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 8px #34D399' }} />
            {platformMode ? 'Platform Console' : 'Salon Management SaaS'}
          </div>
          <h2 className="login-headline">
            {platformMode ? (
              <>Manage your entire <span>salon platform</span> from one place</>
            ) : (
              <>Run your salon smarter with <span>{brandName}</span></>
            )}
          </h2>
          <p style={{ margin: '18px 0 0', fontSize: 15.5, lineHeight: 1.7, opacity: .8, maxWidth: 460 }}>
            {platformMode
              ? 'Tenant management, subscriptions, monitoring and system controls — built for scale.'
              : 'Appointments, payments, inventory, loyalty and AI — everything your team needs in one cloud platform.'}
          </p>
          <div style={{ marginTop: 28 }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="login-feature">
                <div className="login-feature-icon" style={{ color: f.color }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3, fontFamily: "'Outfit',sans-serif" }}>{f.title}</div>
                  <div style={{ fontSize: 13, opacity: .72, lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="login-trust-row">
            {TRUST_BADGES.map((b) => (
              <span key={b} className="login-trust-pill">{b}</span>
            ))}
          </div>
        </div>

        <div>
          <PreviewMock />
          <p style={{ marginTop: 22, fontSize: 12, opacity: .5, textAlign: 'center', letterSpacing: '.02em' }}>
            Built by Hexalyte Innovation · Enterprise-ready
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

        <div className="login-mobile-hero">
          <div className="login-logo-ring" style={{ width: 64, height: 64, marginBottom: 10 }}>
            <div className="login-logo-inner">
              <img src={logoSrc} alt={brandName} onError={(e) => { e.currentTarget.src = '/kogo.png?v=6'; }} />
            </div>
          </div>
          <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 20 }}>{brandName}</div>
          <div style={{ fontSize: 12, opacity: .75, marginTop: 4 }}>Smart salon management</div>
        </div>

        <div className="login-form-wrap" style={{ opacity: mounted ? 1 : 0 }}>
          {/* Logo */}
          <div className="login-form-logo" style={{ textAlign: 'center', marginBottom: 28 }}>
            <div className="login-logo-ring">
              <div className="login-logo-inner">
                <img
                  src={logoSrc}
                  alt={brandName}
                  onError={(e) => { e.currentTarget.src = '/kogo.png?v=6'; }}
                />
              </div>
            </div>
            <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800, color: P.text, letterSpacing: '-.03em', fontFamily: "'Outfit',sans-serif" }}>
              {brandName}
            </div>
            <div style={{ marginTop: 5, fontSize: 12.5, color: P.muted, fontWeight: 500 }}>
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
                  className="login-btn-primary"
                  style={btnPrimary(loading || maintenance.enabled)}
                  onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 14px 32px rgba(${P.accentRgb},.4)`; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = loading ? 'none' : `0 10px 28px rgba(${P.accentRgb},.35)`; }}
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
                  <button type="submit" disabled={forgotLoading} className="login-btn-primary" style={btnPrimary(forgotLoading)}>
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
                <button type="submit" disabled={loading || totpCode.length !== 6} className="login-btn-primary" style={btnPrimary(loading || totpCode.length !== 6)}>
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

          <div style={{
            marginTop: 28,
            paddingTop: 18,
            borderTop: `1px solid ${P.border}`,
            textAlign: 'center',
            fontSize: 11.5,
            color: P.muted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}>
            <span style={{ fontWeight: 700, color: P.text, opacity: .85 }}>{brandName}</span>
            <span style={{ opacity: .3 }}>·</span>
            <span>Powered by Hexalyte Innovation</span>
          </div>
        </div>
      </main>
    </div>
  );
}
