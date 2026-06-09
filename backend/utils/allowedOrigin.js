/**
 * Single source of truth for the trusted front-end origins.
 *
 * Used by CORS, Socket.io, and any flow that builds a user-facing URL from a
 * request header (e.g. password-reset links). Never build security-sensitive
 * links from an unvalidated Origin/Referer header — an attacker can forge it.
 */
function isAllowedOrigin(origin) {
  if (!origin) return true; // server-to-server or same-origin
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/([a-z0-9-]+\.)?salon\.hexalyte\.com$/.test(origin)) return true;
  if (/^https?:\/\/([a-z0-9-]+\.)?hexalyte\.com$/.test(origin)) return true;
  return false;
}

/**
 * Resolve the origin of a request from the Origin header, falling back to the
 * Referer header. Returns '' when neither is present/parseable. The result is
 * NOT validated here — call isAllowedOrigin() on it before trusting it.
 */
function requestOrigin(req) {
  if (req.headers.origin) return req.headers.origin;
  if (req.headers.referer) {
    try { return new URL(req.headers.referer).origin; } catch { /* ignore */ }
  }
  return '';
}

module.exports = { isAllowedOrigin, requestOrigin };
