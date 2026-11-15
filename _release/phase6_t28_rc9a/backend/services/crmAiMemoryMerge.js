'use strict';

/**
 * RC9 audit — pure merge helpers for CRM AI memory (testable without DB).
 * Used by crmAiMemoryService.upsertMemoryFromTurn.
 */

function normalizeQaKey(row) {
  if (!row || typeof row !== 'object') return '';
  return `${String(row.q || '').trim().toLowerCase()}||${String(row.a || '').trim().toLowerCase()}`;
}

/**
 * Append incoming Q&A onto prior history without duplicating identical q+a pairs.
 * Caps at 12. Does not invent content.
 */
function appendQaHistory(prior, incoming) {
  const merged = [];
  const seen = new Set();
  for (const q of [...(Array.isArray(prior) ? prior : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    if (!q || typeof q !== 'object') continue;
    const key = normalizeQaKey(q);
    if (!key || key === '||') continue;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      q: String(q.q || '').slice(0, 180),
      a: String(q.a || '').slice(0, 220),
      topic: q.topic || null,
      at: q.at || new Date().toISOString(),
    });
  }
  return merged.slice(-12);
}

/**
 * When customer correction changes service name/topic, clear stale catalogue IDs
 * so Redis-less CRM memory cannot keep pointing at the old service.
 */
function applyServiceCorrectionPatch(patch, { field, newValue } = {}) {
  const out = { ...(patch && typeof patch === 'object' ? patch : {}) };
  if (field === 'last_service' || field === 'current_topic') {
    out.last_service = newValue;
    out.current_topic = newValue;
    out.last_service_id = null;
    out.pricing_service_key = null;
    // Soft-clear structured truth service identity (keep date/time if present)
    const truth = (out.conversation_truth && typeof out.conversation_truth === 'object')
      ? { ...out.conversation_truth }
      : {};
    truth.selected_service_id = { value: null, confidence: 0, confirmed: false, source_message: 'customer_correction' };
    truth.selected_service_name = {
      value: newValue,
      confidence: 0.95,
      confirmed: true,
      source_message: 'customer_correction',
    };
    out.conversation_truth = truth;
  }
  return out;
}

/**
 * Resolve last_service_id with explicit null support after corrections.
 * Prefer flow → patch (including explicit null) → previous.
 */
function resolveLastServiceId({ flowServiceId, patch, prevId, correctionCleared }) {
  if (correctionCleared) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'last_service_id')) {
      return patch.last_service_id == null ? null : patch.last_service_id;
    }
    return null;
  }
  if (flowServiceId != null && flowServiceId !== '') return flowServiceId;
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'last_service_id')) {
    return patch.last_service_id;
  }
  return prevId != null ? prevId : null;
}

/**
 * Tenant isolation guard: refuse to apply a memory patch that claims a different tenant.
 */
function assertPatchTenant(tenantId, patch) {
  if (!patch || typeof patch !== 'object') return true;
  if (patch.tenant_id == null && patch.tenantId == null) return true;
  const claimed = Number(patch.tenant_id != null ? patch.tenant_id : patch.tenantId);
  if (!Number.isFinite(claimed)) return true;
  return Number(tenantId) === claimed;
}

module.exports = {
  normalizeQaKey,
  appendQaHistory,
  applyServiceCorrectionPatch,
  resolveLastServiceId,
  assertPatchTenant,
};
