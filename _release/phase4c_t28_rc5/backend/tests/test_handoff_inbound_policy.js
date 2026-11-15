/**
 * Regression: post-handoff inbound routing policy (no silent drop / no ack spam).
 * Run: node backend/tests/test_handoff_inbound_policy.js
 */
'use strict';

const assert = require('assert');
const {
  shouldAssistDuringHandoff,
  isHandoffFaqAsk,
  wantsHumanOnly,
  handoffAckText,
  HANDOFF_ACK_EPISODE_TTL_SEC,
} = require('../services/crmHandoffInboundPolicy');

function test(name, fn) {
  try {
    fn();
    console.log('PASS', name);
  } catch (e) {
    console.error('FAIL', name, e.message);
    process.exitCode = 1;
  }
}

test('location after handoff → assist', () => {
  assert.strictEqual(shouldAssistDuringHandoff('Oyage salon eka koheda thiyenne?', 'queued'), true);
  assert.strictEqual(isHandoffFaqAsk('Oyage salon eka koheda thiyenne?'), true);
});

test('duration ask → assist', () => {
  assert.strictEqual(shouldAssistDuringHandoff('Kochchara wela yai da?', 'queued'), true);
});

test('ambiguous location follow-up → assist', () => {
  assert.strictEqual(shouldAssistDuringHandoff('Koheda?', 'queued'), true);
  assert.strictEqual(shouldAssistDuringHandoff('Kandy kiyala had?', 'queued'), true);
});

test('topic change FAQ while queued → assist', () => {
  assert.strictEqual(shouldAssistDuringHandoff('Opening hours kiyada?', 'queued'), true);
});

test('human-only ask → no AI assist', () => {
  assert.strictEqual(wantsHumanOnly('I want to talk to staff'), true);
  assert.strictEqual(shouldAssistDuringHandoff('I want to talk to staff', 'queued'), false);
});

test('human_active: FAQ yes, random chat no', () => {
  assert.strictEqual(shouldAssistDuringHandoff('Koheda salon eka?', 'human_active'), true);
  assert.strictEqual(shouldAssistDuringHandoff('ok', 'human_active'), false);
});

test('queued substantial ask → assist', () => {
  assert.strictEqual(shouldAssistDuringHandoff('Mata facial ekak oni', 'queued'), true);
});

test('ack text is respectful not casual', () => {
  const t = handoffAckText('Koheda?');
  assert.ok(/Sir\/Madam/i.test(t));
  assert.ok(!/Got your message ✅ A teammate will reply shortly/i.test(t));
  assert.ok(!/\baniwa\b|\bmachan\b|\bbro\b/i.test(t));
});

test('ack episode TTL is long (not 120s spam window)', () => {
  assert.ok(HANDOFF_ACK_EPISODE_TTL_SEC >= 3600);
});

test('pre-handoff style FAQ still classified', () => {
  assert.strictEqual(isHandoffFaqAsk('Where is the salon located?'), true);
  assert.strictEqual(isHandoffFaqAsk('how much is keratin'), true);
});

if (!process.exitCode) {
  console.log('All handoff inbound policy tests passed.');
}
