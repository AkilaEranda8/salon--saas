import { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';

const TABS = [
  { to: '/accounting', label: 'Overview', end: true },
  { to: '/accounting/journals', label: 'GL Journals' },
  { to: '/accounting/reports', label: 'GL Reports' },
  { to: '/accounting/ar-ap', label: 'AR / AP' },
  { to: '/accounting/cash-bank', label: 'Cash & Bank' },
  { to: '/accounting/tax', label: 'VAT / Tax' },
  { to: '/accounting/petty-cash', label: 'Petty Cash' },
  { to: '/accounting/payroll', label: 'Payroll' },
  { to: '/accounting/periods', label: 'Periods' },
  { to: '/accounting/audit', label: 'Audit Trail' },
  { to: '/accounting/settings', label: 'Settings' },
];

export function formatLkr(n) {
  return `Rs. ${Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AccountingLayout({ title, children }) {
  const { C } = usePageTheme();
  const location = useLocation();
  const active = useMemo(
    () => TABS.find((t) => (t.end ? location.pathname === t.to : location.pathname.startsWith(t.to)))?.label,
    [location.pathname],
  );

  return (
    <PageWrapper title={title || active || 'Accounting'} subtitle="Double-entry books for your salon">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={!!t.end}
            style={({ isActive }) => ({
              padding: '6px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: isActive ? 700 : 500,
              textDecoration: 'none',
              border: `1.5px solid ${isActive ? '#2563EB' : C.border}`,
              background: isActive ? (C.isDark ? '#1E3A8A' : '#EFF6FF') : (C.isDark ? '#0F172A' : '#fff'),
              color: isActive ? '#2563EB' : C.muted,
            })}
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      {children || <Outlet />}
    </PageWrapper>
  );
}
