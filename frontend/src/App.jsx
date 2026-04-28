import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import api from './api/axios';
import { LoadingSpinner } from './components/shared/Feedback';
import Sidebar from './components/layout/Sidebar';
import Topbar  from './components/layout/Topbar';
import PlatformSidebar from './components/layout/PlatformSidebar';
import SubscriptionBanner from './components/shared/SubscriptionBanner';
import UpgradePlanModal from './components/shared/UpgradePlanModal';
import { useBreakpoint } from './hooks/useBreakpoint';
import { isPlatformContext } from './utils/tenant';
import { useTheme } from './context/ThemeContext';

// Platform pages
import PlatformDashboardPage     from './pages/platform/PlatformDashboardPage';
import PlatformTenantsPage       from './pages/platform/PlatformTenantsPage';
import PlatformSubscriptionsPage from './pages/platform/PlatformSubscriptionsPage';
import PlatformAdminsPage        from './pages/platform/PlatformAdminsPage';
import PlatformSystemControlPage from './pages/platform/PlatformSystemControlPage';
import PlatformMonitoringPage   from './pages/platform/PlatformMonitoringPage';
import PlatformFeatureStudioPage from './pages/platform/PlatformFeatureStudioPage';
import PlatformInvoicesPage      from './pages/platform/PlatformInvoicesPage';
import PlatformBankSlipApprovalsPage from './pages/platform/PlatformBankSlipApprovalsPage';
import PlatformPlansPage       from './pages/platform/PlatformPlansPage';
import PlatformSmtpSmsPage    from './pages/platform/PlatformSmtpSmsPage';

// Pages
import LoginPage       from './pages/LoginPage';
import DashboardPage   from './pages/DashboardPage';
import CalendarPage    from './pages/CalendarPage';
import AppointmentsPage from './pages/AppointmentsPage';
import ServicesPage    from './pages/ServicesPage';
import StaffPage       from './pages/StaffPage';
import CustomersPage   from './pages/CustomersPage';
import CommissionPage  from './pages/CommissionPage';
import PaymentsPage    from './pages/PaymentsPage';
import InventoryPage   from './pages/InventoryPage';
import AttendancePage  from './pages/AttendancePage';
import RemindersPage   from './pages/RemindersPage';
import ReportsPage     from './pages/ReportsPage';
import BranchesPage    from './pages/BranchesPage';
import UsersPage       from './pages/UsersPage';
import BookingPage     from './pages/BookingPage';
import CustomerPortalPage from './pages/CustomerPortalPage';
import CustomerPortalLoginPage from './pages/CustomerPortalLoginPage';
import CustomerRegisterPage from './pages/CustomerRegisterPage';
import WalkInPage      from './pages/WalkInPage';
import TokenDisplayScreen from './pages/TokenDisplayScreen';
import NotificationsPage from './pages/NotificationsPage';
import OfferSmsPage from './pages/OfferSmsPage';
import WaitlistPage from './pages/WaitlistPage';
import LoyaltyPage from './pages/LoyaltyPage';
import MembershipPlansPage from './pages/MembershipPlansPage';
import ConsentFormsPage from './pages/ConsentFormsPage';
import KpiDashboardPage from './pages/KpiDashboardPage';
import MarketingAutomationPage from './pages/MarketingAutomationPage';
import InventoryReorderPage from './pages/InventoryReorderPage';
import ExpensesPage     from './pages/ExpensesPage';
import ReviewsPage      from './pages/ReviewsPage';
import ReviewFormPage   from './pages/ReviewFormPage';
import PackagesPage     from './pages/PackagesPage';
import DiscountsPage    from './pages/DiscountsPage';
import RecurringPage    from './pages/RecurringPage';
import CategoriesPage   from './pages/CategoriesPage';
import AiChatPage       from './pages/AiChatPage';
import BillingPage      from './pages/BillingPage';
import BillingPaymentPage from './pages/BillingPaymentPage';
import BillingInvoicesPage from './pages/BillingInvoicesPage';
import BankSlipUploadPage from './pages/BankSlipUploadPage';
import OnboardingPage   from './pages/OnboardingPage';
import SupportTicketsPage from './pages/SupportTicketsPage';
import MaintenancePage  from './pages/MaintenancePage';
import BrandingSettingsPage  from './pages/BrandingSettingsPage';
import PaymentSettingsPage   from './pages/PaymentSettingsPage';
import DomainSettingsPage  from './pages/DomainSettingsPage';
import ThemeOptionsPage from './pages/ThemeOptionsPage';
import TwoFactorPage from './pages/TwoFactorPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

