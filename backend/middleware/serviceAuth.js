/**
 * Service-to-service auth (backend ↔ ai_engine, workers).
 * Fail-closed. Never falls back to JWT_SECRET.
 */
'use strict';

const crypto = require('crypto');

function getServiceSecret() {
  return (process.env.AI_ENGINE_SERVICE_SECRET || process.env.CRM_SERVICE_SECRET || '').trim();
}

function requireServiceAuth(req, res, next) {
  const secret = getServiceSecret();
  if (!secret) {
    return res.status(503).json({ message: 'Service auth not configured.' });
  }
  const header = req.headers['x-service-key'] || req.headers['authorization'] || '';
  const token = String(header).replace(/^Bearer\s+/i, '').trim();
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (!token || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ message: 'Invalid service credentials.' });
  }
  req.isServiceAuth = true;
  return next();
}

module.exports = { requireServiceAuth, getServiceSecret };
