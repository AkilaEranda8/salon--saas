import React, { useEffect, useState } from 'react';

const REFRESH_SECONDS = 60;

const GearIcon = ({ size = 64, spin = false }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="url(#gearGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    style={spin ? { animation: 'spinGear 6s linear infinite', display: 'block' } : { display: 'block' }}
  >
    <defs>
      <linearGradient id="gearGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6366F1" />
        <stop offset="100%" stopColor="#8B5CF6" />
      </linearGradient>
    </defs>
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
    <path d="M19.622 10.395l-1.097-2.65L20 6l-2-2-1.735 1.483-2.707-1.113L12.935 2h-1.954l-.623 2.37-2.707 1.113L6 4 4 6l1.475 1.745-1.097 2.65L2 11v2l2.378.605 1.097 2.65L4 18l2 2 1.735-1.483 2.707 1.113L11.065 22h1.954l.623-2.37 2.707-1.113L18 20l2-2-1.475-1.745 1.097-2.65L22 13v-2l-2.378-.605Z"/>
  </svg>
);

const SmallGear = ({ size = 28, reverse = false }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="#334155" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ animation: `spinGear ${reverse ? '4s' : '5s'} linear infinite ${reverse ? 'reverse' : ''}`, display: 'block' }}
  >
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
    <path d="M19.622 10.395l-1.097-2.65L20 6l-2-2-1.735 1.483-2.707-1.113L12.935 2h-1.954l-.623 2.37-2.707 1.113L6 4 4 6l1.475 1.745-1.097 2.65L2 11v2l2.378.605 1.097 2.65L4 18l2 2 1.735-1.483 2.707 1.113L11.065 22h1.954l.623-2.37 2.707-1.113L18 20l2-2-1.475-1.745 1.097-2.65L22 13v-2l-2.378-.605Z"/>
  </svg>
);

const Dot = ({ delay }) => (
  <span style={{
    display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
    animation: `dotPulse 1.4s ease-in-out ${delay}s infinite`,
  }} />
);

export default function MaintenancePage() {
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          window.location.reload();
          return REFRESH_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const progress = ((REFRESH_SECONDS - countdown) / REFRESH_SECONDS) * 100;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Sora:wght@700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0A0F1E; }

        @keyframes spinGear {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes dotPulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40%            { transform: scale(1.1); opacity: 1; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-12px); }
        }
        @keyframes progressFill {
          from { width: 0%; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes orb1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%       { transform: translate(40px, -30px) scale(1.1); }
          66%       { transform: translate(-20px, 20px) scale(0.95); }
        }
        @keyframes orb2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%       { transform: translate(-30px, 20px) scale(1.08); }
          66%       { transform: translate(25px, -15px) scale(0.97); }
        }
        .maint-card {
          animation: fadeUp 0.7s cubic-bezier(0.22,1,0.36,1) both;
        }
        .refresh-btn {
          transition: all 0.18s ease;
        }
        .refresh-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(99,102,241,0.45) !important;
        }
        .refresh-btn:active {
          transform: translateY(0);
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        background: '#0A0F1E',
        fontFamily: "'Inter', sans-serif",
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Background orbs */}
        <div style={{
          position: 'absolute', top: '15%', left: '10%',
          width: 420, height: 420, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
          animation: 'orb1 12s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '15%', right: '8%',
          width: 360, height: 360, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)',
          animation: 'orb2 15s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.04) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />

        {/* Card */}
        <div className="maint-card" style={{
          maxWidth: 520, width: '100%',
          background: 'linear-gradient(160deg, #111827 0%, #0F172A 100%)',
          border: '1px solid rgba(99,102,241,0.18)',
          borderRadius: 28,
          padding: '48px 40px 40px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset',
          position: 'relative',
          overflow: 'hidden',
        }}>

          {/* Top shimmer line */}
          <div style={{
            position: 'absolute', top: 0, left: '15%', right: '15%', height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), transparent)',
          }} />

          {/* Gears cluster */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 36, position: 'relative' }}>
            {/* Floating main gear */}
            <div style={{ animation: 'float 3.5s ease-in-out infinite' }}>
              <div style={{
                width: 100, height: 100, borderRadius: 24,
                background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
                border: '1px solid rgba(99,102,241,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 40px rgba(99,102,241,0.15)',
              }}>
                <GearIcon size={52} spin />
              </div>
            </div>
            {/* Small gears */}
            <div style={{ position: 'absolute', top: -4, right: '28%', opacity: 0.5 }}>
              <SmallGear size={22} />
            </div>
            <div style={{ position: 'absolute', bottom: -2, left: '28%', opacity: 0.4 }}>
              <SmallGear size={18} reverse />
            </div>
          </div>

          {/* Badge */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 99, padding: '5px 14px',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#818CF8',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#6366F1',
                boxShadow: '0 0 8px #6366F1',
                animation: 'dotPulse 1.4s ease-in-out infinite',
              }} />
              Scheduled Maintenance
            </span>
          </div>

          {/* Heading */}
          <h1 style={{
            textAlign: 'center',
            fontSize: 34, fontWeight: 900, lineHeight: 1.15,
            fontFamily: "'Sora', 'Inter', sans-serif",
            color: '#F1F5F9',
            letterSpacing: '-0.5px',
            marginBottom: 14,
          }}>
            We'll be back<br />
            <span style={{ background: 'linear-gradient(90deg, #6366F1, #A78BFA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              very soon
            </span>
          </h1>

          {/* Description */}
          <p style={{
            textAlign: 'center',
            fontSize: 14.5, color: '#64748B', lineHeight: 1.7,
            marginBottom: 36,
            fontWeight: 400,
          }}>
            Our team is applying updates to improve your experience.
            The system will be back online shortly.
          </p>

          {/* Progress bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{
              height: 5, borderRadius: 99,
              background: 'rgba(255,255,255,0.05)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #6366F1, #8B5CF6)',
                borderRadius: 99,
                transition: 'width 1s linear',
                boxShadow: '0 0 10px rgba(99,102,241,0.5)',
              }} />
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: 10,
            }}>
              <span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>
                Auto-refreshing in
              </span>
              <span style={{ fontSize: 12, color: '#818CF8', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {countdown}s
              </span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '28px 0' }} />

          {/* Loading dots + refresh button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12.5, color: '#475569', fontWeight: 500, marginRight: 4 }}>Working on it</span>
              <Dot delay={0} /><Dot delay={0.2} /><Dot delay={0.4} />
            </div>
            <button
              className="refresh-btn"
              onClick={() => window.location.reload()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '9px 20px',
                background: 'linear-gradient(135deg, #6366F1, #7C3AED)',
                color: '#fff', border: 'none',
                borderRadius: 10, cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
                boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M8 16H3v5"/>
              </svg>
              Refresh now
            </button>
          </div>

          {/* Footer note */}
          <p style={{ textAlign: 'center', fontSize: 12, color: '#1E293B', marginTop: 28, fontWeight: 500 }}>
            Need help? Contact{' '}
            <a href="mailto:support@hexalyte.com" style={{ color: '#6366F1', textDecoration: 'none', fontWeight: 600 }}>
              support@hexalyte.com
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
