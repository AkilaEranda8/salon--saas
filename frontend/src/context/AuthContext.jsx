import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';
import { getTenantSlug } from '../utils/tenant';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [maintenance, setMaintenance] = useState({
    enabled: false,
    message: 'System is under maintenance. Please try again later.',
    endsAt: null,
  });

  // The slug for the current subdomain — available to all consumers
  const tenantSlug = getTenantSlug();

  // On mount: validate the httpOnly JWT cookie via /auth/me
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const [authRes, maintenanceRes] = await Promise.allSettled([
          api.get('/auth/me'),
          fetch('/api/public/maintenance-status').then((r) => (r.ok ? r.json() : null)),
        ]);

        if (authRes.status === 'fulfilled') {
          setUser(authRes.value.data.user);
        } else {
          setUser(null);
        }

        const maintenanceData = maintenanceRes.status === 'fulfilled' ? maintenanceRes.value : null;
        if (maintenanceData) {
          setMaintenance({
            enabled: !!maintenanceData.enabled,
            message: maintenanceData.message || 'System is under maintenance. Please try again later.',
            endsAt: maintenanceData.endsAt || null,
          });
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
    const refreshMaintenance = async () => {
      try {
        const res = await fetch('/api/public/maintenance-status');
        if (!res.ok) return;
        const data = await res.json();
        setMaintenance({
          enabled: !!data.enabled,
          message: data.message || 'System is under maintenance. Please try again later.',
          endsAt: data.endsAt || null,
        });
      } catch {
        // ignore transient refresh failures
      }
    };

    refreshMaintenance();
    const timer = setInterval(refreshMaintenance, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (maintenance.enabled && user && user.role !== 'platform_admin') {
      logout();
    }
  }, [maintenance.enabled, user]);

  /**
   * Authenticate the user.
   * The X-Tenant-Slug header is already sent by the axios instance
   * (configured in src/api/axios.js based on the current subdomain).
   *
   * @param {{ username: string, password: string }} credentials
   * @returns {Promise<object>} server response data
   */
  const login = async (credentials) => {
    const normalized = {
      username: String(credentials?.username ?? '').trim(),
      password: String(credentials?.password ?? ''),
    };
    const response = await api.post('/auth/login', normalized);
    // If 2FA required, don't set user yet — return the flag to the caller
    if (response.data.requires2fa) {
      return response.data; // { requires2fa: true, tempToken: '...' }
    }
    setUser(response.data.user);
    return response.data;
  };

  /**
   * Complete login after TOTP verification.
   */
  const verify2FA = async ({ tempToken, code }) => {
    const response = await api.post('/auth/2fa/verify-login', { tempToken, code });
    setUser(response.data.user);
    return response.data;
  };

  /**
   * Clear session on client and server.
   */
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Proceed with local logout even if server call fails
    } finally {
      setUser(null);
    }
  };

  const refreshUser = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.user);
    } catch {
      // silently ignore — user stays as-is
    }
  };

  const isAuthenticated = !!user;

  // Derived tenant info from the logged-in user (populated by /auth/me)
  const tenant = user?.tenant ?? null;

  /**
   * Returns true if the tenant's subscription is in a state that
   * should show a warning banner (trial ending soon or suspended).
   */
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
      user,
      tenant,
      tenantSlug,
      login,
      logout,
      refreshUser,
      verify2FA,
      isAuthenticated,
      loading,
      subscriptionWarning,
      maintenance,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

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
