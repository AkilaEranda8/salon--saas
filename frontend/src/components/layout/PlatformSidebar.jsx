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
    label: 'SYSTEM',
    items: [
      {
        path: '/platform/monitoring',
        label: 'Monitoring',
        icon: 'M3 12h4l3-9 4 18 3-9h4',
      },
      {
        path: '/platform/features',
        label: 'Feature Studio',
        icon: 'M12 3l2.9 5.9L21 10l-4.5 4.4L17.6 21 12 17.9 6.4 21l1.1-6.6L3 10l6.1-1.1L12 3z',
      },
      {
        path: '/platform/system',
        label: 'System Control',
        icon: 'M12 6V4m0 16v-2m8-6h-2M6 12H4m12.95 4.95l-1.4-1.4M8.45 8.45l-1.4-1.4m9.9 0l-1.4 1.4m-7.1 7.1l-1.4 1.4M12 16a4 4 0 100-8 4 4 0 000 8z',
      },
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      {
        path: '/platform/subscriptions',
        label: 'Subscriptions',
        icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
      },
      {
        path: '/platform/plans',
        label: 'Plans',
        icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
      },
      {
        path: '/platform/invoices',
        label: 'Invoices',
        icon: 'M9 12h6m-6 4h6m2-5a2 2 0 00-2-2H7a2 2 0 00-2 2m14-2a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2h10a2 2 0 012 2z',
      },
      {
        path: '/platform/bank-slip-approvals',
        label: 'Bank Slip Approvals',
        icon: 'M9 12l2 2 4-4M7 20H5a2 2 0 01-2-2V9.414a1 1 0 01.293-.707l5.414-5.414A1 1 0 0110 3h7a2 2 0 012 2v1m0 16h2a2 2 0 002-2v-5.144a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012 12.172V3',
      },
      {
        path: '/platform/admins',
        label: 'Admins',
        icon: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M8.5 7a4 4 0 100-8 4 4 0 000 8m12 14v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
      },
      {
        path: '/platform/support',
        label: 'Support Tickets',
        icon: 'M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4-.933L2 17l1.058-3.173A6.797 6.797 0 012 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM8 10h.01M12 10h.01M16 10h.01',
      },
    ],
  },
];

const W_FULL = 256;
const W_COLL = 68;

