import { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';
import { useAuth } from '../../context/AuthContext';
import { ACCT, StatusPill } from './AccountingUI';

const TABS = [
  { to: '/accounting', label: 'Overview', end: true, color: ACCT.primary, roles: ['superadmin', 'admin', 'manager'] },
  { to: '/accounting/journals', label: 'GL Journals', color: ACCT.purple, roles: ['superadmin', 'admin', 'manager'] },
  { to: '/accounting/reports', label: 'GL Reports', color: ACCT.cyan, roles: ['superadmin', 'admin', 'manager'] },
  { to: '/accounting/ar-ap', label: 'AR / AP', color: ACCT.warning, roles: ['superadmin', 'admin', 'manager'] },
  { to: '/accounting/cash-bank', label: 'Cash & Bank', color: ACCT.success, roles: ['superadmin', 'admin', 'manager'] },
  { to: '/accounting/tax', label: 'VAT / Tax', color: ACCT.danger, roles: ['superadmin', 'admin', 'manager'] },
  { to: '/accounting/petty-cash', label: 'Petty Cash', color: '#EA580C', roles: ['superadmin', 'admin', 'manager'] },
  { to: '/accounting/payroll', label: 'Payroll', color: ACCT.purple, roles: ['superadmin', 'admin', 'manager'] },
  { to: '/accounting/periods', label: 'Periods', color: ACCT.slate, roles: ['superadmin', 'admin'] },
  { to: '/accounting/audit', label: 'Audit Trail', color: '#0284C7', roles: ['superadmin', 'admin'] },
  { to: '/accounting/settings', label: 'Settings', color: ACCT.primary, roles: ['superadmin', 'admin'] },
];

export function formatLkr(n) {
  return `Rs. ${Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AccountingLayout({ title, children, actions }) {
  const { C } = usePageTheme();
  const { user } = useAuth();
  const location = useLocation();
  const role = user?.role || '';
  const tabs = useMemo(
    () => TABS.filter((t) => t.roles.includes(role)),
    [role],
  );
  const activeTab = useMemo(
    () => tabs.find((t) => (t.end ? location.pathname === t.to : location.pathname.startsWith(t.to))),
    [location.pathname, tabs],
  );

  return (
    <PageWrapper
      title={title || activeTab?.label || 'Accounting'}
      subtitle="Double-entry books for your salon"
      actions={actions}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
        marginBottom: 10,
      }}>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>
          Module · <span style={{ color: activeTab?.color || ACCT.primary, fontWeight: 800 }}>{activeTab?.label || 'Accounting'}</span>
        </div>
        <StatusPill status="posted">Double-entry</StatusPill>
      </div>

      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18,
        padding: 8,
        borderRadius: 16,
        background: C.isDark
          ? 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)'
          : 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 45%, #F5F3FF 100%)',
        border: `1px solid ${C.border}`,
        boxShadow: C.shadow,
      }}>
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={!!t.end}
            style={({ isActive }) => ({
              padding: '8px 14px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: isActive ? 800 : 600,
              textDecoration: 'none',
              border: `1.5px solid ${isActive ? t.color : 'transparent'}`,
              background: isActive
                ? `linear-gradient(135deg, ${t.color} 0%, ${t.color}D0 100%)`
                : (C.isDark ? 'transparent' : 'rgba(255,255,255,0.55)'),
              color: isActive ? '#fff' : C.muted,
              boxShadow: isActive ? `0 6px 16px ${t.color}40` : 'none',
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
