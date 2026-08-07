import { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';
import { ACCT } from './AccountingUI';

const TABS = [
  { to: '/accounting', label: 'Overview', end: true, color: ACCT.primary },
  { to: '/accounting/journals', label: 'GL Journals', color: ACCT.purple },
  { to: '/accounting/reports', label: 'GL Reports', color: ACCT.cyan },
  { to: '/accounting/ar-ap', label: 'AR / AP', color: ACCT.warning },
  { to: '/accounting/cash-bank', label: 'Cash & Bank', color: ACCT.success },
  { to: '/accounting/tax', label: 'VAT / Tax', color: ACCT.danger },
  { to: '/accounting/petty-cash', label: 'Petty Cash', color: '#EA580C' },
  { to: '/accounting/payroll', label: 'Payroll', color: ACCT.purple },
  { to: '/accounting/periods', label: 'Periods', color: ACCT.slate },
  { to: '/accounting/audit', label: 'Audit Trail', color: '#0284C7' },
  { to: '/accounting/settings', label: 'Settings', color: ACCT.primary },
];

export function formatLkr(n) {
  return `Rs. ${Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AccountingLayout({ title, children, actions }) {
  const { C } = usePageTheme();
  const location = useLocation();
  const active = useMemo(
    () => TABS.find((t) => (t.end ? location.pathname === t.to : location.pathname.startsWith(t.to)))?.label,
    [location.pathname],
  );

  return (
    <PageWrapper title={title || active || 'Accounting'} subtitle="Double-entry books for your salon" actions={actions}>
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18,
        padding: 10,
        borderRadius: 14,
        background: C.isDark
          ? 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)'
          : 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 50%, #F5F3FF 100%)',
        border: `1px solid ${C.border}`,
        boxShadow: C.shadow,
      }}>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={!!t.end}
            style={({ isActive }) => ({
              padding: '7px 13px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: isActive ? 800 : 600,
              textDecoration: 'none',
              border: `1.5px solid ${isActive ? t.color : C.border}`,
              background: isActive
                ? `linear-gradient(135deg, ${t.color}18 0%, ${t.color}08 100%)`
                : (C.isDark ? '#0F172A' : 'rgba(255,255,255,0.85)'),
              color: isActive ? t.color : C.muted,
              boxShadow: isActive ? `0 2px 8px ${t.color}28` : 'none',
              transition: 'all 0.15s ease',
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
