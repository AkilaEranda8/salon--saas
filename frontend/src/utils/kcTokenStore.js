/**
 * kcTokenStore — module-level singleton for Keycloak token management.
 *
 * Shared between axios.js (reads token) and AuthContext.jsx (sets/clears token).
 * Using a plain module avoids circular-import issues.
 */

const STORAGE_KEY = '_kc_rt';

let _accessToken  = null;
let _refreshToken = null;
let _expiresAt    = 0;       // epoch ms when access token expires
let _refreshing   = null;    // shared Promise<string|null> while refresh is in flight

// ── Setters ───────────────────────────────────────────────────────────────────

export function setKcTokens({ access_token, refresh_token, expires_in }) {
  _accessToken  = access_token;
  if (refresh_token) {
    _refreshToken = refresh_token;
    localStorage.setItem(STORAGE_KEY, refresh_token);
  }
  _expiresAt = Date.now() + Math.max(0, (Number(expires_in) || 0) - 15) * 1000;
}

export function clearKcTokens() {
  _accessToken  = null;
  _refreshToken = null;
  _expiresAt    = 0;
  _refreshing   = null;
  localStorage.removeItem(STORAGE_KEY);
}

// ── Getters ───────────────────────────────────────────────────────────────────

export const getKcAccessToken  = () => _accessToken;
// localStorage is authoritative so every tab uses the latest rotated refresh token.
export const getKcRefreshToken = () => localStorage.getItem(STORAGE_KEY) ?? _refreshToken;
export const isKcTokenExpiring  = () => !_accessToken || Date.now() >= _expiresAt;

/**
 * After self-serve signup the owner is redirected to their tenant subdomain
 * with tokens in the URL hash. Consume once, then strip the hash.
 */
export function consumeOnboardHandoff() {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash || '';
  if (!hash.startsWith('#onboard=')) return false;
  const packed = hash.slice('#onboard='.length);
  try {
    const json = JSON.parse(atob(decodeURIComponent(packed)));
    if (!json?.access_token || !json?.refresh_token) return false;
    setKcTokens(json);
    window.history.replaceState({}, '', window.location.pathname + window.location.search);
    return true;
  } catch {
    return false;
  }
}

// ── Refresh helper ────────────────────────────────────────────────────────────
// Returns the new access token, or null if refresh fails.
// Coalesces concurrent callers into a single request.

export async function refreshKcToken() {
  if (_refreshing) return _refreshing;

  const rt = getKcRefreshToken();
  if (!rt) return null;

  _refreshing = fetch('/api/auth/kc-refresh', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ refresh_token: rt }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 && data?.code === 'INVALID_GRANT') {
          clearKcTokens();
        }
        return null;
      }
      const data = await res.json();
      setKcTokens(data);
      return data.access_token;
    })
    // Keep the refresh token on network/Keycloak outages; this is not a logout.
    .catch(() => null)
    .finally(() => { _refreshing = null; });

  return _refreshing;
}