// ── Branding seeder: apply tenant theme to ThemeContext on login ───────────
const VALID_SIDEBAR_LAYOUTS = new Set([
  'hexa','default','compact','floating','glass','gradient','accent','pill','wide','minimal',
]);

function BrandingSeeder() {
  const { user } = useAuth();
  const { setPrimaryColor, setFontFamily, setSidebarStyle, setMode } = useTheme();

  useEffect(() => {
    if (!user?.tenant) return;
    const t = user.tenant;
    if (t.primary_color) setPrimaryColor(t.primary_color);
    if (t.font_family)   setFontFamily(t.font_family);
    // Always enforce light mode + default sidebar
    setMode('light');
    window.localStorage.setItem('salon-theme-mode', 'light');
    setSidebarStyle('default');
    window.localStorage.setItem('salon-sidebar-style', 'default');
    window.localStorage.setItem('salon-sidebar-user-set', 'seeded');
  }, [user?.tenant]);

  return null;
}

// ── Impersonation handler ──────────────────────────────────────────────

function ImpersonateGate() {
  const [error, setError] = useState(null);
  const { refreshUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const slug  = params.get('tenant');

    if (!token) { navigate('/login', { replace: true }); return; }

    api.post('/auth/impersonate-session', { token })
      .then(async () => {
        // Persist tenant slug in sessionStorage so API calls work after SPA navigation
        if (slug) sessionStorage.setItem('impersonation_tenant_slug', slug);
        await refreshUser();
        navigate(slug ? `/dashboard?tenant=${slug}` : '/dashboard', { replace: true });
      })
      .catch(err => setError(err.response?.data?.message || 'Impersonation failed.'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 16, color: '#EF4444', fontWeight: 600 }}>{error}</div>
        <div style={{ fontSize: 13, color: '#6B7280' }}>You can close this tab.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 10 }}>
      <LoadingSpinner />
      <div style={{ fontSize: 13, color: '#6B7280' }}>Setting up impersonated session…</div>
    </div>
  );
}

// ── Auth guards ────────────────────────────────────────────────────────

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, maintenance, user } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flex: 1 }}>
        <LoadingSpinner />
      </div>
    );
  }
  if (maintenance.enabled && user?.role !== 'platform_admin' && !location.pathname.startsWith('/maintenance')) {
    return <Navigate to="/maintenance" replace />;
  }
  if (!isAuthenticated) {
    const target = location.pathname.startsWith('/platform') ? '/platform/login' : '/login';
    return <Navigate to={target} replace />;
  }
  return children;
}

