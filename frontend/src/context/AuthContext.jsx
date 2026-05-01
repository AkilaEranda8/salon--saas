import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';
import { getTenantSlug } from '../utils/tenant';
import {
  setKcTokens,
  clearKcTokens,
  getKcRefreshToken,
  refreshKcToken,
} from '../utils/kcTokenStore';

const USE_KEYCLOAK = import.meta.env.VITE_USE_KEYCLOAK === 'true';

const AuthContext = createContext(null);

// ─── Shared maintenance polling hook ─────────────────────────────────────────
function useMaintenancePolling() {
  const [maintenance, setMaintenance] = useState({
    enabled: false,
    message: 'System is under maintenance. Please try again later.',
    endsAt: null,
  });

  const applyData = (data) => {
    if (!data) return;
    setMaintenance({
      enabled: !!data.enabled,
      message: data.message || 'System is under maintenance. Please try again later.',
      endsAt: data.endsAt || null,
    });
  };

  useEffect(() => {
    let active = true;
    const poll = () =>
      fetch('/api/public/maintenance-status')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (active) applyData(data); })
        .catch(() => {});

    poll();
    const timer = setInterval(poll, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  return [maintenance, setMaintenance];
}

// ─────────────────────────────────────────────────────────────────────────────
// KEYCLOAK MODE
// ─────────────────────────────────────────────────────────────────────────────
function KeycloakAuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [maintenance]         = useMaintenancePolling();
  const tenantSlug            = getTenantSlug();

  // ── On mount: restore session from saved refresh token ──────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const rt = getKcRefreshToken();
      if (rt) {
        try {
          const newToken = await refreshKcToken();
          if (newToken && !cancelled) {
            const res = await api.get('/auth/me');
            if (!cancelled) setUser(res.data.user);
          } else if (!cancelled) {
            setUser(null);
          }
        } catch {
          clearKcTokens();
          if (!cancelled) setUser(null);
        }
      } else {
        if (!cancelled) setUser(null);
      }
      if (!cancelled) setLoading(false);
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // ── Proactive token refresh every 4 minutes ──────────────────────────────────
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!getKcRefreshToken()) return;
      try {
        await refreshKcToken();
      } catch {
        clearKcTokens();
        setUser(null);
      }
    }, 4 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Force logout when maintenance kicks in for non-platform admins ───────────
  useEffect(() => {
    if (maintenance.enabled && user && user.role !== 'platform_admin') {
      logout();
    }
  }, [maintenance.enabled, user]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Login with username + password via the backend KC proxy.
   * Compatible with LoginPage.jsx's existing call signature.
   */
  const login = async (credentials) => {
    const res = await api.post('/auth/kc-login', credentials);
    setKcTokens(res.data);
    const me = await api.get('/auth/me');
    setUser(me.data.user);
    return { user: me.data.user };
  };

  /**
   * No-op — 2FA via KC is handled on the KC login page if enabled.
   * Kept so LoginPage.jsx callers do not throw.
   */
  const verify2FA = async () => ({ requires2fa: false });

  const logout = async () => {
    const rt = getKcRefreshToken();
    clearKcTokens();
    setUser(null);
    try { await api.post('/auth/kc-logout', { refresh_token: rt }); } catch { /* non-fatal */ }
  };

  const refreshUser = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.user);
    } catch {
      // silently ignore
    }
  };

  const tenant          = user?.tenant ?? null;
  const isAuthenticated = !!user;

  const subscriptionWarning = () => {
    if (!tenant) return null;
    if (tenant.status === 'suspended') return { type: 'suspended' };
    if (tenant.plan === 'trial' && tenant.trial_ends_at) {
      const daysLeft = Math.ceil(
        (new Date(tenant.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)
      );
      if (daysLeft <= 7) return { type: 'trial_ending', daysLeft };
    }
    return null;
  };

  return (
    <AuthContext.Provider value={{
      user, tenant, tenantSlug,
      login, logout, refreshUser, verify2FA,
      isAuthenticated, loading,
      subscriptionWarning, maintenance,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY MODE  (original cookie-based HS256 JWT — unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function LegacyAuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [maintenance]         = useMaintenancePolling();
  const tenantSlug            = getTenantSlug();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const [authRes, maintenanceRes] = await Promise.allSettled([
          api.get('/auth/me'),
          fetch('/api/public/maintenance-status').then((r) => (r.ok ? r.json() : null)),
        ]);

        setUser(authRes.status === 'fulfilled' ? authRes.value.data.user : null);

        const mData = maintenanceRes.status === 'fulfilled' ? maintenanceRes.value : null;
        if (mData) {
          // maintenance state handled by polling hook — mirror initial fetch here
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    if (maintenance.enabled && user && user.role !== 'platform_admin') {
      logout();
    }
  }, [maintenance.enabled, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (credentials) => {
    const normalized = {
      username: String(credentials?.username ?? '').trim(),
      password: String(credentials?.password ?? ''),
    };
    const response = await api.post('/auth/login', normalized);
    if (response.data.requires2fa) return response.data;
    setUser(response.data.user);
    return response.data;
  };

  const verify2FA = async ({ tempToken, code }) => {
    const response = await api.post('/auth/2fa/verify-login', { tempToken, code });
    setUser(response.data.user);
    return response.data;
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* non-fatal */ }
    finally { setUser(null); }
  };

  const refreshUser = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.user);
    } catch { /* silently ignore */ }
  };

  const tenant          = user?.tenant ?? null;
  const isAuthenticated = !!user;

  const subscriptionWarning = () => {
    if (!tenant) return null;
    if (tenant.status === 'suspended') return { type: 'suspended' };
    if (tenant.plan === 'trial' && tenant.trial_ends_at) {
      const daysLeft = Math.ceil(
        (new Date(tenant.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)
      );
      if (daysLeft <= 7) return { type: 'trial_ending', daysLeft };
    }
    return null;
  };

  return (
    <AuthContext.Provider value={{
      user, tenant, tenantSlug,
      login, logout, refreshUser, verify2FA,
      isAuthenticated, loading,
      subscriptionWarning, maintenance,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public exports — same interface regardless of mode
// ─────────────────────────────────────────────────────────────────────────────
export const AuthProvider = USE_KEYCLOAK ? KeycloakAuthProvider : LegacyAuthProvider;

/**
 * Hook to consume AuthContext.
 * Must be used inside <AuthProvider>.
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
