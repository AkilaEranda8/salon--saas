import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const P = {
  bg:      '#0b0e13',
  card:    '#13161d',
  surface: '#1a1e27',
  border:  '#252a35',
  gold:    '#c9a96e',
  goldDim: '#9a7d4e',
  text:    '#f1f0ec',
  muted:   '#7c8190',
};

const ANIMS = `
@keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
@keyframes spin   { to { transform: rotate(360deg); } }
`;

export default function ResetPasswordPage() {
  const { token }    = useParams();
  const navigate     = useNavigate();

  const [newPwd,     setNewPwd]     = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd,    setShowPwd]    = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState(false);

  const inputBase = {
    width: '100%', padding: '13px 16px', borderRadius: 12, fontSize: 15,
    color: P.text, background: P.surface, outline: 'none',
    border: `1.5px solid ${P.border}`, boxSizing: 'border-box',
    fontFamily: "'DM Sans', sans-serif", transition: 'border-color .2s',
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPwd.length < 8)      { setError('Password must be at least 8 characters.'); return; }
    if (newPwd !== confirmPwd)  { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/reset-password/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ newPassword: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Reset failed.'); setLoading(false); return; }
      setSuccess(true);
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: `radial-gradient(ellipse 80% 60% at 50% -10%, #1a1510 0%, ${P.bg} 70%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem', fontFamily: "'DM Sans', sans-serif",
    }}>
      <style>{ANIMS}</style>
      <div style={{ width: '100%', maxWidth: 420, animation: 'fadeUp .7s ease-out both' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 700, color: P.text, margin: 0, letterSpacing: 2 }}>
            HEXA SALON
          </h1>
          <p style={{ color: P.muted, margin: '8px 0 0', fontSize: 13, letterSpacing: 4, textTransform: 'uppercase' }}>
            Reset Password
          </p>
        </div>

        <div style={{
          background: P.card, borderRadius: 24, border: `1px solid ${P.border}`,
          boxShadow: '0 20px 60px rgba(0,0,0,.35)', padding: '2.25rem 2rem 2rem',
        }}>
          {success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: P.text }}>Password Reset!</h2>
              <p style={{ margin: '10px 0 24px', fontSize: 14, color: P.muted }}>
                Your password has been updated. You can now log in with your new password.
              </p>
              <button onClick={() => navigate('/login')}
                style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: `linear-gradient(135deg, ${P.gold}, ${P.goldDim})`, color: '#0b0e13', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Go to Login
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: P.text }}>Set New Password</h2>
                <p style={{ margin: '6px 0 0', fontSize: 14, color: P.muted }}>Choose a strong password for your account</p>
              </div>

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 12, marginBottom: 18, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#fca5a5' }}>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: P.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                    New Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={newPwd}
                      onChange={e => { setNewPwd(e.target.value); setError(''); }}
                      placeholder="At least 8 characters"
                      autoFocus autoComplete="new-password"
                      style={{ ...inputBase, paddingRight: 46, fontFamily: showPwd ? 'monospace' : "'DM Sans', sans-serif" }}
                      onFocus={e => { e.target.style.borderColor = P.gold; e.target.style.boxShadow = `0 0 0 3px rgba(201,169,110,.15)`; }}
                      onBlur={e => { e.target.style.borderColor = P.border; e.target.style.boxShadow = 'none'; }}
                      required
                    />
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: P.muted, padding: 2, lineHeight: 1 }}>
                      {showPwd ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: 26 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: P.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPwd}
                    onChange={e => { setConfirmPwd(e.target.value); setError(''); }}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                    style={inputBase}
                    onFocus={e => { e.target.style.borderColor = P.gold; e.target.style.boxShadow = `0 0 0 3px rgba(201,169,110,.15)`; }}
                    onBlur={e => { e.target.style.borderColor = P.border; e.target.style.boxShadow = 'none'; }}
                    required
                  />
                </div>

                <button type="submit" disabled={loading}
                  style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: loading ? P.surface : `linear-gradient(135deg, ${P.gold}, ${P.goldDim})`, color: loading ? P.muted : '#0b0e13', fontSize: 15, fontWeight: 700, letterSpacing: .5, cursor: loading ? 'not-allowed' : 'pointer', transition: 'all .25s', fontFamily: 'inherit' }}>
                  {loading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 16, height: 16, border: `2px solid ${P.muted}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
                      Resetting…
                    </span>
                  ) : 'Reset Password'}
                </button>

                <button type="button" onClick={() => navigate('/login')}
                  style={{ width: '100%', marginTop: 10, padding: '10px', borderRadius: 12, border: 'none', background: 'none', color: P.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ← Back to login
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
