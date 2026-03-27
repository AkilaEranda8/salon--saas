import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth }       from '../../context/AuthContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import salonLogo from '/salon-logo.png';

/*  SVG icon helper  */
const Ico = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

/*  Nav definition  */
const ALL = ['superadmin','admin','manager','staff'];
const MGR = ['superadmin','admin','manager'];
const ADM = ['superadmin','admin'];
const SA  = ['superadmin'];

const NAV_GROUPS = [
  { label:'MAIN', items:[
    { path:'/dashboard',     label:'Dashboard',     roles:ALL, icon:'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
    { path:'/calendar',      label:'Calendar',      roles:ALL, icon:'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { path:'/walk-in',       label:'Walk-in',       roles:ALL, icon:'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1' },
  ]},
  { label:'OPERATIONS', items:[
    { path:'/appointments',  label:'Appointments',  roles:ALL, icon:'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
    { path:'/payments',      label:'Payments',      roles:ALL, icon:'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
    { path:'/customers',     label:'Customers',     roles:ALL, icon:'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { path:'/packages',      label:'Packages',      roles:MGR, icon:'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { path:'/recurring',     label:'Recurring',     roles:MGR, icon:'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
  ]},
  { label:'CATALOGUE', items:[
    { path:'/services',      label:'Services',      roles:ALL, icon:'M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z' },
    { path:'/categories',    label:'Categories',    roles:ADM, icon:'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
    { path:'/inventory',     label:'Inventory',     roles:MGR, icon:'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
  ]},
  { label:'TEAM', items:[
    { path:'/staff',         label:'Staff',         roles:ALL, icon:'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { path:'/commission',    label:'Commission',    roles:ALL, icon:'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { path:'/attendance',    label:'Attendance',    roles:MGR, icon:'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  ]},
  { label:'INSIGHTS', items:[
    { path:'/ai-chat',       label:'AI Chat',       roles:ALL, icon:'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
    { path:'/reports',       label:'Reports',       roles:MGR, icon:'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { path:'/reviews',       label:'Reviews',       roles:MGR, icon:'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
    { path:'/expenses',      label:'Expenses',      roles:MGR, icon:'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
    { path:'/reminders',     label:'Reminders',     roles:ALL, icon:'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
    { path:'/notifications', label:'Notifications', roles:ADM, icon:'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
    { path:'/offer-sms',     label:'Offer SMS',     roles:MGR, icon:'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10zm-4-6H7m10 4H7' },
  ]},
  { label:'SETTINGS', items:[
    { path:'/branches',      label:'Branches',      roles:ADM, icon:'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { path:'/users',         label:'Users',         roles:SA,  icon:'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  ]},
];

/*  Theme palette  */
const THEME = {
  light: {
    bg:          '#FFFFFF',
    border:      '#E5E7EB',
    userBg:      '#F9FAFB',
    navHover:    '#F5F3FF',
    navActive:   '#6366F1',
    navActiveTx: '#FFFFFF',
    text:        '#1E293B',
    textSub:     '#64748B',
    textMuted:   '#9CA3AF',
    groupLabel:  '#C4C4CF',
    divider:     '#F1F5F9',
    logoBg:      '#EEF2FF',
    logoColor:   '#6366F1',
    trackOff:    '#E5E7EB',
    shadow:      '0 0 0 0 transparent',
  },
  dark: {
    bg:          '#16122A',
    border:      '#2A2540',
    userBg:      '#201C35',
    navHover:    '#201C35',
    navActive:   '#6366F1',
    navActiveTx: '#FFFFFF',
    text:        '#E2E8F0',
    textSub:     '#94A3B8',
    textMuted:   '#475569',
    groupLabel:  '#3F3A5A',
    divider:     '#201C35',
    logoBg:      'rgba(99,102,241,0.18)',
    logoColor:   '#818CF8',
    trackOff:    '#2A2540',
    shadow:      '2px 0 24px rgba(0,0,0,0.35)',
  },
};

const ROLE_COLOR = { superadmin:'#6366F1', admin:'#0EA5E9', manager:'#10B981', staff:'#F59E0B' };
const ROLE_LABEL = { superadmin:'Super Admin', admin:'Admin', manager:'Manager', staff:'Staff' };

/*  NavItem  */
function NavItem({ item, collapsed, isActive, onClick, C }) {
  const [hov, setHov] = useState(false);
  return (
    <div style={{ position:'relative', marginBottom:2 }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div
        onClick={() => onClick(item.path)}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap:            12,
          padding:        collapsed ? '10px 14px' : '9px 14px',
          borderRadius:   10,
          cursor:         'pointer',
          background:     isActive ? C.navActive : hov ? C.navHover : 'transparent',
          transition:     'background 0.16s',
          userSelect:     'none',
        }}
      >
        <span style={{
          display:'flex', alignItems:'center', justifyContent:'center',
          width: 20, height: 20, flexShrink: 0,
          color: isActive ? C.navActiveTx : hov ? C.text : C.textSub,
          transition: 'color 0.16s',
        }}>
          <Ico d={item.icon} size={18} />
        </span>
        {!collapsed && (
          <span style={{
            fontSize:   13.5,
            fontWeight: isActive ? 600 : 500,
            fontFamily: "'Inter',sans-serif",
            whiteSpace: 'nowrap',
            color:      isActive ? C.navActiveTx : hov ? C.text : C.textSub,
            transition: 'color 0.16s',
          }}>
            {item.label}
          </span>
        )}
      </div>

      {collapsed && hov && (
        <div style={{
          position:      'absolute',
          left:          'calc(100% + 10px)',
          top:           '50%',
          transform:     'translateY(-50%)',
          background:    '#1E1B2E',
          color:         '#fff',
          fontSize:      12,
          fontWeight:    500,
          padding:       '6px 12px',
          borderRadius:  8,
          whiteSpace:    'nowrap',
          pointerEvents: 'none',
          zIndex:        999,
          boxShadow:     '0 4px 18px rgba(0,0,0,0.32)',
          fontFamily:    "'Inter',sans-serif",
        }}>
          {item.label}
        </div>
      )}
    </div>
  );
}

/*  Dark mode toggle  */
function DarkToggle({ dark, onToggle, collapsed, C }) {
  const sunPath = 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z';
  const moonPath = 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z';
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap:            12,
        padding:        collapsed ? '10px 14px' : '9px 14px',
        borderRadius:   10,
        cursor:         'pointer',
        background:     hov ? C.navHover : 'transparent',
        transition:     'background 0.16s',
        userSelect:     'none',
        marginBottom:   2,
      }}
    >
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ display:'flex', color: C.textSub, width:20, height:20, alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Ico d={dark ? sunPath : moonPath} size={18} />
        </span>
        {!collapsed && (
          <span style={{ fontSize:13.5, fontWeight:500, color:C.textSub, fontFamily:"'Inter',sans-serif", whiteSpace:'nowrap' }}>
            {dark ? 'Light Mode' : 'Dark Mode'}
          </span>
        )}
      </div>
      {!collapsed && (
        <div style={{ width:38, height:21, borderRadius:11, background: dark ? '#6366F1' : C.trackOff, position:'relative', transition:'background 0.24s', flexShrink:0 }}>
          <div style={{ position:'absolute', top:2.5, left: dark ? 19 : 2.5, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left 0.22s ease', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }} />
        </div>
      )}
    </div>
  );
}

/*  Sidebar  */
export default function Sidebar({ collapsed, onToggle, currentUser, mobileOpen, onMobileClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { isMobile } = useBreakpoint();

  const [dark, setDark] = useState(() => localStorage.getItem('sb-dark') === '1');

  useEffect(() => { localStorage.setItem('sb-dark', dark ? '1' : '0'); }, [dark]);

  const C   = THEME[dark ? 'dark' : 'light'];
  const role     = currentUser?.role || '';
  const initials = currentUser?.name
    ? currentUser.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const visibleGroups = NAV_GROUPS.map(g => ({
    ...g, items: g.items.filter(i => i.roles.includes(role)),
  })).filter(g => g.items.length > 0);

  const isActive = path =>
    location.pathname === path ||
    (path === '/walk-in' && location.pathname === '/walkin');

  const handleNavigate = path => { navigate(path); onMobileClose?.(); };
  const handleLogout   = async () => { await logout(); navigate('/login'); };

  const ec = isMobile ? false : collapsed;
  const W  = ec ? 72 : 258;
  const [signOutHov, setSignOutHov] = useState(false);

  if (isMobile && !mobileOpen) return null;

  const panel = (
    <aside style={{
      width:         W,
      flexShrink:    0,
      background:    C.bg,
      borderRight:   `1px solid ${C.border}`,
      boxShadow:     C.shadow,
      display:       'flex',
      flexDirection: 'column',
      height:        '100vh',
      overflow:      'hidden',
      transition:    'width 0.24s cubic-bezier(.4,0,.2,1), background 0.22s',
      fontFamily:    "'Inter',sans-serif",
      position:      isMobile ? 'fixed' : 'relative',
      top: 0, left: 0,
      zIndex: isMobile ? 400 : undefined,
    }}>

      {/*  Logo bar  */}
      <div style={{
        height:         66,
        display:        'flex',
        alignItems:     'center',
        justifyContent: ec ? 'center' : 'space-between',
        padding:        ec ? '0 16px' : '0 20px',
        borderBottom:   `1px solid ${C.border}`,
        flexShrink:     0,
        gap:            8,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, overflow:'hidden' }}>
          <img
            src={salonLogo}
            alt="Zane Salon logo"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              objectFit: 'cover',
              flexShrink: 0,
              background: '#000',
            }}
          />
          {!ec && (
            <div style={{ overflow:'hidden' }}>
              <div style={{ fontSize:15, fontWeight:800, color:C.text, fontFamily:"'Outfit','Inter',sans-serif", letterSpacing:'-0.02em', lineHeight:1.2, whiteSpace:'nowrap' }}>
                Zane Salon
              </div>
              <div style={{ fontSize:9.5, color:C.textMuted, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase' }}>
                Management
              </div>
            </div>
          )}
        </div>

        {/* Collapse/close button */}
        {!ec ? (
          <button onClick={isMobile ? onMobileClose : onToggle} style={{
            background:'none', border:`1px solid ${C.border}`, cursor:'pointer',
            padding:'5px', borderRadius:8, color:C.textMuted, display:'flex',
            alignItems:'center', flexShrink:0, transition:'all 0.15s',
          }}
          onMouseEnter={e=>{ e.currentTarget.style.borderColor='#6366F1'; e.currentTarget.style.color='#6366F1'; }}
          onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.textMuted; }}>
            <Ico d={isMobile ? 'M6 18L18 6M6 6l12 12' : 'M11 19l-7-7 7-7m8 14l-7-7 7-7'} size={15} />
          </button>
        ) : (
          <button onClick={onToggle} style={{ background:'none', border:'none', cursor:'pointer', color:C.textMuted, display:'flex', alignItems:'center', padding:0 }}>
            <Ico d="M13 5l7 7-7 7M5 5l7 7-7 7" size={15} />
          </button>
        )}
      </div>

      {/*  User card  */}
      <div style={{ padding: ec ? '12px 10px' : '12px 14px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        <div style={{
          background:     C.userBg,
          borderRadius:   14,
          padding:        ec ? '12px 0' : '11px 14px',
          display:        'flex',
          alignItems:     'center',
          justifyContent: ec ? 'center' : 'flex-start',
          gap:            12,
        }}>
          {/* Avatar */}
          <div style={{
            width:36, height:36, borderRadius:'50%',
            background:'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
            display:'flex', alignItems:'center', justifyContent:'center',
            color:'#fff', fontWeight:700, fontSize:13.5, flexShrink:0,
            boxShadow:'0 2px 10px rgba(99,102,241,0.4)',
            letterSpacing:'0.03em',
          }}>
            {initials}
          </div>
          {!ec && (
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13.5, fontWeight:700, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', lineHeight:1.3 }}>
                {currentUser?.name}
              </div>
              <div style={{ fontSize:11, fontWeight:600, marginTop:2, color: ROLE_COLOR[role] || '#6366F1' }}>
                {ROLE_LABEL[role] || role}
              </div>
            </div>
          )}
        </div>
      </div>

      {/*  Nav  */}
      <nav style={{ flex:1, overflowY:'auto', padding: ec ? '8px 8px' : '8px 10px' }}>
        <style>{`.sb-nav::-webkit-scrollbar{display:none}`}</style>
        {visibleGroups.map((group, gi) => (
          <div key={group.label} style={{ marginBottom:2 }}>
            {!ec && gi > 0 && <div style={{ height:1, background:C.divider, margin:'6px 4px 8px' }} />}
            {!ec && (
              <div style={{
                fontSize:9.5, fontWeight:700, color:C.groupLabel,
                textTransform:'uppercase', letterSpacing:'0.12em',
                padding:'2px 14px 6px', fontFamily:"'Inter',sans-serif",
              }}>
                {group.label}
              </div>
            )}
            {group.items.map(item => (
              <NavItem key={item.path} item={item} collapsed={ec}
                isActive={isActive(item.path)} onClick={handleNavigate} C={C} />
            ))}
          </div>
        ))}
      </nav>

      {/*  Bottom  */}
      <div style={{ borderTop:`1px solid ${C.border}`, padding: ec ? '10px 8px' : '10px 10px', flexShrink:0 }}>
        {/* Dark mode toggle */}
        <DarkToggle dark={dark} onToggle={() => setDark(d => !d)} collapsed={ec} C={C} />

        {/* Sign out */}
        <div
          onClick={handleLogout}
          onMouseEnter={() => setSignOutHov(true)}
          onMouseLeave={() => setSignOutHov(false)}
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: ec ? 'center' : 'flex-start',
            gap:            12,
            padding:        ec ? '10px 14px' : '9px 14px',
            borderRadius:   10,
            cursor:         'pointer',
            background:     signOutHov ? (dark ? 'rgba(239,68,68,0.12)' : '#FEF2F2') : 'transparent',
            transition:     'background 0.16s',
            userSelect:     'none',
          }}
        >
          <span style={{ display:'flex', flexShrink:0, color:'#EF4444', width:20, height:20, alignItems:'center', justifyContent:'center' }}>
            <Ico d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" size={18} />
          </span>
          {!ec && (
            <span style={{ fontSize:13.5, fontWeight:500, color:'#EF4444', fontFamily:"'Inter',sans-serif" }}>
              Sign out
            </span>
          )}
        </div>
      </div>
    </aside>
  );

  if (isMobile) {
    return (
      <>
        <div onClick={onMobileClose} style={{ position:'fixed', inset:0, zIndex:399, background:'rgba(16,24,40,0.5)', backdropFilter:'blur(3px)' }} />
        {panel}
      </>
    );
  }

  return panel;
}
