import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';
import { getTenantSlug } from '../utils/tenant';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // The slug for the current subdomain — available to all consumers
  const tenantSlug = getTenantSlug();

  // On mount: validate the httpOnly JWT cookie via /auth/me
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await api.get('/auth/me');
        setUser(res.data.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

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
      isAuthenticated,
      loading,
      subscriptionWarning,
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
