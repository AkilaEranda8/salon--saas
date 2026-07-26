import { useMemo } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';

const GROUPS = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { to: '/inventory', label: 'Dashboard', end: true },
      { to: '/inventory/low-stock', label: 'Low Stock' },
      { to: '/inventory/reports', label: 'Reports' },
      { to: '/inventory/settings', label: 'Settings' },
    ],
  },
  {
    id: 'catalogue',
    label: 'Catalogue',
    items: [
      { to: '/inventory/products', label: 'Products' },
      { to: '/inventory/categories', label: 'Categories' },
      { to: '/inventory/suppliers', label: 'Suppliers' },
    ],
  },
  {
    id: 'purchasing',
    label: 'Purchasing',
    items: [
      { to: '/inventory/purchase-orders', label: 'Purchase Orders' },
      { to: '/inventory/goods-received', label: 'Goods Received' },
    ],
  },
  {
    id: 'ops',
    label: 'Stock Ops',
    items: [
      { to: '/inventory/consumption', label: 'Consumption' },
      { to: '/inventory/day-end', label: 'Day End' },
      { to: '/inventory/adjustments', label: 'Adjustments' },
      { to: '/inventory/stock-count', label: 'Stock Count' },
      { to: '/inventory/history', label: 'History' },
    ],
  },
];

function tabActive(pathname, item) {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function groupForPath(pathname) {
  return GROUPS.find((g) => g.items.some((t) => tabActive(pathname, t))) || GROUPS[0];
}

const chipBase = {
  padding: '7px 14px',
  borderRadius: 20,
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "'Inter',sans-serif",
  cursor: 'pointer',
  border: '1.5px solid',
  background: 'transparent',
  transition: 'all 0.15s',
};

export default function InventoryLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeGroup = useMemo(() => groupForPath(pathname), [pathname]);
  const flat = GROUPS.flatMap((g) => g.items);
  const active = flat.find((t) => tabActive(pathname, t)) || flat[0];

  return (
    <PageWrapper title="Salon Inventory" subtitle={active.label}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {GROUPS.map((group) => {
            const on = group.id === activeGroup.id;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  if (!on) navigate(group.items[0].to);
                }}
                style={{
                  ...chipBase,
                  borderColor: on ? 'var(--app-accent, #2563EB)' : 'var(--app-border, #E4E7EC)',
                  background: on ? 'var(--app-accent-soft, #EFF6FF)' : 'var(--app-panel, #fff)',
                  color: on ? 'var(--app-accent, #2563EB)' : 'var(--app-text-muted, #64748B)',
                }}
              >
                {group.label}
              </button>
            );
          })}
        </div>

        <div style={{
          display: 'flex',
          borderBottom: '2px solid var(--app-border, #E4E7EC)',
          gap: 0,
          overflowX: 'auto',
        }}>
          {activeGroup.items.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={!!t.end}
              style={({ isActive }) => {
                const on = isActive || tabActive(pathname, t);
                return {
                  padding: '10px 18px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: "'Inter',sans-serif",
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s',
                  color: on ? 'var(--app-accent, #2563EB)' : 'var(--app-text-muted, #64748B)',
                  borderBottom: on
                    ? '2px solid var(--app-accent, #2563EB)'
                    : '2px solid transparent',
                  marginBottom: -2,
                };
              }}
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </div>
      <Outlet />
    </PageWrapper>
  );
}