export default function PlatformSidebar({ collapsed, onToggle }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [hoveredPath, setHoveredPath] = useState(null);
  const [logoutHover, setLogoutHover] = useState(false);

  const handleNav = (path) => navigate(path);
  const handleLogout = async () => { await logout(); navigate('/platform/login'); };

  const initial = (user?.name || user?.username || 'P')[0].toUpperCase();

  return (
    <div style={{
      width: collapsed ? W_COLL : W_FULL,
      minWidth: collapsed ? W_COLL : W_FULL,
      background: 'linear-gradient(180deg, #13111C 0%, #1A1730 60%, #1E1B4B 100%)',
      borderRight: '1px solid rgba(139,92,246,0.12)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.25s cubic-bezier(.4,0,.2,1), min-width 0.25s cubic-bezier(.4,0,.2,1)',
      overflow: 'hidden',
      height: '100vh',
      position: 'relative',
    }}>

      {/* subtle top glow */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 180,
        background: 'radial-gradient(ellipse at 50% -20%, rgba(99,102,241,0.18) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* ── Logo / Brand ───────────────────────── */}
      <div
        onClick={onToggle}
        style={{
          height: 68,
          display: 'flex',
          alignItems: 'center',
          padding: collapsed ? '0 18px' : '0 20px',
          borderBottom: '1px solid rgba(139,92,246,0.1)',
          gap: 12,
          cursor: 'pointer',
          flexShrink: 0,
          userSelect: 'none',
          position: 'relative',
          zIndex: 1,
        }}>
        {/* logo icon */}
        <div style={{
          width: 36, height: 36,
          borderRadius: 10,
          background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 4px 14px rgba(99,102,241,0.45)',
        }}>
          <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>

        {!collapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.1, letterSpacing: -0.3 }}>
              ZaneSalon
            </div>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 1.8,
              color: '#818CF8', marginTop: 2,
              background: 'linear-gradient(90deg,#818CF8,#A78BFA)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              PLATFORM ADMIN
            </div>
          </div>
        )}

        {/* collapse toggle arrow */}
        {!collapsed && (
          <div style={{
            marginLeft: 'auto',
            color: 'rgba(129,140,248,0.5)',
            fontSize: 16, lineHeight: 1,
            transition: 'color 0.15s',
          }}>›</div>
        )}
      </div>

      {/* ── Navigation ─────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0 6px', position: 'relative', zIndex: 1 }}>
        {NAV.map((group, gi) => (
          <div key={group.label} style={{ marginBottom: gi < NAV.length - 1 ? 4 : 0 }}>
            {!collapsed && (
              <div style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: 1.6,
                color: 'rgba(99,102,241,0.6)', padding: '10px 22px 5px',
                textTransform: 'uppercase',
              }}>
                {group.label}
              </div>
            )}
            {collapsed && gi > 0 && (
              <div style={{
                height: 1,
                background: 'rgba(139,92,246,0.1)',
                margin: '6px 14px',
              }} />
            )}
            {group.items.map((item) => {
              const active = location.pathname === item.path ||
                             location.pathname.startsWith(item.path + '/');
              const hovered = hoveredPath === item.path && !active;

              return (
                <div key={item.path} style={{ position: 'relative', margin: '2px 10px' }}>
                  {/* active left accent bar */}
                  {active && (
                    <div style={{
                      position: 'absolute', left: 0, top: '50%',
                      transform: 'translateY(-50%)',
                      width: 3, height: '65%', minHeight: 20,
                      borderRadius: 2,
                      background: 'linear-gradient(180deg,#818CF8,#6366F1)',
                      boxShadow: '0 0 8px rgba(99,102,241,0.7)',
                    }} />
                  )}
                  <button
                    onClick={() => handleNav(item.path)}
                    title={collapsed ? item.label : undefined}
                    onMouseEnter={() => setHoveredPath(item.path)}
                    onMouseLeave={() => setHoveredPath(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      width: '100%',
                      padding: collapsed ? '11px 0' : '9px 12px 9px 16px',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      background: active
                        ? 'linear-gradient(90deg,rgba(99,102,241,0.22),rgba(99,102,241,0.06))'
                        : hovered
                          ? 'rgba(139,92,246,0.08)'
                          : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      borderRadius: 9,
                      color: active ? '#C4B5FD' : hovered ? '#A5B4FC' : '#94A3B8',
                      fontSize: 13,
                      fontWeight: active ? 600 : 400,
                      transition: 'background 0.15s, color 0.15s',
                      textAlign: 'left',
                      letterSpacing: 0.1,
                    }}
                  >
                    <span style={{
                      display: 'flex', alignItems: 'center',
                      color: active ? '#A78BFA' : hovered ? '#818CF8' : '#64748B',
                      transition: 'color 0.15s',
                      filter: active ? 'drop-shadow(0 0 5px rgba(139,92,246,0.6))' : 'none',
                    }}>
                      <Ico d={item.icon} size={16} />
                    </span>
                    {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                    {!collapsed && active && (
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: '#818CF8',
                        boxShadow: '0 0 6px rgba(129,140,248,0.8)',
                        flexShrink: 0,
                      }} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── User / Logout ──────────────────────── */}
      <div style={{
        padding: collapsed ? '12px 10px' : '12px 14px',
        borderTop: '1px solid rgba(139,92,246,0.1)',
        flexShrink: 0,
        position: 'relative',
        zIndex: 1,
      }}>
        {!collapsed && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 10px',
            borderRadius: 10,
            background: 'rgba(99,102,241,0.07)',
            border: '1px solid rgba(139,92,246,0.12)',
            marginBottom: 8,
          }}>
            {/* avatar */}
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0,
              boxShadow: '0 0 0 2px rgba(139,92,246,0.3)',
            }}>
              {initial}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: '#E2E8F0',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {user?.name || user?.username}
              </div>
              <div style={{
                fontSize: 10, fontWeight: 600,
                color: '#818CF8', letterSpacing: 0.5,
              }}>
                Platform Admin
              </div>
            </div>
            {/* online dot */}
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#34D399',
              boxShadow: '0 0 8px rgba(52,211,153,0.7)',
              marginLeft: 'auto', flexShrink: 0,
            }} />
          </div>
        )}

        {/* logout button */}
        <button
          onClick={handleLogout}
          onMouseEnter={() => setLogoutHover(true)}
          onMouseLeave={() => setLogoutHover(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 9,
            width: '100%',
            padding: collapsed ? '10px 0' : '9px 12px',
            background: logoutHover ? 'rgba(239,68,68,0.1)' : 'transparent',
            border: logoutHover ? '1px solid rgba(239,68,68,0.2)' : '1px solid transparent',
            cursor: 'pointer',
            color: logoutHover ? '#FCA5A5' : '#64748B',
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 9,
            transition: 'all 0.15s',
          }}
        >
          <Ico d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" size={15} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );
}
