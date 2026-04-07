import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { LoadingSpinner } from './components/shared/Feedback';
import Sidebar from './components/layout/Sidebar';
import Topbar  from './components/layout/Topbar';
import PlatformSidebar from './components/layout/PlatformSidebar';
import SubscriptionBanner from './components/shared/SubscriptionBanner';
import { useBreakpoint } from './hooks/useBreakpoint';
import { isPlatformContext } from './utils/tenant';

// Platform pages
import PlatformDashboardPage     from './pages/platform/PlatformDashboardPage';
import PlatformTenantsPage       from './pages/platform/PlatformTenantsPage';
import PlatformSubscriptionsPage from './pages/platform/PlatformSubscriptionsPage';

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
import WalkInPage      from './pages/WalkInPage';
import TokenDisplayScreen from './pages/TokenDisplayScreen';
import NotificationsPage from './pages/NotificationsPage';
import OfferSmsPage from './pages/OfferSmsPage';
import ExpensesPage     from './pages/ExpensesPage';
import ReviewsPage      from './pages/ReviewsPage';
import ReviewFormPage   from './pages/ReviewFormPage';
import PackagesPage     from './pages/PackagesPage';
import DiscountsPage    from './pages/DiscountsPage';
import RecurringPage    from './pages/RecurringPage';
import CategoriesPage   from './pages/CategoriesPage';
import AiChatPage       from './pages/AiChatPage';
import BillingPage      from './pages/BillingPage';
import OnboardingPage   from './pages/OnboardingPage';

// ── Auth guards ────────────────────────────────────────────────────────

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flex: 1 }}>
        <LoadingSpinner />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
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
  if (!user || user.role !== 'platform_admin') return <Navigate to="/login" replace />;
  return children;
}

// ── Platform Admin shell ───────────────────────────────────────────────

function PlatformShell() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <PlatformSidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div style={{ flex: 1, overflowY: 'auto', background: '#F5F3FF' }}>
        <Routes>
          <Route path="platform/dashboard"     element={<PlatformDashboardPage />} />
          <Route path="platform/tenants"        element={<PlatformTenantsPage />} />
          <Route path="platform/subscriptions"  element={<PlatformSubscriptionsPage />} />
          <Route path="*"                        element={<Navigate to="/platform/dashboard" replace />} />
        </Routes>
      </div>
    </div>
  );
}

// ── App shell (authenticated layout) ──────────────────────────────────

function AppShell() {
  const { isNarrow, isMobile } = useBreakpoint();
  const [sbCollapsed,  setSbCollapsed]  = useState(false);
  const [sbMobileOpen, setSbMobileOpen] = useState(false);
  const { user } = useAuth();

  /* Auto-collapse on tablet, expand on desktop */
  useEffect(() => {
    setSbCollapsed(isNarrow && !isMobile);
  }, [isNarrow, isMobile]);

  const handleMenuClick = () => {
    if (isMobile) setSbMobileOpen(o => !o);
    else setSbCollapsed(c => !c);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        collapsed={sbCollapsed}
        onToggle={() => setSbCollapsed(c => !c)}
        currentUser={user}
        mobileOpen={sbMobileOpen}
        onMobileClose={() => setSbMobileOpen(false)}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar onMenuClick={handleMenuClick} />

        {/* Subscription warning banner — renders only when needed */}
        <SubscriptionBanner />

        <div style={{ flex: 1, overflowY: 'auto', background: '#F7F8FA' }}>
          <Routes>
            {/* ── MAIN ────────────────────────────────────── */}
            <Route path="/dashboard"    element={<DashboardPage />} />
            <Route path="/calendar"     element={<CalendarPage />} />
            <Route path="/walk-in"      element={<WalkInPage />} />
            <Route path="/walkin"       element={<WalkInPage />} />

            {/* ── OPERATIONS ──────────────────────────────── */}
            <Route path="/appointments" element={<AppointmentsPage />} />
            <Route path="/payments"     element={<PaymentsPage />} />
            <Route path="/customers"    element={<CustomersPage />} />
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
            <Route path="/reviews"      element={
              <RoleRoute roles={['superadmin', 'admin', 'manager']}>
                <ReviewsPage />
              </RoleRoute>
            } />
            <Route path="/expenses"     element={<ExpensesPage />} />
            <Route path="/reminders"    element={<RemindersPage />} />
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
            <Route path="/users"        element={
              <RoleRoute roles={['superadmin']}>
                <UsersPage />
              </RoleRoute>
            } />

            {/* ── BILLING ─────────────────────────────────── */}
            <Route path="/billing" element={<BillingPage />} />

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

// ── Login page: redirect based on role ────────────────────────────────

function LoginRedirect() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <LoginPage />;
  if (user?.role === 'platform_admin') return <Navigate to="/platform/dashboard" replace />;
  return <Navigate to="/dashboard" replace />;
}

// ── Routes to platform or tenant shell based on role ──────────────────

function AuthShellRouter() {
  const { user } = useAuth();
  if (user?.role === 'platform_admin') return <PlatformShell />;
  return <AppShell />;
}

// ── Root App ───────────────────────────────────────────────────────────

export default function App() {
  const { isAuthenticated, loading } = useAuth();

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
      <Route path="/signup"         element={<OnboardingPage />} />
      <Route path="/booking"        element={<BookingPage />} />
      <Route path="/customer-portal/login" element={<CustomerPortalLoginPage />} />
      <Route path="/customer-portal" element={<CustomerPortalPage />} />
      <Route path="/token-display"  element={<TokenDisplayScreen />} />
      <Route path="/review/:token"  element={<ReviewFormPage />} />

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
