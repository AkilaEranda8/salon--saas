import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../api/axios';
import { resolveBrandLogo, resolveBrandName } from '../../utils/branding';

/* ─── Flat nav label map ─────────────────────────────────────────────── */

const PAGE_LABELS = {
  '/dashboard':     'Dashboard',
  '/calendar':      'Calendar',
  '/walk-in':       'Walk-in',
  '/walkin':        'Walk-in',
  '/appointments':  'Appointments',
  '/payments':      'Payments',
  '/customers':     'Customers',
  '/packages':      'Packages',
  '/recurring':     'Recurring',
  '/services':      'Services',
  '/inventory':     'Inventory',
  '/staff':         'Staff',
  '/commission':    'Commission',
  '/attendance':    'Attendance',
  '/reports':       'Reports',
  '/support':       'Support Tickets',
  '/reviews':       'Reviews',
  '/expenses':      'Expenses',
  '/reminders':     'Reminders',
  '/notifications': 'Notifications',
  '/branding':      'Branding Settings',
  '/themes':        'Theme Options',
  '/branches':      'Branches',
  '/users':         'Users',
};

/* ─── Formatted date ─────────────────────────────────────────────────── */

function formatDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month:   'long',
    day:     'numeric',
    year:    'numeric',
  });
}

/* ─── SVG icons ──────────────────────────────────────────────────────── */

const BellIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);

/* ─── User dropdown ──────────────────────────────────────────────────── */

