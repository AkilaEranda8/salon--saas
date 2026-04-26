import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

/* ── SVG icon helper ──────────────────────────────────────── */
const Ico = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

/* ── Navigation definition ────────────────────────────────── */
const NAV = [
  { label: 'OVERVIEW', items: [
    { path: '/platform/dashboard', label: 'Dashboard',
      icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
    { path: '/platform/tenants', label: 'Tenants',
      icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  ]},
  { label: 'SYSTEM', items: [
    { path: '/platform/monitoring', label: 'Monitoring',
      icon: 'M3 12h4l3-9 4 18 3-9h4' },
    { path: '/platform/features', label: 'Feature Studio',
      icon: 'M12 3l2.9 5.9L21 10l-4.5 4.4L17.6 21 12 17.9 6.4 21l1.1-6.6L3 10l6.1-1.1L12 3z' },
    { path: '/platform/system', label: 'System Control',
      icon: 'M12 6V4m0 16v-2m8-6h-2M6 12H4m12.95 4.95l-1.4-1.4M8.45 8.45l-1.4-1.4m9.9 0l-1.4 1.4m-7.1 7.1l-1.4 1.4M12 16a4 4 0 100-8 4 4 0 000 8z' },
    { path: '/platform/smtp-sms', label: 'SMTP & SMS',
      icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  ]},
  { label: 'BILLING', items: [
    { path: '/platform/subscriptions', label: 'Subscriptions',
      icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
    { path: '/platform/plans', label: 'Plans',
      icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
    { path: '/platform/invoices', label: 'Invoices',
      icon: 'M9 12h6m-6 4h6m2-5a2 2 0 00-2-2H7a2 2 0 00-2 2m14-2a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2h10a2 2 0 012 2z' },
    { path: '/platform/bank-slip-approvals', label: 'Bank Slips',
      icon: 'M9 12l2 2 4-4M7 20H5a2 2 0 01-2-2V9.414a1 1 0 01.293-.707l5.414-5.414A1 1 0 0110 3h7a2 2 0 012 2v1m0 16h2a2 2 0 002-2v-5.144a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012 12.172V3' },
  ]},
  { label: 'ADMIN', items: [
    { path: '/platform/admins', label: 'Admins',
      icon: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M8.5 7a4 4 0 100-8 4 4 0 000 8m12 14v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
    { path: '/platform/support', label: 'Support Tickets',
      icon: 'M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4-.933L2 17l1.058-3.173A6.797 6.797 0 012 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM8 10h.01M12 10h.01M16 10h.01' },
  ]},
];

/* ── Theme palettes ───────────────────────────────────────── */
const THEME = {
  light: {
    bg:           '#FFFFFF',
    sidebarBg:    '#FAFBFC',
    bgGrad:       'linear-gradient(180deg, #FAFBFC 0%, #F4F5F7 100%)',
    topGlow:      'radial-gradient(ellipse at 50% -30%, rgba(99,102,241,0.08) 0%, transparent 70%)',
    border:       '#EAECF0',
    borderSub:    '#F2F4F7',
    navHover:     '#F0EDFF',
    navActiveBg:  'linear-gradient(90deg, rgba(99,102,241,0.12) 0%, rgba(99,102,241,0.03) 100%)',
    navActiveTx:  '#4338CA',
    navActiveIc:  '#6366F1',
    accent:       '#6366F1',
    accentGrad:   'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
    accentGlow:   'rgba(99,102,241,0.30)',
    text:         '#101828',
    textSub:      '#475467',
    textMuted:    '#98A2B3',
    groupLabel:   '#98A2B3',
    userBg:       '#F4F5F7',
    userBorder:   '#EAECF0',
    scrollThumb:  '#D0D5DD',
    scrollHover:  '#B0B8C4',
    badge:        { bg: '#EEF2FF', text: '#4338CA', border: '#C7D2FE' },
    online:       '#10B981',
    onlineBorder: '#FFFFFF',
    danger:       '#EF4444',
    dangerHover:  '#FEF2F2',
    dangerBorder: 'rgba(239,68,68,0.18)',
    shadow:       '0 1px 3px rgba(16,24,40,0.06)',
    logoText:     '#101828',
    logoSub:      '#6366F1',
    tooltipBg:    '#1E293B',
    tooltipBd:    'rgba(255,255,255,0.08)',
    activeDot:    '#6366F1',
  },
  dark: {
    bg:           '#0C0A15',
    sidebarBg:    '#13111F',
    bgGrad:       'linear-gradient(180deg, #0E0C18 0%, #110F20 40%, #13102A 100%)',
    topGlow:      'radial-gradient(ellipse at 50% -30%, rgba(99,102,241,0.15) 0%, transparent 70%)',
    border:       '#1C1935',
    borderSub:    'rgba(99,102,241,0.08)',
    navHover:     'rgba(99,102,241,0.07)',
    navActiveBg:  'linear-gradient(90deg, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0.04) 100%)',
    navActiveTx:  '#C4B5FD',
    navActiveIc:  '#A78BFA',
    accent:       '#6366F1',
    accentGrad:   'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
    accentGlow:   'rgba(99,102,241,0.50)',
    text:         '#F1F5F9',
    textSub:      '#94A3B8',
    textMuted:    '#475569',
    groupLabel:   'rgba(99,102,241,0.45)',
    userBg:       'rgba(99,102,241,0.06)',
    userBorder:   'rgba(99,102,241,0.12)',
    scrollThumb:  '#1E1B35',
    scrollHover:  '#2A2650',
    badge:        { bg: 'rgba(99,102,241,0.12)', text: '#818CF8', border: 'rgba(99,102,241,0.25)' },
    online:       '#34D399',
    onlineBorder: '#0C0A15',
    danger:       '#EF4444',
    dangerHover:  'rgba(239,68,68,0.10)',
    dangerBorder: 'rgba(239,68,68,0.20)',
    shadow:       '2px 0 24px rgba(0,0,0,0.35)',
    logoText:     '#FFFFFF',
    logoSub:      null,
    tooltipBg:    'linear-gradient(135deg, #1E1B32, #13111F)',
    tooltipBd:    'rgba(99,102,241,0.15)',
    activeDot:    '#818CF8',
  },
};

const W_FULL = 262;
const W_COLL = 72;

/* ── NavItem component ────────────────────────────────────── */
function NavItem({ item, collapsed, isActive, onClick, T }) {
  const [hov, setHov] = useState(false);

  return (
    <div
      style={{ position: 'relative', marginBottom: 1 }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* accent bar */}
      {isActive && !collapsed && (
        <div style={{
          position: 'absolute', left: 0, top: 6, bottom: 6,
          width: 3, borderRadius: 2,
          background: T.accentGrad,
          boxShadow: `0 0 10px ${T.accentGlow}`,
        }} />
      )}

      <div
        onClick={() => onClick(item.path)}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap:            11,
          padding:        collapsed ? '10px 14px' : '9px 14px 9px 18px',
          borderRadius:   10,
          cursor:         'pointer',
          background:     isActive ? T.navActiveBg : hov ? T.navHover : 'transparent',
          transition:     'all 0.18s ease',
          userSelect:     'none',
        }}
      >
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 20, height: 20, flexShrink: 0,
          color: isActive ? T.navActiveIc : hov ? T.accent : T.textMuted,
          transition: 'color 0.18s',
          filter: isActive ? `drop-shadow(0 0 6px ${T.accentGlow})` : 'none',
        }}>
          <Ico d={item.icon} size={17} />
        </span>
        {!collapsed && (
          <span style={{
            fontSize:      13,
            fontWeight:    isActive ? 700 : 500,
            fontFamily:    "'Inter', sans-serif",
            whiteSpace:    'nowrap',
            color:         isActive ? T.navActiveTx : hov ? T.text : T.textSub,
            transition:    'color 0.18s',
            letterSpacing: isActive ? '-0.01em' : 0,
          }}>
            {item.label}
          </span>
        )}
        {!collapsed && isActive && (
          <span style={{
            marginLeft: 'auto',
            width: 6, height: 6, borderRadius: '50%',
            background: T.activeDot,
            boxShadow: `0 0 8px ${T.activeDot}CC`,
            flexShrink: 0,
          }} />
        )}
      </div>

      {/* collapsed tooltip */}
      {collapsed && hov && (
        <div style={{
          position:      'absolute',
          left:          'calc(100% + 10px)',
          top:           '50%',
          transform:     'translateY(-50%)',
          background:    T.tooltipBg,
          color:         '#fff',
          fontSize:      12,
          fontWeight:    600,
          padding:       '6px 14px',
          borderRadius:  10,
          whiteSpace:    'nowrap',
          pointerEvents: 'none',
          zIndex:        999,
          boxShadow:     '0 4px 20px rgba(0,0,0,0.40)',
          fontFamily:    "'Inter', sans-serif",
          border:        `1px solid ${T.tooltipBd}`,
        }}>
          {item.label}
        </div>
      )}
    </div>
  );
}

/* ── PlatformSidebar ──────────────────────────────────────── */
export default function PlatformSidebar({ collapsed, onToggle }) {
  const { user, logout } = useAuth();
  const { isDark, mode, toggleMode } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [themeHov, setThemeHov] = useState(false);
  const [signOutHov, setSignOutHov] = useState(false);

  const T = THEME[isDark ? 'dark' : 'light'];

  const handleNav    = (path) => navigate(path);
  const handleLogout = async () => { await logout(); navigate('/platform/login'); };

  const initials = (user?.name || user?.username || 'P')
    .split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const ec = collapsed;

  return (
    <aside style={{
      width:          ec ? W_COLL : W_FULL,
      minWidth:       ec ? W_COLL : W_FULL,
      background:     T.bgGrad,
      borderRight:    `1px solid ${T.border}`,
      display:        'flex',
      flexDirection:  'column',
      overflow:       'hidden',
      height:         '100vh',
      position:       'relative',
      transition:     'width 0.24s cubic-bezier(.4,0,.2,1), min-width 0.24s cubic-bezier(.4,0,.2,1), background 0.22s',
      fontFamily:     "'Inter', sans-serif",
      boxShadow:      T.shadow,
    }}>

      {/* ambient top glow */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 200,
        background: T.topGlow,
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ── Logo / Brand ────────────────────────── */}
      <div style={{
        height:         64,
        display:        'flex',
        alignItems:     'center',
        justifyContent: ec ? 'center' : 'space-between',
        padding:        ec ? '0 16px' : '0 18px',
        borderBottom:   `1px solid ${T.border}`,
        flexShrink:     0,
        gap:            8,
        position:       'relative',
        zIndex:         1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, overflow: 'hidden' }}>
          {/* logo mark */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: T.accentGrad,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 16px ${T.accentGlow}`,
            }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            {/* online indicator */}
            <div style={{
              position: 'absolute', bottom: -1, right: -1,
              width: 9, height: 9, borderRadius: '50%',
              background: T.online,
              border: `2px solid ${T.onlineBorder}`,
            }} />
          </div>

          {!ec && (
            <div style={{ overflow: 'hidden' }}>
              <div style={{
                fontSize:      15,
                fontWeight:    800,
                color:         T.logoText,
                lineHeight:    1.2,
                letterSpacing: '-0.03em',
                fontFamily:    "'Sora', 'Manrope', 'Inter', sans-serif",
                whiteSpace:    'nowrap',
              }}>
                ZaneSalon
              </div>
              <div style={{
                fontSize:      9.5,
                fontWeight:    700,
                letterSpacing: '0.12em',
                marginTop:     1,
                textTransform: 'uppercase',
                fontFamily:    "'Inter', sans-serif",
                ...(T.logoSub
                  ? { color: T.logoSub }
                  : {
                      background: 'linear-gradient(90deg, #818CF8, #A78BFA)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor:  'transparent',
                    }
                ),
              }}>
                Platform
              </div>
            </div>
          )}
        </div>

        {/* collapse / expand toggle */}
        {!ec ? (
          <button onClick={onToggle} style={{
            background: 'none', border: `1.5px solid ${T.border}`, cursor: 'pointer',
            padding: '5px', borderRadius: 8, color: T.textMuted, display: 'flex',
            alignItems: 'center', flexShrink: 0, transition: 'all 0.18s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; e.currentTarget.style.background = `${T.accent}14`; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textMuted; e.currentTarget.style.background = 'none'; }}>
            <Ico d="M11 19l-7-7 7-7m8 14l-7-7 7-7" size={14} />
          </button>
        ) : (
          <button onClick={onToggle} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: T.textMuted, display: 'flex', alignItems: 'center',
            padding: 0, transition: 'color 0.18s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = T.accent; }}
          onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; }}>
            <Ico d="M13 5l7 7-7 7M5 5l7 7-7 7" size={14} />
          </button>
        )}
      </div>

      {/* ── User card ───────────────────────────── */}
      <div style={{
        padding:      ec ? '10px 8px' : '10px 14px',
        borderBottom: `1px solid ${T.border}`,
        flexShrink:   0,
        position:     'relative',
        zIndex:       1,
      }}>
        <div style={{
          background:     T.userBg,
          border:         `1.5px solid ${T.userBorder}`,
          borderRadius:   12,
          padding:        ec ? '10px 0' : '10px 12px',
          display:        'flex',
          alignItems:     'center',
          justifyContent: ec ? 'center' : 'flex-start',
          gap:            10,
          transition:     'all 0.18s',
        }}>
          {/* avatar */}
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: T.accentGrad,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 800, fontSize: 12.5, flexShrink: 0,
            boxShadow: `0 2px 8px ${T.accentGlow}`,
            letterSpacing: '0.04em',
          }}>
            {initials}
          </div>
          {!ec && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: T.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                lineHeight: 1.3,
              }}>
                {user?.name || user?.username}
              </div>
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                fontSize: 9.5, fontWeight: 700, marginTop: 3,
                padding: '1px 8px', borderRadius: 99,
                background: T.badge.bg, color: T.badge.text,
                border: `1px solid ${T.badge.border}`,
                letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>
                Platform Admin
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Navigation ──────────────────────────── */}
      <nav className="plat-sb-nav" style={{
        flex: 1, overflowY: 'auto',
        padding: ec ? '8px 8px' : '8px 10px',
        position: 'relative', zIndex: 1,
      }}>
        <style>{`
          .plat-sb-nav::-webkit-scrollbar { width: 4px; }
          .plat-sb-nav::-webkit-scrollbar-track { background: transparent; }
          .plat-sb-nav::-webkit-scrollbar-thumb { background: ${T.scrollThumb}; border-radius: 99px; }
          .plat-sb-nav::-webkit-scrollbar-thumb:hover { background: ${T.scrollHover}; }
        `}</style>
        {NAV.map((group, gi) => (
          <div key={group.label} style={{ marginBottom: 2 }}>
            {!ec && gi > 0 && (
              <div style={{ height: 1, background: T.border, margin: '8px 6px 10px' }} />
            )}
            {ec && gi > 0 && (
              <div style={{ height: 1, background: T.borderSub, margin: '6px 14px' }} />
            )}
            {!ec && (
              <div style={{
                fontSize:       9.5,
                fontWeight:     800,
                color:          T.groupLabel,
                textTransform:  'uppercase',
                letterSpacing:  '0.12em',
                padding:        '4px 14px 6px',
              }}>
                {group.label}
              </div>
            )}
            {group.items.map(item => (
              <NavItem
                key={item.path}
                item={item}
                collapsed={ec}
                isActive={isActive(item.path)}
                onClick={handleNav}
                T={T}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* ── Bottom / Sign out ───────────────────── */}
      <div style={{
        borderTop: `1px solid ${T.border}`,
        padding: ec ? '10px 8px' : '10px 10px',
        flexShrink: 0,
        position: 'relative',
        zIndex: 1,
      }}>
        <div
          onClick={toggleMode}
          onMouseEnter={() => setThemeHov(true)}
          onMouseLeave={() => setThemeHov(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: ec ? 'center' : 'flex-start',
            gap: 11,
            padding: ec ? '10px 14px' : '9px 14px',
            borderRadius: 10,
            cursor: 'pointer',
            background: themeHov ? T.navHover : 'transparent',
            border: `1px solid ${themeHov ? T.userBorder : 'transparent'}`,
            transition: 'all 0.18s',
            userSelect: 'none',
            marginBottom: 8,
          }}
        >
          <span style={{
            display: 'flex', flexShrink: 0, width: 20, height: 20,
            alignItems: 'center', justifyContent: 'center',
            color: themeHov ? T.accent : T.textSub,
            transition: 'color 0.18s ease',
          }}>
            {isDark ? (
              <Ico d="M12 3a1 1 0 00-1 1 7 7 0 009 9 1 1 0 001-1A9 9 0 0112 3z" size={17} />
            ) : (
              <Ico d="M12 3v2m0 14v2m9-9h-2M5 12H3m14.364 6.364-1.414-1.414M8.05 8.05 6.636 6.636m10.728 0L15.95 8.05M8.05 15.95l-1.414 1.414M12 16a4 4 0 100-8 4 4 0 000 8z" size={17} />
            )}
          </span>
          {!ec && (
            <>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                {isDark ? 'Light Mode' : 'Dark Mode'}
              </span>
              <span style={{
                marginLeft: 'auto',
                fontSize: 10,
                fontWeight: 700,
                color: T.badge.text,
                background: T.badge.bg,
                border: `1px solid ${T.badge.border}`,
                borderRadius: 999,
                padding: '3px 8px',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}>
                {mode}
              </span>
            </>
          )}
        </div>

        <div
          onClick={handleLogout}
          onMouseEnter={() => setSignOutHov(true)}
          onMouseLeave={() => setSignOutHov(false)}
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: ec ? 'center' : 'flex-start',
            gap:            11,
            padding:        ec ? '10px 14px' : '9px 14px',
            borderRadius:   10,
            cursor:         'pointer',
            background:     signOutHov ? T.dangerHover : 'transparent',
            border:         signOutHov ? `1px solid ${T.dangerBorder}` : '1px solid transparent',
            transition:     'all 0.18s',
            userSelect:     'none',
          }}
        >
          <span style={{
            display: 'flex', flexShrink: 0, width: 20, height: 20,
            alignItems: 'center', justifyContent: 'center',
            color: T.danger,
          }}>
            <Ico d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" size={17} />
          </span>
          {!ec && (
            <span style={{ fontSize: 13, fontWeight: 600, color: T.danger }}>
              Sign out
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
