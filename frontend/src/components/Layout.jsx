import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { colors, ROLE_COLORS } from './shared/theme';

const NAV_ITEMS = [
  { path: '/dashboard',    label: 'Dashboard',    icon: '⊞', roles: ['superadmin','admin','manager','staff'] },
  { path: '/calendar',     label: 'Calendar',     icon: '📅', roles: ['superadmin','admin','manager','staff'] },
  { path: '/appointments', label: 'Appointments', icon: '✂️', roles: ['superadmin','admin','manager','staff'] },
  { path: '/customers',    label: 'Customers',    icon: '👥', roles: ['superadmin','admin','manager','staff'] },
  { path: '/services',     label: 'Services',     icon: '💆', roles: ['superadmin','admin','manager','staff'] },
  { path: '/staff',        label: 'Staff',        icon: '👤', roles: ['superadmin','admin','manager'] },
  { path: '/commission',   label: 'Commission',   icon: '💰', roles: ['superadmin','admin','manager','staff'] },
  { path: '/payments',     label: 'Payments',     icon: '💳', roles: ['superadmin','admin','manager','staff'] },
  { path: '/expenses',     label: 'Expenses',     icon: '💸', roles: ['superadmin','admin','manager'] },
  { path: '/inventory',    label: 'Inventory',    icon: '📦', roles: ['superadmin','admin','manager'] },
  { path: '/attendance',   label: 'Attendance',   icon: '📋', roles: ['superadmin','admin','manager'] },
  { path: '/reminders',    label: 'Reminders',    icon: '🔔', roles: ['superadmin','admin','manager','staff'] },
  { path: '/reports',      label: 'Reports',      icon: '📊', roles: ['superadmin','admin','manager'] },
  { path: '/support',      label: 'Support Tickets', icon: '🛟', roles: ['superadmin','admin','manager','staff'] },
  { path: '/walk-in',       label: 'Walk-in',       icon: '🎫', roles: ['superadmin','admin','manager','staff'] },
  { path: '/notifications', label: 'Notifications',  icon: '📨', roles: ['superadmin','admin'] },
  { path: '/reviews',       label: 'Reviews',         icon: '⭐', roles: ['superadmin','admin','manager'] },
  { path: '/packages',      label: 'Packages',        icon: '🎁', roles: ['superadmin','admin','manager'] },
  { path: '/recurring',     label: 'Recurring',       icon: '🔁', roles: ['superadmin','admin','manager'] },
  { path: '/branches',      label: 'Branches',       icon: '🏢', roles: ['superadmin','admin'] },
  { path: '/users',        label: 'Users',        icon: '🔐', roles: ['superadmin'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const visibleNav = NAV_ITEMS.filter((n) => n.roles.includes(user?.role));
  const roleScheme = ROLE_COLORS[user?.role] || { bg: '#f1f5f9', text: '#334155' };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const sidebarW = collapsed ? 64 : 240;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: colors.bg, fontFamily: "'DM Sans', sans-serif" }}>
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside style={{
        width: sidebarW, flexShrink: 0, background: colors.dark,
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.25s ease', overflow: 'hidden',
        position: 'sticky', top: 0, height: '100vh',
      }}>
        {/* Logo */}
        <div style={{
          padding: collapsed ? '1.2rem 0' : '1.5rem 1.2rem',
          display: 'flex', alignItems: 'center', gap: 10,
          justifyContent: collapsed ? 'center' : 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          {!collapsed && (
            <div>
              <div style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: 1,
              }}>Zane Salon</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>Management System</div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 18, padding: 0 }}
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {visibleNav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center',
                gap: collapsed ? 0 : 10,
                padding: collapsed ? '10px 0' : '9px 16px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                textDecoration: 'none',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                borderLeft: isActive ? `3px solid ${colors.primary}` : '3px solid transparent',
                fontSize: 14, fontWeight: isActive ? 600 : 400,
                transition: 'all .15s',
              })}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div style={{
          padding: collapsed ? '12px 0' : '12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', gap: 10,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: user?.color || colors.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 13,
          }}>
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'capitalize' }}>{user?.role}</div>
            </div>
          )}
          {!collapsed && (
            <button onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 16, padding: 0 }} title="Sign Out">⎋</button>
          )}
        </div>

        {/* Token Display shortcut */}
        <div style={{
          padding: collapsed ? '10px 0' : '10px 12px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <button
            onClick={() => window.open(`/token-display?branchId=${user?.branchId || 1}`, '_blank')}
            title="Open Token Display Screen"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.65)',
              padding: collapsed ? '6px 8px' : '6px 12px',
              fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 14 }}>🖥</span>
            {!collapsed && <span>Token Display</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Topbar */}
        <header style={{
          background: colors.white,
          borderBottom: `1px solid ${colors.border}`,
          padding: '0 1.5rem',
          height: 60, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {user?.branch && (
              <span style={{
                background: user.branch.color + '18', color: user.branch.color,
                padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600,
              }}>
                🏢 {user.branch.name}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 13, color: colors.muted }}>
              {new Date().toLocaleDateString('en-PK', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
            <span style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: roleScheme.bg, color: roleScheme.text, textTransform: 'capitalize',
            }}>
              {user?.role}
            </span>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: user?.color || colors.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}>
              {user?.name?.[0]?.toUpperCase() || '?'}
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: '1.5rem', minWidth: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