function UserDropdown({ user, onClose, onLogout }) {
  return (
    <div style={{
      position:     'absolute',
      right:        0,
      top:          'calc(100% + 8px)',
      width:        220,
      background:   '#fff',
      border:       '1px solid #EAECF0',
      borderRadius: 14,
      boxShadow:    '0 12px 32px rgba(16,24,40,0.14)',
      zIndex:       300,
      overflow:     'hidden',
      fontFamily:   "'Inter', sans-serif",
    }}>
      <div style={{
        padding:      '14px 16px',
        borderBottom: '1px solid #F2F4F7',
        background:   '#FAFBFC',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#101828' }}>{user?.name}</div>
        <div style={{ fontSize: 11, color: '#98A2B3', textTransform: 'capitalize', marginTop: 2 }}>
          {user?.role}
        </div>
      </div>
      <button
        onClick={() => { onClose(); onLogout(); }}
        style={{
          width:          '100%',
          padding:        '11px 16px',
          background:     'none',
          border:         'none',
          cursor:         'pointer',
          textAlign:      'left',
          fontSize:       13,
          color:          '#DC2626',
          fontWeight:     600,
          display:        'flex',
          alignItems:     'center',
          gap:            8,
          fontFamily:     "'Inter', sans-serif",
          transition:     'background 0.12s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Sign out
      </button>
    </div>
  );
}

/* ─── Topbar ─────────────────────────────────────────────────────────── */

export default function Topbar({ onMenuClick }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { isDark } = useTheme();
  const [notifCount, setNotifCount] = useState(0);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef(null);
  const tenantBranding = user?.tenant || {};
  const brandName = resolveBrandName(tenantBranding);
  const brandLogo = resolveBrandLogo(tenantBranding, 'header');

  const pageName = PAGE_LABELS[location.pathname] ?? brandName;

  // Fetch unread reminder count
  useEffect(() => {
    let cancelled = false;
    api.get('/reminders').then(res => {
      if (cancelled) return;
      const items = Array.isArray(res.data) ? res.data : (res.data?.rows ?? []);
      const unread = items.filter(r => !r.is_read && r.status !== 'completed').length;
      setNotifCount(unread || 0);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [location.pathname]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropOpen) return;
    const handler = e => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <>
      <header style={{
        height:         60,
        background:     isDark ? '#0B1220' : '#FFFFFF',
        borderBottom:   `1px solid ${isDark ? '#1F2937' : '#EAECF0'}`,
        padding:        '0 28px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        flexShrink:     0,
        fontFamily:     "'Inter', sans-serif",
        gap:            12,
        position:       'relative',
      }}>
        {/* ── Left: Hamburger + Breadcrumb ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <button
            onClick={onMenuClick}
            style={{
              background:   'none',
              border:       'none',
              cursor:       'pointer',
              padding:      '7px 8px',
              borderRadius: 8,
              color:        isDark ? '#CBD5E1' : '#344054',
              display:      'flex',
              flexDirection:'column',
              gap:          4.5,
              flexShrink:   0,
              transition:   'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = isDark ? '#1E293B' : '#F2F4F7'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span style={{ display:'block', width:19, height:2.2, background:'currentColor', borderRadius:2 }} />
            <span style={{ display:'block', width:19, height:2.2, background:'currentColor', borderRadius:2 }} />
            <span style={{ display:'block', width:19, height:2.2, background:'currentColor', borderRadius:2 }} />
          </button>

          <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
            {brandLogo && (
              <img
                src={brandLogo}
                alt={`${brandName} logo`}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  objectFit: 'cover',
                  background: '#000',
                }}
              />
            )}
            <span style={{ fontSize:14, color:isDark ? '#94A3B8' : '#667085', fontWeight:500, whiteSpace:'nowrap' }}>{brandName}</span>
            <span style={{ color:isDark ? '#334155' : '#D0D5DD', fontSize:14, fontWeight:400 }}>/</span>
            <span style={{
              fontSize:     14,
              fontWeight:   700,
              color:        isDark ? '#E2E8F0' : '#101828',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
            }}>
              {pageName}
            </span>
          </div>
        </div>

        {/* ── Right: Bell + Date + User ── */}
        <div style={{ display:'flex', alignItems:'center', gap:16, flexShrink:0 }}>
          {/* Notification bell */}
          <button
            onClick={() => navigate('/reminders')}
            style={{
              position:     'relative',
              background:   'none',
              border:       'none',
              cursor:       'pointer',
              padding:      '7px',
              borderRadius: 10,
              color:        isDark ? '#CBD5E1' : '#475467',
              display:      'flex',
              alignItems:   'center',
              justifyContent:'center',
              transition:   'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = isDark ? '#1E293B' : '#F2F4F7'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <BellIcon />
            {notifCount > 0 && (
              <span style={{
                position:       'absolute',
                top:            2,
                right:          2,
                background:     '#EF4444',
                color:          '#fff',
                fontSize:       9,
                fontWeight:     800,
                borderRadius:   10,
                minWidth:       17,
                height:         17,
                padding:        '0 4px',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                lineHeight:     1,
                pointerEvents:  'none',
                border:         '2px solid #fff',
                fontFamily:     "'Inter',sans-serif",
              }}>
                {notifCount > 99 ? '99+' : notifCount}
              </span>
            )}
          </button>

          {/* Date */}
          <span className="topbar-date" style={{
            fontSize:   13,
            color:      isDark ? '#94A3B8' : '#475467',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            display:    'none',
          }}>
            {formatDate()}
          </span>

          {/* Divider */}
          <div className="topbar-divider" style={{
            width:      1,
            height:     28,
            background: isDark ? '#1F2937' : '#E4E7EC',
            display:    'none',
          }} />

          {/* User avatar + dropdown */}
          <div ref={dropRef} style={{ position:'relative' }}>
            <button
              onClick={() => setDropOpen(o => !o)}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          10,
                padding:      '5px 6px 5px 5px',
                background:   dropOpen ? (isDark ? '#1E293B' : '#F2F4F7') : 'transparent',
                border:       'none',
                borderRadius: 12,
                cursor:       'pointer',
                transition:   'background 0.15s',
              }}
              onMouseEnter={e => { if (!dropOpen) e.currentTarget.style.background = isDark ? '#1E293B' : '#F9FAFB'; }}
              onMouseLeave={e => { if (!dropOpen) e.currentTarget.style.background = dropOpen ? (isDark ? '#1E293B' : '#F2F4F7') : 'transparent'; }}
            >
              <div style={{
                width:          36,
                height:         36,
                borderRadius:   '50%',
                background:     'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                color:          '#fff',
                fontWeight:     700,
                fontSize:       13,
                flexShrink:     0,
                letterSpacing:  '0.02em',
                border:         '2px solid #E0E7FF',
              }}>
                {initials}
              </div>
              <div className="topbar-user-name" style={{ textAlign:'left', display:'none', flexDirection:'column' }}>
                <span style={{ fontSize:13, fontWeight:700, color:'#101828', whiteSpace:'nowrap', lineHeight:1.3 }}>
                  {user?.name}
                </span>
                <span style={{ fontSize:11, color:'#98A2B3', textTransform:'capitalize', lineHeight:1.3 }}>
                  {user?.role}
                </span>
              </div>
              <svg className="topbar-user-name" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#98A2B3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display:'none' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {dropOpen && (
              <UserDropdown user={user} onClose={() => setDropOpen(false)} onLogout={handleLogout} />
            )}
          </div>
        </div>

        <style>{`
          @media(min-width:900px){.topbar-date{display:block!important}.topbar-divider{display:block!important}}
          @media(min-width:680px){.topbar-user-name{display:flex!important}}
        `}</style>
      </header>
    </>
  );
}
