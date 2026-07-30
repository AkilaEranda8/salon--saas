import { NavLink, Outlet, useLocation } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';

const TABS = [
  { to: '/inventory', label: 'Products', end: true },
  { to: '/inventory/goods-received', label: 'Goods Received' },
  { to: '/inventory/consumption', label: 'Usage' },
  { to: '/inventory/day-end', label: 'Day End' },
  { to: '/inventory/adjustments', label: 'Adjustments' },
  { to: '/inventory/history', label: 'History' },
];

function tabActive(pathname, tab) {
  if (tab.end) return pathname === tab.to;
  return pathname === tab.to || pathname.startsWith(`${tab.to}/`);
}

export default function InventoryLayout() {
  const { pathname } = useLocation();
  const active = TABS.find((t) => tabActive(pathname, t)) || TABS[0];

  return (
    <PageWrapper title="Inventory" subtitle={active.label}>
      <div style={{
        display: 'flex',
        borderBottom: '2px solid var(--app-border, #E4E7EC)',
        overflowX: 'auto',
        marginBottom: 20,
      }}>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={!!t.end}
            style={({ isActive }) => {
              const on = isActive || tabActive(pathname, t);
              return {
                padding: '10px 18px',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "'Inter',sans-serif",
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
                color: on ? 'var(--app-accent, #2563EB)' : 'var(--app-text-muted, #64748B)',
                borderBottom: on ? '2px solid var(--app-accent, #2563EB)' : '2px solid transparent',
                marginBottom: -2,
              };
            }}
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </PageWrapper>
  );
}
