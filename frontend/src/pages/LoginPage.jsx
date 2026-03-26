import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/* ── Palette ── */
const P = {
  bg: '#070b16',
  card: '#111827',
  surface: '#1f2937',
  border: '#334155',
  brand: '#6d5efc',
  brand2: '#17c9ff',
  text: '#f8fafc',
  muted: '#94a3b8',
  danger: '#ef4444',
};

/* ── Keyframes ── */
const ANIMS = `
@keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes blobFloat { 0%, 100% { transform: translateY(0px) translateX(0px); } 50% { transform: translateY(-18px) translateX(10px); } }
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
    width: '100%', padding: '13px 16px', borderRadius: 14, fontSize: 15,
    color: P.text, background: '#0f172a', outline: 'none',
    border: `1.5px solid ${P.border}`, boxSizing: 'border-box',
    fontFamily: "'DM Sans', sans-serif", transition: 'border-color .2s, box-shadow .2s',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: `radial-gradient(circle at 15% 15%, #1e1b4b 0%, ${P.bg} 45%, #020617 100%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      fontFamily: "'DM Sans', sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      <style>{ANIMS}</style>

      <div style={{ position:'absolute', top:'-10%', left:'-6%', width:360, height:360, borderRadius:'50%', background:'radial-gradient(circle, rgba(109,94,252,.28) 0%, transparent 68%)', filter:'blur(8px)', animation:'blobFloat 7s ease-in-out infinite', pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:'-14%', right:'-10%', width:420, height:420, borderRadius:'50%', background:'radial-gradient(circle, rgba(23,201,255,.22) 0%, transparent 70%)', filter:'blur(6px)', animation:'blobFloat 9s ease-in-out infinite', pointerEvents:'none' }} />

      <div style={{
        width: '100%',
        maxWidth: 980,
        borderRadius: 26,
        border: `1px solid ${P.border}`,
        boxShadow: '0 24px 72px rgba(2,6,23,.58)',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: '1.08fr .92fr',
        background: 'rgba(15,23,42,.78)',
        backdropFilter: 'blur(24px)',
        animation: mounted ? 'fadeUp .7s ease-out both' : 'none',
      }}>
        <div style={{
          padding: '2.4rem 2.3rem',
          borderRight: `1px solid ${P.border}`,
          background: 'linear-gradient(145deg, rgba(109,94,252,.16), rgba(23,201,255,.08) 45%, rgba(15,23,42,.35))',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 78, height: 78, borderRadius: 22,
              background: 'linear-gradient(135deg, #6d5efc, #17c9ff)',
              boxShadow: '0 14px 30px rgba(109,94,252,.38)',
              marginBottom: 20,
              color: '#fff',
              fontSize: 32,
              fontWeight: 700,
            }}>Z</div>
            <h1 style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 46,
              lineHeight: 1.05,
              fontWeight: 700,
              color: P.text,
              margin: 0,
            }}>
              Zane Salon
              <br />
              <span style={{ color: '#c4b5fd', fontSize: 34 }}>Control Hub</span>
            </h1>
            <p style={{ margin: '12px 0 0', color: '#cbd5e1', fontSize: 14 }}>
              Manage appointments, staff, payments, and customer flow in one modern dashboard.
            </p>
            <div style={{ marginTop: 24, display: 'grid', gap: 11 }}>
              {['Fast booking workflow', 'Live business insights', 'Secure role-based access'].map((item) => (
                <div key={item} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  fontSize: 13,
                  color: '#e2e8f0',
                  padding: '9px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,.12)',
                  background: 'rgba(15,23,42,.35)',
                }}>
                  <span style={{ color: '#a78bfa' }}>●</span>
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div style={{
            marginTop: 20,
            borderTop: '1px dashed rgba(255,255,255,.2)',
            paddingTop: 12,
            color: '#cbd5e1',
            fontSize: 12,
            letterSpacing: .4,
          }} />
          Built for teams that move fast
        </div>

        <div style={{
          background: 'rgba(15,23,42,.9)',
          padding: '2.2rem 2rem 1.9rem',
        }}>
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: P.text }}>
              Welcome back
            </h2>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: '#cbd5e1' }}>
              Sign in to continue to your workspace
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
                color: '#cbd5e1', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1,
              }}>Username</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: P.muted, pointerEvents: 'none' }}>
                  👤
                </span>
                <input name="username" value={form.username} onChange={handleChange}
                  placeholder="Enter your username" autoFocus autoComplete="username"
                  style={{ ...inputBase, paddingLeft: 42 }}
                  onFocus={(e) => { e.target.style.borderColor = P.brand; e.target.style.boxShadow = `0 0 0 3px rgba(109,94,252,.2)`; }}
                  onBlur={(e) => { e.target.style.borderColor = P.border; e.target.style.boxShadow = 'none'; }}
                  required />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 26 }}>
              <label style={{
                display: 'block', fontSize: 12, fontWeight: 600,
                color: '#cbd5e1', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1,
              }}>Password</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: P.muted, pointerEvents: 'none' }}>
                  🔒
                </span>
                <input name="password" value={form.password} onChange={handleChange}
                  type={showPw ? 'text' : 'password'} placeholder="Enter your password"
                  autoComplete="current-password"
                  style={{ ...inputBase, paddingLeft: 42, paddingRight: 46 }}
                  onFocus={(e) => { e.target.style.borderColor = P.brand; e.target.style.boxShadow = `0 0 0 3px rgba(109,94,252,.2)`; }}
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
                  : 'linear-gradient(135deg, #6d5efc, #17c9ff)',
                color: loading ? P.muted : '#ffffff',
                fontSize: 15, fontWeight: 700, letterSpacing: .5,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all .25s',
                fontFamily: 'inherit',
                boxShadow: loading ? 'none' : '0 8px 24px rgba(109,94,252,.35)',
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
          <div style={{
            textAlign: 'center',
            marginTop: 20,
            fontSize: 12,
            color: P.muted,
            letterSpacing: .4,
          }}>
            Need help? Contact your administrator
          </div>
        </div>
      </div>
    </div>
  );
}
