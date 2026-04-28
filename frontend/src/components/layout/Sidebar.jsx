import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { resolveBrandLogo, resolveBrandName } from '../../utils/branding';

const Ico = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ALL = ['superadmin','admin','manager','staff'];
const MGR = ['superadmin','admin','manager'];
const ADM = ['superadmin','admin'];
const SA  = ['superadmin'];

const ROUTE_ALIASES = { '/walk-in': '/walkin' };

const NAV_GROUPS = [
  { label:'MAIN', items:[
    { path:'/dashboard',     label:'Dashboard',     roles:ALL, icon:'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
    { path:'/calendar',      label:'Calendar',      roles:ALL, icon:'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { path:'/walk-in',       label:'Walk-in',       roles:ALL, icon:'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1' },
    { path:'/ai-chat',       label:'AI Chat',       roles:ALL, icon:'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
  ]},
  { label:'OPERATIONS', items:[
    { path:'/appointments',  label:'Appointments',  roles:ALL, icon:'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
    { path:'/waitlist',      label:'Waitlist',      roles:ALL, icon:'M8 7h8M8 11h8M8 15h5M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z' },
    { path:'/payments',      label:'Payments',      roles:ALL, icon:'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
    { path:'/customers',     label:'Customers',     roles:ALL, icon:'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { path:'/loyalty',       label:'Loyalty',       roles:ALL, icon:'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 1v8m0 0v1m0-1a5.978 5.978 0 01-3.75-1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { path:'/membership-plans', label:'Membership', roles:MGR, icon:'M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m8-4a4 4 0 11-8 0 4 4 0 018 0zM7 10h.01' },
    { path:'/packages',      label:'Packages',      roles:MGR, icon:'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { path:'/discounts',     label:'Discounts',     roles:MGR, icon:'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { path:'/recurring',     label:'Recurring',     roles:MGR, icon:'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
  ]},
  { label:'CATALOGUE', items:[
    { path:'/services',      label:'Services',      roles:ALL, icon:'M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z' },
    { path:'/categories',    label:'Categories',    roles:ADM, icon:'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
    { path:'/inventory',     label:'Inventory',     roles:MGR, icon:'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
    { path:'/inventory-reorder', label:'Reorders', roles:MGR, icon:'M20 12H4m0 0l4-4m-4 4l4 4m12-4l-4-4m4 4l-4 4' },
  ]},
  { label:'TEAM', items:[
    { path:'/staff',         label:'Staff',         roles:ALL, icon:'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { path:'/commission',    label:'Commission',    roles:ALL, icon:'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },

    { path:'/attendance',    label:'Attendance',    roles:MGR, icon:'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  ]},
  { label:'ANALYTICS', items:[
    { path:'/reports',       label:'Reports',       roles:MGR, icon:'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { path:'/kpi-dashboard', label:'KPI Dashboard', roles:MGR, icon:'M5 3v18M19 21V8M12 21v-6M7 14h2m8-2h2m-8 6h2' },
    { path:'/expenses',      label:'Expenses',      roles:MGR, icon:'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
    { path:'/reviews',       label:'Reviews',       roles:MGR, icon:'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  ]},
  { label:'ENGAGE', items:[
    { path:'/marketing',     label:'Marketing',     roles:MGR, icon:'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
    { path:'/offer-sms',     label:'Offer SMS',     roles:MGR, icon:'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10zm-4-6H7m10 4H7' },
    { path:'/reminders',     label:'Reminders',     roles:ALL, icon:'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
    { path:'/notifications', label:'Notifications', roles:ADM, icon:'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  ]},
  { label:'CONFIG', items:[
    { path:'/branding',          label:'Branding',         roles:ADM, icon:'M20 7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V7zM8 7v10m8-10v10M6 10h12' },
    { path:'/payment-settings',  label:'Payment Settings', roles:ADM, icon:'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
    { path:'/domain-settings',   label:'Custom Domain',    roles:ADM, icon:'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
    { path:'/branches',          label:'Branches',         roles:ADM, icon:'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { path:'/billing',           label:'Billing',          roles:ADM, icon:'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
    { path:'/users',             label:'Users',            roles:SA,  icon:'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  ]},
  { label:'ACCOUNT', items:[
    { path:'/themes',        label:'Themes',         roles:ALL, icon:'M12 3v2m0 14v2m9-9h-2M5 12H3m14.364 6.364-1.414-1.414M8.05 8.05 6.636 6.636m10.728 0L15.95 8.05M8.05 15.95l-1.414 1.414M12 16a4 4 0 100-8 4 4 0 000 8z' },
    { path:'/consent-forms', label:'Consent Forms',  roles:ALL, icon:'M9 12h6m-6 4h6M8 4h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z' },
    { path:'/support',       label:'Support',        roles:ALL, icon:'M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4-.933L2 17l1.058-3.173A6.797 6.797 0 012 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM8 10h.01M12 10h.01M16 10h.01' },
    { path:'/security',      label:'Security (2FA)', roles:ALL, icon:'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  ]},
];

const ROLE_META = {
  superadmin: { label: 'Super Admin', color: '#818CF8', bg: 'rgba(99,102,241,0.14)' },
  admin:      { label: 'Admin',       color: '#60A5FA', bg: 'rgba(59,130,246,0.14)' },
  manager:    { label: 'Manager',     color: '#34D399', bg: 'rgba(16,185,129,0.14)' },
  staff:      { label: 'Staff',       color: '#FBBF24', bg: 'rgba(245,158,11,0.14)' },
};

function getColors(isDark, sidebarAppearance, sidebarStyle, primaryColor) {
  const dark = isDark || sidebarAppearance === 'dark' || ['gradient', 'hexa'].includes(sidebarStyle);
  if (sidebarStyle === 'hexa') return {
    sidebarBg:   'linear-gradient(175deg, #110E1D 0%, #0A0714 100%)',
    border:      '#2A1F40',
    text:        '#F5EDD8',
    textSub:     '#B8A882',
    textMuted:   '#6B5F82',
    accent:      '#c9a96e',
    accentBg:    'linear-gradient(135deg, #c9a96e, #a07840)',
    accentTx:    '#0D0916',
    hover:       'rgba(201,169,110,0.09)',
    divider:     '#1A1430',
    scrollThumb: '#2D2050',
    userBg:      'rgba(255,255,255,0.04)',
    headerBg:    'rgba(0,0,0,0.18)',
  };
  const pc = primaryColor || '#6366F1';
  if (dark) return {
    sidebarBg:   sidebarStyle === 'gradient' ? 'linear-gradient(175deg, #1E293B 0%, #0F172A 100%)' : '#13111F',
    border:      '#1F1C30',
    text:        '#F1F5F9',
    textSub:     '#94A3B8',
    textMuted:   '#7B90A8',
    accent:      pc,
    accentBg:    `linear-gradient(135deg, ${pc}, ${pc}CC)`,
    accentTx:    '#FFFFFF',
    hover:       `${pc}14`,
    divider:     '#1A1730',
    scrollThumb: '#2A2640',
    userBg:      'rgba(255,255,255,0.05)',
    headerBg:    'rgba(0,0,0,0.14)',
  };
  return {
    sidebarBg:   sidebarStyle === 'glass' ? 'rgba(255,255,255,0.76)' : '#FAFBFC',
    border:      '#EAECF0',
    text:        '#101828',
    textSub:     '#475467',
    textMuted:   '#98A2B3',
    accent:      pc,
    accentBg:    `linear-gradient(135deg, ${pc}, ${pc}CC)`,
    accentTx:    '#FFFFFF',
    hover:       `${pc}0F`,
    divider:     '#F2F4F7',
    scrollThumb: '#D0D5DD',
    userBg:      '#F4F5F7',
    headerBg:    'rgba(0,0,0,0.02)',
  };
}

function NavItem({ item, collapsed, isActive, onClick, C }) {
  const [hov, setHov] = useState(false);
  const [tip, setTip] = useState(null);
  const ref = useRef(null);

  return (
    <div ref={ref} style={{ position: 'relative' }}
      onMouseEnter={() => {
        setHov(true);
        if (collapsed && ref.current) {
          const r = ref.current.getBoundingClientRect();
          setTip({ x: r.right + 10, y: Math.min(Math.max(r.top + r.height / 2, 24), window.innerHeight - 24) });
        }
      }}
      onMouseLeave={() => { setHov(false); setTip(null); }}
    >
      <div onClick={() => onClick(item.path)} style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap:            10,
        padding:        collapsed ? '10px 0' : '8px 12px',
        borderRadius:   10,
        cursor:         'pointer',
        marginBottom:   2,
        background:     isActive ? C.accentBg : hov ? C.hover : 'transparent',
        boxShadow:      isActive ? `0 2px 10px ${C.accent}28` : 'none',
        transition:     'all 0.15s ease',
        userSelect:     'none',
      }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 20, height: 20, flexShrink: 0,
          color: isActive ? C.accentTx : hov ? C.text : C.textSub,
          transition: 'color 0.15s',
        }}>
          <Ico d={item.icon} size={16} />
        </span>
        {!collapsed && (
          <span style={{
            fontSize:      13,
            fontWeight:    isActive ? 600 : 450,
            letterSpacing: '-0.01em',
            whiteSpace:    'nowrap',
            color:         isActive ? C.accentTx : hov ? C.text : C.textSub,
            transition:    'color 0.15s',
          }}>
            {item.label}
          </span>
        )}
      </div>
      {collapsed && hov && tip && (
        <div style={{
          position:      'fixed',
          left:          tip.x,
          top:           tip.y,
          transform:     'translateY(-50%)',
          background:    '#1E1B32',
          color:         '#fff',
          fontSize:      12,
          fontWeight:    600,
          padding:       '5px 12px',
          borderRadius:  8,
          whiteSpace:    'nowrap',
          pointerEvents: 'none',
          zIndex:        9999,
          boxShadow:     '0 4px 20px rgba(0,0,0,0.30)',
          border:        '1px solid rgba(255,255,255,0.08)',
        }}>
          {item.label}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ collapsed, onToggle, currentUser, mobileOpen, onMobileClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { isDark, sidebarStyle, sidebarAppearance, primaryColor } = useTheme();
  const { isMobile } = useBreakpoint();
  const [signOutHov, setSignOutHov] = useState(false);

  const STYLE = sidebarStyle || 'default';
  const C = getColors(isDark, sidebarAppearance, STYLE, primaryColor);
  const role = currentUser?.role || 'staff';
  const rm = ROLE_META[role] || ROLE_META.staff;
  const tenantBranding = currentUser?.tenant || {};
  const brandName = resolveBrandName(tenantBranding);
  const brandLogo = resolveBrandLogo(tenantBranding, 'sidebar');
  const initials = currentUser?.name
    ? currentUser.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const isFloating = !isMobile && ['compact', 'floating', 'glass'].includes(STYLE);
  const isGlass    = STYLE === 'glass';
  const isDarkSb   = isDark || sidebarAppearance === 'dark' || ['gradient', 'hexa'].includes(STYLE);

  const visibleGroups = NAV_GROUPS.map(g => ({
    ...g, items: g.items.filter(i => i.roles.includes(role)),
  })).filter(g => g.items.length > 0);

  const isActive     = p => location.pathname === p || location.pathname === (ROUTE_ALIASES[p] ?? null);
  const handleNavigate = p => { navigate(p); onMobileClose?.(); };
  const handleLogout   = async () => { try { await logout(); } catch (_) {} navigate('/login'); };

  const ec = isMobile ? false : collapsed;
  const W  = ec ? 68 : (STYLE === 'wide' ? 300 : 256);

  if (isMobile && !mobileOpen) return null;

  const panel = (
    <aside style={{
      width:                W,
      flexShrink:           0,
      background:           C.sidebarBg,
      backdropFilter:       isGlass ? 'blur(24px) saturate(180%)' : undefined,
      WebkitBackdropFilter: isGlass ? 'blur(24px) saturate(180%)' : undefined,
      borderRight:          isFloating ? 'none' : `1px solid ${C.border}`,
      boxShadow:            isFloating
                              ? (isDark ? '0 8px 32px rgba(0,0,0,0.38)' : '0 8px 32px rgba(16,24,40,0.10)')
                              : STYLE === 'hexa' ? '2px 0 24px rgba(0,0,0,0.45)' : 'none',
      display:              'flex',
      flexDirection:        'column',
      overflow:             'hidden',
      transition:           'width 0.22s cubic-bezier(.4,0,.2,1)',
      fontFamily:           "'Inter', sans-serif",
      color:                isDarkSb ? '#F1F5F9' : '#101828',
      position:             isMobile ? 'fixed' : 'relative',
      top: 0, left: 0,
      zIndex:               isMobile ? 400 : undefined,
      borderRadius:         isMobile ? 0 : (isFloating ? 16 : 0),
      margin:               isMobile ? 0 : (isFloating ? '10px 0 10px 10px' : 0),
      height:               isMobile ? '100vh' : (isFloating ? 'calc(100vh - 20px)' : '100vh'),
    }}>

      {/* ── Header ── */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: ec ? 'center' : 'space-between',
        padding:        ec ? '0 12px' : '0 10px 0 14px',
        borderBottom:   `1px solid ${C.border}`,
        background:     C.headerBg,
        flexShrink:     0,
        gap:            8,
        minHeight:      64,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden', flex: 1 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <img
              src={brandLogo}
              alt={`${brandName} logo`}
              style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover', border: `1.5px solid ${C.border}` }}
            />
            <div style={{
              position: 'absolute', bottom: -1, right: -1,
              width: 9, height: 9, borderRadius: '50%',
              background: '#10B981', border: `2px solid ${C.sidebarBg.startsWith('linear') ? '#110E1D' : C.sidebarBg}`,
            }} />
          </div>
          {!ec && (
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div title={brandName} style={{
                fontSize: 13, fontWeight: 800, color: isDarkSb ? '#FFFFFF' : '#101828',
                fontFamily: "'Sora','Manrope','Inter',sans-serif",
                letterSpacing: '-0.025em', lineHeight: 1.25, whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {brandName}
              </div>
              <div style={{ fontSize: 9, color: isDarkSb ? '#8BA4BE' : C.textMuted, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                Management
              </div>
            </div>
          )}
        </div>

        {!isMobile ? (
          <button onClick={onToggle} style={{
            background: 'none', border: `1px solid ${C.border}`, cursor: 'pointer',
            padding: 5, borderRadius: 8, color: C.textMuted,
            display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMuted; }}>
            <Ico d={ec ? 'M13 5l7 7-7 7M5 5l7 7-7 7' : 'M11 19l-7-7 7-7m8 14l-7-7 7-7'} size={13} />
          </button>
        ) : (
          <button onClick={onMobileClose} style={{
            background: 'none', border: `1px solid ${C.border}`, cursor: 'pointer',
            padding: 5, borderRadius: 8, color: C.textMuted,
            display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#EF4444'; e.currentTarget.style.color = '#EF4444'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMuted; }}>
            <Ico d="M6 18L18 6M6 6l12 12" size={13} />
          </button>
        )}
      </div>

      {/* ── User card ── */}
      {!ec && (
        <div style={{
          margin:       '10px 10px 2px',
          padding:      '10px 12px',
          borderRadius: 12,
          background:   C.userBg,
          border:       `1px solid ${C.border}`,
          display:      'flex',
          alignItems:   'center',
          gap:          10,
          flexShrink:   0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: C.accentBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: C.accentTx, letterSpacing: '0.02em',
          }}>
            {initials}
          </div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: C.text,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {currentUser?.name || 'User'}
            </div>
            <span style={{
              display:    'inline-block',
              fontSize:   10,
              fontWeight: 700,
              padding:    '1px 7px',
              borderRadius: 20,
              background: rm.bg,
              color:      rm.color,
              letterSpacing: '0.04em',
            }}>
              {rm.label}
            </span>
          </div>
        </div>
      )}

      {/* ── Nav ── */}
      <nav className="sb-nav-rd" style={{ flex: 1, overflowY: 'auto', padding: ec ? '8px 6px' : '8px 10px' }}>
        <style>{`
          .sb-nav-rd::-webkit-scrollbar { width: 3px; }
          .sb-nav-rd::-webkit-scrollbar-track { background: transparent; }
          .sb-nav-rd::-webkit-scrollbar-thumb { background: ${C.scrollThumb}; border-radius: 99px; }
        `}</style>
        {visibleGroups.map((group, gi) => (
          <div key={group.label} style={{ marginBottom: 4 }}>
            {!ec && gi > 0 && (
              <div style={{ height: 1, background: C.divider, margin: '6px 4px 8px' }} />
            )}
            {!ec && (
              <div style={{
                fontSize:      9,
                fontWeight:    800,
                color:         C.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                padding:       '2px 12px 4px',
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
                onClick={handleNavigate}
                C={C}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* ── Footer ── */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: ec ? '8px 6px' : '8px 10px', flexShrink: 0 }}>
        <div
          onClick={handleLogout}
          onMouseEnter={() => setSignOutHov(true)}
          onMouseLeave={() => setSignOutHov(false)}
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: ec ? 'center' : 'flex-start',
            gap:            10,
            padding:        ec ? '10px 0' : '9px 12px',
            borderRadius:   10,
            cursor:         'pointer',
            background:     signOutHov ? 'rgba(239,68,68,0.08)' : 'transparent',
            border:         `1px solid ${signOutHov ? 'rgba(239,68,68,0.22)' : 'transparent'}`,
            transition:     'all 0.15s',
            userSelect:     'none',
          }}
        >
          <span style={{ display: 'flex', flexShrink: 0, color: '#EF4444', width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
            <Ico d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" size={16} />
          </span>
          {!ec && (
            <span style={{ fontSize: 13, fontWeight: 600, color: '#EF4444' }}>Sign out</span>
          )}
        </div>
      </div>
    </aside>
  );

  if (isMobile) {
    return (
      <>
        <div
          onClick={onMobileClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 399,
            background: 'rgba(16,24,40,0.60)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          }}
        />
        {panel}
      </>
    );
  }

  return panel;
}
