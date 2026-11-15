'use strict';

/**
 * RC9 — memoryToContext must reload fields upsert writes (parity).
 * Run: node --test backend/services/__tests__/crmAiMemoryRc9.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { memoryToContext } = require('../crmAiMemoryService');

test('memoryToContext exposes RC9 structured fields', () => {
  const row = {
    summary: 'Customer: Keratin | AI: Rs 25000',
    preferred_services: ['keratin'],
    preferred_branch_id: 1,
    objections: null,
    meta: {
      language: 'si',
      script_mode: 'singlish',
      last_service: 'keratin',
      current_topic: 'keratin',
      last_quoted_price: 'Rs 25000',
      last_service_id: 42,
      last_duration_minutes: 180,
      preferred_date: '2026-11-20',
      preferred_time: '10:00',
      booking_status: null,
      booking_state: 'await_date',
      conversation_summary: 'Discussed keratin',
      pending_questions: ['booking_date'],
      commitments: ['customer:Hari ehema karamu'],
      correction_log: [{ text: 'nemei haircut' }],
      qa_history: [{ q: 'Eka keeyada?', a: 'Rs 25000', topic: 'keratin' }],
      conversation_truth: { selected_service_name: { value: 'keratin' } },
      pricing_service_key: 'keratin',
    },
  };
  const ctx = memoryToContext(row);
  assert.equal(ctx.last_service, 'keratin');
  assert.equal(ctx.conversation_summary, 'Discussed keratin');
  assert.deepEqual(ctx.pending_questions, ['booking_date']);
  assert.equal(ctx.qa_history.length, 1);
  assert.equal(ctx.last_service_id, 42);
  assert.equal(ctx.last_duration_minutes, 180);
  assert.equal(ctx.preferred_date, '2026-11-20');
  assert.ok(ctx.conversation_truth);
  assert.equal(ctx.pricing_service_key, 'keratin');
});

test('memoryToContext null-safe', () => {
  assert.equal(memoryToContext(null), null);
});
