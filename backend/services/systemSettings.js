/**
 * systemSettings.js
 *
 * Maintenance mode state persisted in the `maintenance_logs` table (latest row).
 * Falls back to in-memory if the DB is unavailable.
 *
 * Cache TTL: 10 seconds — avoids a DB hit on every request while keeping
 * state consistent after a restart within 10 s.
 */

const CACHE_TTL_MS = 10 * 1000;

const _cache = {
  data:      null,
  fetchedAt: 0,
};

const DEFAULTS = {
  enabled:   false,
  message:   'System is under maintenance. Please try again later.',
  endsAt:    null,
  updatedAt: null,
  updatedBy: null,
};

// Lazy load model to avoid circular deps at startup
function getModel() {
  try {
    const { MaintenanceLog } = require('../models');
    if (MaintenanceLog && typeof MaintenanceLog.findOne === 'function') return MaintenanceLog;
  } catch (_) { /* ignore */ }
  return null;
}

async function getMaintenanceMode({ force = false } = {}) {
  const now = Date.now();
  if (!force && _cache.data && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return { ..._cache.data };
  }

  const Model = getModel();
  if (!Model) return { ...(DEFAULTS) };

  try {
    const row = await Model.findOne({ order: [['created_at', 'DESC']] });
    if (!row) {
      _cache.data = { ...DEFAULTS };
    } else {
      _cache.data = {
        enabled:   !!row.enabled,
        message:   row.message || DEFAULTS.message,
        endsAt:    row.ends_at  ? new Date(row.ends_at).toISOString() : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
        updatedBy: row.changed_by_user_id || null,
      };
    }
    _cache.fetchedAt = Date.now();
    return { ..._cache.data };
  } catch (_err) {
    // DB unavailable — return cached or defaults
    return _cache.data ? { ..._cache.data } : { ...DEFAULTS };
  }
}

async function setMaintenanceMode({ enabled, message, endsAt = null, updatedBy = null }) {
  const next = {
    enabled:   !!enabled,
    message:   message || DEFAULTS.message,
    endsAt:    endsAt  || null,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || null,
  };

  // Update in-memory cache immediately.
  // DB persistence is the responsibility of the caller (platformController.updateMaintenance
  // already calls MaintenanceLog.create after calling this function).
  _cache.data      = next;
  _cache.fetchedAt = Date.now();

  return { ...next };
}

module.exports = { getMaintenanceMode, setMaintenanceMode };
