'use strict';

/**
 * RC9 final audit — focused regression tests (no DB / no WhatsApp).
 * Run: node --test backend/services/__tests__/crmAiMemoryRc9Audit.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  appendQaHistory,
  applyServiceCorrectionPatch,
  assertPatchTenant,
  resolveLastServiceId,
} = require('../crmAiMemoryMerge');
const { memoryToContext } = require('../crmAiMemoryService');

// ── 1. Redis loss: CRM row still recovers structured memory ─────────────────

test('audit1_crm_memory_survives_redis_loss_via_memoryToContext', () => {
  // Simulate MySQL CrmAiMemory row after Redis booking session was wiped
  const row = {
    summary: 'Customer: Keratin | AI: Rs 25000',
    preferred_services: ['keratin'],
    meta: {
      last_service: 'keratin',
      current_topic: 'keratin',
      last_service_id: 42,
      last_quoted_price: 'Rs 25000',
      last_duration_minutes: 180,
      preferred_date: '2026-11-20',
      preferred_time: '10:00',
      booking_state: 'await_date',
      qa_history: [{ q: 'Eka keeyada?', a: 'Rs 25000', topic: 'keratin' }],
      conversation_truth: {
        selected_service_id: { value: 42, confirmed: true },
        selected_service_name: { value: 'keratin', confirmed: true },
        preferred_date: { value: '2026-11-20', confirmed: true },
      },
    },
  };
  const ctx = memoryToContext(row);
  assert.equal(ctx.last_service, 'keratin');
  assert.equal(ctx.last_service_id, 42);
  assert.equal(ctx.preferred_date, '2026-11-20');
  assert.equal(ctx.qa_history.length, 1);
  assert.equal(ctx.conversation_truth.selected_service_name.value, 'keratin');
  // Booking Redis SM is separate — CRM recovery does not invent a live Redis session
  assert.equal(ctx.booking_state, 'await_date');
});

// ── 2. Corrections clear stale service IDs ───────────────────────────────────

test('audit2_correction_clears_stale_service_id', () => {
  const patched = applyServiceCorrectionPatch(
    {
      last_service: 'keratin',
      last_service_id: 42,
      pricing_service_key: 'keratin',
      conversation_truth: {
        selected_service_id: { value: 42, confirmed: true },
        selected_service_name: { value: 'keratin', confirmed: true },
      },
    },
    { field: 'last_service', newValue: 'haircut' },
  );
  assert.equal(patched.last_service, 'haircut');
  assert.equal(patched.current_topic, 'haircut');
  assert.equal(patched.last_service_id, null);
  assert.equal(patched.pricing_service_key, null);
  assert.equal(patched.conversation_truth.selected_service_id.value, null);
  assert.equal(patched.conversation_truth.selected_service_name.value, 'haircut');
});

test('audit2_resolveLastServiceId_honors_explicit_null_after_correction', () => {
  // Reproducible pre-fix failure mode: `a || b || prev` kept stale 42
  const stale = resolveLastServiceId({
    flowServiceId: undefined,
    patch: { last_service_id: null },
    prevId: 42,
    correctionCleared: false,
  });
  // Without correctionCleared, explicit null in patch still wins via hasOwnProperty path
  assert.equal(stale, null);

  const cleared = resolveLastServiceId({
    flowServiceId: undefined,
    patch: { last_service_id: null, last_service: 'haircut' },
    prevId: 42,
    correctionCleared: true,
  });
  assert.equal(cleared, null);

  const keepFlow = resolveLastServiceId({
    flowServiceId: 99,
    patch: { last_service_id: null },
    prevId: 42,
    correctionCleared: false,
  });
  assert.equal(keepFlow, 99);
});

// ── 3. Duplicate Q&A from echoing prior history ─────────────────────────────

test('audit3_qa_history_no_duplicate_when_prior_echoed', () => {
  const prior = [
    { q: 'Keratin thiyenawada?', a: 'Ow thiyenawa', topic: 'keratin' },
    { q: 'Eka keeyada?', a: 'Rs 25000', topic: 'keratin' },
  ];
  // Pre-fix bug: CI memory_patch echoed full qa_history, upsert appended onto prior again
  const incomingEcho = [
    ...prior,
    { q: 'Ekata kochchara?', a: '180 min', topic: 'keratin' },
  ];
  const merged = appendQaHistory(prior, incomingEcho);
  const keys = merged.map((r) => `${r.q}|${r.a}`);
  assert.equal(new Set(keys).size, keys.length, 'duplicate q+a pairs must not appear');
  assert.equal(merged.length, 3);
  assert.equal(merged[2].q, 'Ekata kochchara?');
});

test('audit3_qa_history_caps_at_12', () => {
  const prior = Array.from({ length: 12 }, (_, i) => ({ q: `q${i}`, a: `a${i}` }));
  const incoming = [{ q: 'q12', a: 'a12' }];
  const merged = appendQaHistory(prior, incoming);
  assert.equal(merged.length, 12);
  assert.equal(merged[0].q, 'q1');
  assert.equal(merged[11].q, 'q12');
});

// ── 4. Tenant isolation ─────────────────────────────────────────────────────

test('audit4_assertPatchTenant_rejects_cross_tenant_claim', () => {
  assert.equal(assertPatchTenant(28, { tenant_id: 28, last_service: 'keratin' }), true);
  assert.equal(assertPatchTenant(28, { last_service: 'keratin' }), true); // no claim
  assert.equal(assertPatchTenant(28, { tenant_id: 99, last_service: 'stolen' }), false);
  assert.equal(assertPatchTenant(28, { tenantId: 7 }), false);
});

test('audit4_memoryToContext_does_not_invent_other_tenant_fields', () => {
  const ctx = memoryToContext({
    summary: 'x',
    meta: { last_service: 'keratin', qa_history: [{ q: 'a', a: 'b' }] },
  });
  assert.equal(ctx.last_service, 'keratin');
  // Isolation is enforced at loadMemory(where: { tenant_id }) — context itself is row-scoped
  assert.ok(Array.isArray(ctx.qa_history));
});

test('audit4_cross_tenant_rows_remain_isolated_when_loaded_separately', () => {
  const row28 = {
    summary: 't28',
    preferred_services: ['keratin'],
    meta: { last_service: 'keratin', last_service_id: 42, qa_history: [{ q: 'k?', a: 'yes' }] },
  };
  const row99 = {
    summary: 't99',
    preferred_services: ['bridal'],
    meta: { last_service: 'bridal', last_service_id: 7, qa_history: [{ q: 'b?', a: 'yes' }] },
  };
  const c28 = memoryToContext(row28);
  const c99 = memoryToContext(row99);
  assert.equal(c28.last_service, 'keratin');
  assert.equal(c99.last_service, 'bridal');
  assert.notEqual(c28.last_service_id, c99.last_service_id);
  // Simulating loadMemory(tenantId) — each context only sees its own row payload
  assert.equal(c28.qa_history[0].q, 'k?');
  assert.equal(c99.qa_history[0].q, 'b?');
  assert.equal(assertPatchTenant(28, { tenant_id: 99, qa_history: c99.qa_history }), false);
});