function RoleRoute({ roles, children }) {
  const { user } = useAuth();
  // platform_admin has access to everything
  if (!user || (!roles.includes(user.role) && user.role !== 'platform_admin')) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function PlatformRoute({ children }) {
  const { user } = useAuth();
  if (!user || user.role !== 'platform_admin') return <Navigate to="/platform/login" replace />;
  return children;
}

// ── Platform Admin shell ───────────────────────────────────────────────

function PlatformShell() {
  const [collapsed, setCollapsed] = useState(false);
  const { isDark } = useTheme();

  return (
    <div className="platform-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <div className="platform-shell-orb platform-shell-orb-one" />
      <div className="platform-shell-orb platform-shell-orb-two" />
      <div className="platform-sidebar-surface">
        <PlatformSidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      </div>
      <div className="app-surface platform-scroll" style={{ flex: 1, overflowY: 'auto', background: isDark ? '#0F172A' : '#F8F7F4' }}>
        <Routes>
          <Route path="platform/dashboard"     element={<PlatformDashboardPage />} />
          <Route path="platform/tenants"        element={<PlatformTenantsPage />} />
          <Route path="platform/subscriptions"  element={<PlatformSubscriptionsPage />} />
          <Route path="platform/invoices"       element={<PlatformInvoicesPage />} />
          <Route path="platform/bank-slip-approvals" element={<PlatformBankSlipApprovalsPage />} />
          <Route path="platform/plans"               element={<PlatformPlansPage />} />
          <Route path="platform/admins"         element={<PlatformAdminsPage />} />
          <Route path="platform/monitoring"     element={<PlatformMonitoringPage />} />
          <Route path="platform/features"       element={<PlatformFeatureStudioPage />} />
          <Route path="platform/support"        element={<SupportTicketsPage platformMode />} />
          <Route path="platform/system"         element={<PlatformSystemControlPage />} />
          <Route path="platform/smtp-sms"       element={<PlatformSmtpSmsPage />} />
          <Route path="*"                        element={<Navigate to="/platform/dashboard" replace />} />
        </Routes>
      </div>
    </div>
  );
}

// ── Force Password Change Modal ────────────────────────────────────────

function ForcePasswordChangeModal() {
  const { user, refreshUser } = useAuth();
  const [newPwd,     setNewPwd]     = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd,    setShowPwd]    = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  if (!user?.must_change_password) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPwd.length < 8)     { setError('Password must be at least 8 characters.'); return; }
    if (newPwd !== confirmPwd) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await api.post('/auth/first-login-password', { newPassword: newPwd });
      await refreshUser();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update password.');
    }
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(6px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 420, boxShadow: '0 24px 80px rgba(0,0,0,.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 14px' }}>🔑</div>
          <h2 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: '#111827', fontFamily: "'Inter', sans-serif" }}>Set Your Password</h2>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#6B7280', fontFamily: "'Inter', sans-serif" }}>
            Your account was set up with a temporary password.<br />Please choose a new password to continue.
          </p>
        </div>
        {error && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '9px 13px', borderRadius: 9, marginBottom: 16, fontSize: 13, border: '1px solid #FEE2E2', fontFamily: "'Inter', sans-serif" }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Inter', sans-serif" }}>New Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showPwd ? 'text' : 'password'} value={newPwd} onChange={e => setNewPwd(e.target.value)} required
                placeholder="At least 8 characters" autoFocus autoComplete="new-password"
                style={{ width: '100%', padding: '11px 42px 11px 14px', borderRadius: 10, border: '1.5px solid #E5E7EB', fontSize: 14, fontFamily: showPwd ? 'monospace' : "'Inter', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = '#2563EB'}
                onBlur={e => e.target.style.borderColor = '#E5E7EB'} />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 16, lineHeight: 1 }}>
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div style={{ marginBottom: 22 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Inter', sans-serif" }}>Confirm Password</label>
            <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required
              placeholder="Re-enter new password" autoComplete="new-password"
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #E5E7EB', fontSize: 14, fontFamily: "'Inter', sans-serif", outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#2563EB'}
              onBlur={e => e.target.style.borderColor = '#E5E7EB'} />
          </div>
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: loading ? '#E5E7EB' : 'linear-gradient(135deg,#2563EB,#1d4ed8)', color: loading ? '#9CA3AF' : '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'Inter', sans-serif", transition: 'all .2s' }}>
            {loading ? 'Saving…' : 'Set Password & Continue →'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── App shell (authenticated layout) ──────────────────────────────────

function AppShell() {
  const { isNarrow, isMobile } = useBreakpoint();
  const [sbCollapsed, setSbCollapsed] = useState(false);
  const [sbMobileOpen, setSbMobileOpen] = useState(false);
  const { user } = useAuth();
  const { isDark } = useTheme();

  /* Persist collapsed state */
  useEffect(() => {
    try { localStorage.setItem('sb-collapsed', sbCollapsed); } catch {}
  }, [sbCollapsed]);

  /* Auto-collapse only when resizing to mobile/tablet — not on initial mount */
  const prevNarrow = useRef(null);
  useEffect(() => {
    if (prevNarrow.current === null) { prevNarrow.current = isNarrow; return; }
    if (prevNarrow.current !== isNarrow) {
      setSbCollapsed(isNarrow && !isMobile);
      prevNarrow.current = isNarrow;
    }
  }, [isNarrow, isMobile]);

  const handleMenuClick = () => {
    if (isMobile) setSbMobileOpen(o => !o);
    else setSbCollapsed(c => !c);
  };

  return (
    <div className="app-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <BrandingSeeder />
      <div className="app-shell-orb app-shell-orb-one" />
      <div className="app-shell-orb app-shell-orb-two" />
      <div className="shell-sidebar-surface">
        <Sidebar
          collapsed={sbCollapsed}
          onToggle={() => setSbCollapsed(c => !c)}
          currentUser={user}
          mobileOpen={sbMobileOpen}
          onMobileClose={() => setSbMobileOpen(false)}
        />
      </div>

      <div className="app-surface shell-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="shell-topbar-wrap">
          <Topbar onMenuClick={handleMenuClick} />
        </div>

        {/* Subscription warning banner — renders only when needed */}
        <SubscriptionBanner />
        <UpgradePlanModal />

        <ForcePasswordChangeModal />
        <div className="app-surface shell-scroll" style={{ flex: 1, overflowY: 'auto', background: isDark ? '#0F172A' : '#F7F8FA' }}>
          <Routes>
            {/* ── MAIN ────────────────────────────────────── */}
            <Route path="/dashboard"    element={<DashboardPage />} />
            <Route path="/calendar"     element={<CalendarPage />} />
            <Route path="/walk-in"      element={<WalkInPage />} />
            <Route path="/walkin"       element={<WalkInPage />} />

            {/* ── OPERATIONS ──────────────────────────────── */}
            <Route path="/appointments" element={<AppointmentsPage />} />
            <Route path="/waitlist"     element={<WaitlistPage />} />
            <Route path="/payments"     element={<PaymentsPage />} />
            <Route path="/customers"    element={<CustomersPage />} />
            <Route path="/loyalty"      element={<LoyaltyPage />} />
            <Route path="/membership-plans" element={
              <RoleRoute roles={['superadmin', 'admin', 'manager']}>
                <MembershipPlansPage />
              </RoleRoute>
            } />
            <Route path="/packages"     element={
              <RoleRoute roles={['superadmin', 'admin', 'manager']}>
                <PackagesPage />
              </RoleRoute>
            } />
            <Route path="/recurring"    element={
              <RoleRoute roles={['superadmin', 'admin', 'manager']}>
                <RecurringPage />
              </RoleRoute>
            } />
            <Route path="/discounts"    element={
              <RoleRoute roles={['superadmin', 'admin', 'manager']}>
                <DiscountsPage />
              </RoleRoute>
            } />

            {/* ── CATALOGUE ───────────────────────────────── */}
            <Route path="/services"     element={<ServicesPage />} />
            <Route path="/categories"   element={
              <RoleRoute roles={['superadmin', 'admin']}>
                <CategoriesPage />
              </RoleRoute>
            } />
            <Route path="/inventory"    element={<InventoryPage />} />
            <Route path="/inventory-reorder" element={
              <RoleRoute roles={['superadmin', 'admin', 'manager']}>
                <InventoryReorderPage />
              </RoleRoute>
            } />

            {/* ── TEAM ────────────────────────────────────── */}
            <Route path="/staff"        element={<StaffPage />} />
            <Route path="/commission"   element={
              <RoleRoute roles={['superadmin', 'admin', 'manager', 'staff']}>
                <CommissionPage />
              </RoleRoute>
            } />
            <Route path="/attendance"   element={
              <RoleRoute roles={['superadmin', 'admin', 'manager']}>
                <AttendancePage />
              </RoleRoute>
            } />

            {/* ── INSIGHTS ────────────────────────────────── */}
            <Route path="/ai-chat"      element={<AiChatPage />} />
            <Route path="/reports"      element={<ReportsPage />} />
            <Route path="/kpi-dashboard" element={
              <RoleRoute roles={['superadmin', 'admin', 'manager']}>
                <KpiDashboardPage />
              </RoleRoute>
            } />
            <Route path="/marketing" element={
              <RoleRoute roles={['superadmin', 'admin', 'manager']}>
                <MarketingAutomationPage />
              </RoleRoute>
            } />
            <Route path="/support"      element={<SupportTicketsPage />} />
            <Route path="/reviews"      element={
              <RoleRoute roles={['superadmin', 'admin', 'manager']}>
                <ReviewsPage />
              </RoleRoute>
            } />
            <Route path="/expenses"     element={<ExpensesPage />} />
            <Route path="/reminders"    element={<RemindersPage />} />
            <Route path="/consent-forms" element={<ConsentFormsPage />} />
            <Route path="/notifications" element={
              <RoleRoute roles={['superadmin', 'admin']}>
                <NotificationsPage />
              </RoleRoute>
            } />
            <Route path="/offer-sms" element={
              <RoleRoute roles={['superadmin', 'admin', 'manager']}>
                <OfferSmsPage />
              </RoleRoute>
            } />

            {/* ── SETTINGS ────────────────────────────────── */}
            <Route path="/branches"     element={
              <RoleRoute roles={['superadmin', 'admin']}>
                <BranchesPage />
              </RoleRoute>
            } />
            <Route path="/branding"     element={
              <RoleRoute roles={['superadmin', 'admin']}>
                <BrandingSettingsPage />
              </RoleRoute>
            } />
            <Route path="/payment-settings" element={
              <RoleRoute roles={['superadmin', 'admin']}>
                <PaymentSettingsPage />
              </RoleRoute>
            } />
            <Route path="/domain-settings" element={
              <RoleRoute roles={['superadmin', 'admin']}>
                <DomainSettingsPage />
              </RoleRoute>
            } />
            <Route path="/themes"       element={
              <RoleRoute roles={['superadmin', 'admin', 'manager', 'staff']}>
                <ThemeOptionsPage />
              </RoleRoute>
            } />
            <Route path="/users"        element={
              <RoleRoute roles={['superadmin']}>
                <UsersPage />
              </RoleRoute>
            } />

            {/* ── BILLING ─────────────────────────────────── */}
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/billing/payment" element={<BillingPaymentPage />} />
            <Route path="/billing/invoices" element={<BillingInvoicesPage />} />
            <Route path="/bank-slip-upload" element={<BankSlipUploadPage />} />

            {/* ── SECURITY ────────────────────────────────── */}
            <Route path="/security" element={<TwoFactorPage />} />

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

// ── Login page: redirect based on role ────────────────────────────────

function LoginRedirect() {
  const { isAuthenticated, user, maintenance } = useAuth();
  if (!isAuthenticated) {
    if (maintenance.enabled) return <Navigate to="/maintenance" replace />;
    return <LoginPage platformMode={isPlatformContext()} />;
  }
  if (user?.role === 'platform_admin') return <Navigate to="/platform/dashboard" replace />;
  if (maintenance.enabled) return <Navigate to="/maintenance" replace />;
  return <Navigate to="/dashboard" replace />;
}

function PlatformLoginRedirect() {
  const { isAuthenticated, user, maintenance } = useAuth();
  if (!isAuthenticated) {
    if (maintenance.enabled) return <Navigate to="/maintenance" replace />;
    return <LoginPage platformMode />;
  }
  if (user?.role === 'platform_admin') return <Navigate to="/platform/dashboard" replace />;
  if (maintenance.enabled) return <Navigate to="/maintenance" replace />;
  return <Navigate to="/dashboard" replace />;
}

// ── Routes to platform or tenant shell based on role ──────────────────

function AuthShellRouter() {
  const { user, maintenance } = useAuth();
  if (maintenance.enabled && user?.role !== 'platform_admin') return <Navigate to="/maintenance" replace />;
  if (user?.role === 'platform_admin') return <PlatformShell />;
  return <AppShell />;
}

// ── Root App ───────────────────────────────────────────────────────────

export default function App() {
  const { loading, maintenance } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <Routes>
      {/* ── Public (no shell) ── */}
      <Route
        path="/login"
        element={<LoginRedirect />}
      />
      <Route path="/platform/login" element={<PlatformLoginRedirect />} />
      <Route path="/signup"    element={<OnboardingPage />} />
      <Route path="/register" element={<OnboardingPage />} />
      <Route path="/impersonate"    element={<ImpersonateGate />} />
      <Route path="/booking"        element={<BookingPage />} />
      <Route path="/customer-portal/login"     element={<CustomerPortalLoginPage />} />
      <Route path="/customer-portal/register"  element={<CustomerRegisterPage />} />
      <Route path="/customer-portal" element={<CustomerPortalPage />} />
      <Route path="/token-display"  element={<TokenDisplayScreen />} />
      <Route path="/review/:token"        element={<ReviewFormPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
      <Route path="/maintenance"          element={<MaintenancePage />} />

      {/* ── Protected shell ── */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AuthShellRouter />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
