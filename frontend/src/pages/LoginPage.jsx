import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import salonLogo from '/salon-logo.png';

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

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();

  const [form,    setForm]    = useState({ username: '', password: '' });
  const [showPw,  setShowPw]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const handleChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(form);
      navigate('/dashboard');
    } catch (err) {
      setError(err?.response?.data?.message || 'Login failed. Please try again.');
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
            src={salonLogo}
            alt="Zane Salon logo"
            style={{
              width: 120,
              height: 120,
              objectFit: 'contain',
              borderRadius: 18,
              marginBottom: 16,
              boxShadow: `0 12px 36px rgba(201,169,110,.18)`,
              animation: 'float 4s ease-in-out infinite',
              background: '#000',
              padding: 8,
            }}
          />
          <h1 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 42, fontWeight: 700, color: P.text,
            margin: 0, letterSpacing: 2,
          }}>
            ZANE <span style={{ color: P.gold }}>SALON</span>
          </h1>
          <p style={{
            color: P.muted, margin: '8px 0 0', fontSize: 13,
            letterSpacing: 4, textTransform: 'uppercase', fontWeight: 500,
          }}>Management Suite</p>
        </div>

        {/* ── Card ── */}
        <div style={{
          background: P.card, borderRadius: 24,
          border: `1px solid ${P.border}`,
          boxShadow: '0 20px 60px rgba(0,0,0,.35), 0 1px 0 rgba(201,169,110,.08) inset',
          padding: '2.25rem 2rem 2rem',
          backdropFilter: 'blur(20px)',
        }}>
          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: P.text }}>
              Welcome back
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: P.muted }}>
              Sign in to your account
            </p>
          </div>

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

          <form onSubmit={handleSubmit}>
            {/* Username */}
            <div style={{ marginBottom: 18 }}>
              <label style={{
                display: 'block', fontSize: 12, fontWeight: 600,
                color: P.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1,
              }}>Username</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: P.muted, pointerEvents: 'none' }}>
                  👤
                </span>
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
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: P.muted, pointerEvents: 'none' }}>
                  🔒
                </span>
                <input name="password" value={form.password} onChange={handleChange}
                  type={showPw ? 'text' : 'password'} placeholder="Enter your password"
                  autoComplete="current-password"
                  style={{ ...inputBase, paddingLeft: 42, paddingRight: 46 }}
                  onFocus={(e) => { e.target.style.borderColor = P.gold; e.target.style.boxShadow = `0 0 0 3px rgba(201,169,110,.15)`; }}
                  onBlur={(e) => { e.target.style.borderColor = P.border; e.target.style.boxShadow = 'none'; }}
                  required />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
                    color: P.muted, padding: 2, lineHeight: 1,
                  }}>
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button type="submit" disabled={loading}
              style={{
                width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                background: loading
                  ? P.surface
                  : `linear-gradient(135deg, ${P.gold}, ${P.goldDim})`,
                color: loading ? P.muted : '#0b0e13',
                fontSize: 15, fontWeight: 700, letterSpacing: .5,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all .25s',
                fontFamily: 'inherit',
                boxShadow: loading ? 'none' : '0 6px 24px rgba(201,169,110,.3)',
                ...(loading ? {} : { animation: 'pulse-ring 2s ease-out infinite' }),
              }}
              onMouseEnter={(e) => { if(!loading) e.target.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.target.style.transform = 'translateY(0)'; }}
            >
              {loading ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 16, height: 16, border: `2px solid ${P.muted}`,
                    borderTopColor: 'transparent', borderRadius: '50%',
                    display: 'inline-block', animation: 'spin .8s linear infinite',
                  }} />
                  Signing in…
                </span>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        {/* ── Footer ── */}
        <div style={{
          textAlign: 'center', marginTop: 28, fontSize: 12, color: P.muted,
          animation: mounted ? 'fadeUp .7s ease-out .3s both' : 'none',
        }}>
          <span style={{ letterSpacing: 1 }}>ZANE SALON</span>
          <span style={{ margin: '0 8px', opacity: .3 }}>·</span>
          <span>Management Suite</span>
        </div>
      </div>

      {/* Spinner keyframe (for loading state) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
