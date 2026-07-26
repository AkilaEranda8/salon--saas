import { NavLink, Outlet, useLocation } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';

const GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/inventory', label: 'Dashboard', end: true },
      { to: '/inventory/low-stock', label: 'Low Stock' },
      { to: '/inventory/reports', label: 'Reports' },
      { to: '/inventory/settings', label: 'Settings' },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { to: '/inventory/products', label: 'Products' },
      { to: '/inventory/categories', label: 'Categories' },
      { to: '/inventory/suppliers', label: 'Suppliers' },
    ],
  },
  {
    label: 'Purchasing',
    items: [
      { to: '/inventory/purchase-orders', label: 'Purchase Orders' },
      { to: '/inventory/goods-received', label: 'Goods Received' },
    ],
  },
  {
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

export default function InventoryLayout() {
  const { pathname } = useLocation();
  const flat = GROUPS.flatMap((g) => g.items);
  const active = flat.find((t) => tabActive(pathname, t)) || flat[0];

  return (
    <PageWrapper title="Salon Inventory" subtitle={active.label}>
      <div style={{
        marginBottom: 18,
        padding: 12,
        background: 'var(--card-bg, #fff)',
        borderRadius: 12,
        border: '1px solid var(--border, #EAECF0)',
        display: 'grid',
        gap: 12,
      }}>
        {GROUPS.map((group) => (
          <div key={group.label}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#98A2B3',
              marginBottom: 6,
            }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {group.items.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={!!t.end}
                  style={({ isActive }) => {
                    const on = isActive || tabActive(pathname, t);
                    return {
                      padding: '7px 12px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: on ? 650 : 500,
                      textDecoration: 'none',
                      color: on ? '#fff' : '#475467',
                      background: on ? 'linear-gradient(135deg,#6366F1,#8B5CF6)' : '#F8FAFC',
                      border: on ? 'none' : '1px solid #EAECF0',
                    };
                  }}
                >
                  {t.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Outlet />
    </PageWrapper>
  );
}
