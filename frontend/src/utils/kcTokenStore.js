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
  _refreshToken = refresh_token;
  _expiresAt    = Date.now() + (expires_in - 15) * 1000; // 15-second buffer
  if (refresh_token) localStorage.setItem(STORAGE_KEY, refresh_token);
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
export const getKcRefreshToken = () => _refreshToken ?? localStorage.getItem(STORAGE_KEY);
export const isKcTokenExpiring  = () => !_accessToken || Date.now() >= _expiresAt;

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
      if (!res.ok) { clearKcTokens(); return null; }
      const data = await res.json();
      setKcTokens(data);
      return data.access_token;
    })
    .catch(() => { clearKcTokens(); return null; })
    .finally(() => { _refreshing = null; });

  return _refreshing;
}
