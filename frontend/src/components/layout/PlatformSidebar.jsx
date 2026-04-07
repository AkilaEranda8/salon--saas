import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Ico = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const NAV = [
  {
    label: 'PLATFORM',
    items: [
      {
        path: '/platform/dashboard',
        label: 'Overview',
        icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
      },
      {
        path: '/platform/tenants',
        label: 'Tenants',
        icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
      },
    ],
  },
  {
    label: 'BILLING',
    items: [
      {
        path: '/platform/subscriptions',
        label: 'Subscriptions',
        icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
      },
    ],
  },
];

const W_FULL = 240;
const W_COLL = 64;

const C = {
  bg:         '#1E1B4B',
  bgHover:    '#2D2A5E',
  bgActive:   '#4338CA',
  border:     'rgba(255,255,255,0.08)',
  text:       '#C7D2FE',
  textMuted:  '#818CF8',
  textActive: '#FFFFFF',
  groupLabel: '#6366F1',
  logo:       '#A5B4FC',
};

export default function PlatformSidebar({ collapsed, onToggle }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleNav = (path) => navigate(path);
  const handleLogout = async () => { await logout(); navigate('/login'); };

  return (
    <div style={{
      width: collapsed ? W_COLL : W_FULL,
      minWidth: collapsed ? W_COLL : W_FULL,
      background: C.bg,
      borderRight: `1px solid ${C.border}`,
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.2s ease, min-width 0.2s ease',
      overflow: 'hidden',
      height: '100vh',
    }}>
      {/* Logo */}
      <div style={{
        height: 60,
        display: 'flex',
        alignItems: 'center',
        padding: collapsed ? '0 20px' : '0 16px',
        borderBottom: `1px solid ${C.border}`,
        gap: 10,
        cursor: 'pointer',
        flexShrink: 0,
      }} onClick={onToggle}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: '#4338CA',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        {!collapsed && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>ZaneSalon</div>
            <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, letterSpacing: 0.5 }}>PLATFORM ADMIN</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {NAV.map((group) => (
          <div key={group.label} style={{ marginBottom: 8 }}>
            {!collapsed && (
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
                color: C.groupLabel, padding: '8px 20px 4px',
              }}>
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const active = location.pathname === item.path ||
                             location.pathname.startsWith(item.path + '/');
              return (
                <button key={item.path}
                  onClick={() => handleNav(item.path)}
                  title={collapsed ? item.label : undefined}
                  style={{
                    display: 'flex', alignItems: 'center',
                    gap: 10,
                    width: collapsed ? 48 : 'calc(100% - 16px)',
                    padding: collapsed ? '10px 0' : '9px 16px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    background: active ? C.bgActive : 'transparent',
                    border: 'none', cursor: 'pointer',
                    borderRadius: 8,
                    margin: '1px 8px',
                    color: active ? C.textActive : C.text,
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.bgHover; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Ico d={item.icon} size={16} />
                  {!collapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* User area */}
      <div style={{
        padding: collapsed ? '12px 8px' : '12px 16px',
        borderTop: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: '#4338CA',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>
              {(user?.name || user?.username || 'P')[0].toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name || user?.username}
              </div>
              <div style={{ fontSize: 11, color: C.textMuted }}>Platform Admin</div>
            </div>
          </div>
        )}
        <button onClick={handleLogout} style={{
          display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 8, width: '100%', padding: collapsed ? '8px 0' : '8px 10px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: C.text, fontSize: 13, borderRadius: 6,
        }}
          onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <Ico d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" size={16} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );
}
