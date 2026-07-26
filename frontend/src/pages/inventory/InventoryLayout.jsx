import { NavLink, Outlet, useLocation } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';

const TABS = [
  { to: '/inventory', label: 'Dashboard', end: true },
  { to: '/inventory/products', label: 'Products' },
  { to: '/inventory/categories', label: 'Categories' },
  { to: '/inventory/suppliers', label: 'Suppliers' },
  { to: '/inventory/purchase-orders', label: 'Purchase Orders' },
  { to: '/inventory/goods-received', label: 'Goods Received' },
  { to: '/inventory/consumption', label: 'Stock Consumption' },
  { to: '/inventory/day-end', label: 'Day End' },
  { to: '/inventory/adjustments', label: 'Adjustments' },
  { to: '/inventory/stock-count', label: 'Stock Count' },
  { to: '/inventory/low-stock', label: 'Low Stock' },
  { to: '/inventory/history', label: 'History' },
  { to: '/inventory/reports', label: 'Reports' },
  { to: '/inventory/settings', label: 'Settings' },
];

export default function InventoryLayout() {
  const loc = useLocation();
  const active = TABS.find((t) => (t.end ? loc.pathname === t.to : loc.pathname.startsWith(t.to))) || TABS[0];

  return (
    <PageWrapper title="Salon Inventory" subtitle={active.label}>
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18,
        padding: 8, background: 'var(--card-bg, #fff)', borderRadius: 12,
        border: '1px solid var(--border, #EAECF0)',
      }}>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={!!t.end}
            style={({ isActive }) => ({
              padding: '7px 12px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: isActive ? 650 : 500,
              textDecoration: 'none',
              color: isActive ? '#fff' : '#475467',
              background: isActive ? 'linear-gradient(135deg,#6366F1,#8B5CF6)' : 'transparent',
              border: isActive ? 'none' : '1px solid transparent',
            })}
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </PageWrapper>
  );
}
