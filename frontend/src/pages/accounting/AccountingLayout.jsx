import { useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';

const TITLES = [
  { to: '/accounting', label: 'Accounting Overview', end: true },
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

export default function AccountingLayout({ title, children, actions }) {
  const location = useLocation();
  const fallback = useMemo(
    () => TITLES.find((t) => (t.end ? location.pathname === t.to : location.pathname.startsWith(t.to)))?.label,
    [location.pathname],
  );

  return (
    <PageWrapper
      title={title || fallback || 'Accounting'}
      subtitle="Double-entry books for your salon"
      actions={actions}
    >
      {children || <Outlet />}
    </PageWrapper>
  );
}
