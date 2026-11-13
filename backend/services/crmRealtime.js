/**
 * CRM realtime fan-out to the staff inbox (Socket.io room `crm_tenant_{id}`).
 *
 * The API process owns Socket.io. BullMQ workers run in a separate process,
 * so when no local io exists we relay through the service-auth internal
 * endpoint (POST /api/crm/internal/realtime-emit). All calls are best-effort.
 */
'use strict';

const ALLOWED_EVENTS = new Set(['crm:message', 'crm:conversation']);

function roomFor(tenantId) {
  return `crm_tenant_${tenantId}`;
}

/** Emit on this process's Socket.io instance. Returns true if io was available. */
function emitLocal(tenantId, event, payload) {
  try {
    const { getIO } = require('../socket');
    const io = getIO();
    if (!io || !tenantId) return false;
    io.to(roomFor(tenantId)).emit(event, payload);
    return true;
  } catch (_) {
    return false;
  }
}

function relayToApi(tenantId, event, payload) {
  const secret = (process.env.AI_ENGINE_SERVICE_SECRET || process.env.CRM_SERVICE_SECRET || '').trim();
  if (!secret || typeof fetch !== 'function') return;
  const base = (process.env.BACKEND_INTERNAL_URL || 'http://backend:5000').replace(/\/$/, '');
  fetch(`${base}/api/crm/internal/realtime-emit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Key': secret,
      'X-Tenant-Id': String(tenantId),
    },
    body: JSON.stringify({ tenantId, event, payload }),
    signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(3000) : undefined,
  }).catch(() => { /* realtime is optional; inbox polls as fallback */ });
}

function emitCrmEvent(tenantId, event, payload) {
  if (!tenantId || !ALLOWED_EVENTS.has(event)) return;
  const body = payload && typeof payload === 'object'
    ? JSON.parse(JSON.stringify(payload)) // resolves Sequelize toJSON
    : payload;
  if (!emitLocal(tenantId, event, body)) relayToApi(tenantId, event, body);
}

/** Convenience: tell inboxes a conversation row changed (status, assignee, unread…). */
function emitConversationChanged(tenantId, conversationId, extra = {}) {
  emitCrmEvent(tenantId, 'crm:conversation', { conversation_id: conversationId, ...extra });
}

module.exports = { emitCrmEvent, emitConversationChanged, emitLocal, ALLOWED_EVENTS };
