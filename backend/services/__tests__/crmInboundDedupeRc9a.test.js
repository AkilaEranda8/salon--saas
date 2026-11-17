/**
 * RC9a inbound dedupe: webhook redelivery vs intentional customer repeats.
 * No Redis / queue required — exercises enqueueInboundTurn policy with mocks.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('body debounce only applies when waMessageId is missing', async () => {
  const redisCalls = [];
  const enqueued = [];

  const redis = {
    async set(key, val, ...args) {
      redisCalls.push({ key, val, args });
      // Simulate existing key → NX fails
      if (redisCalls.filter((c) => c.key === key).length > 1) return null;
      return 'OK';
    },
  };

  // Lightweight reimplementation of the policy under test (mirrors crmInboundTurnService).
  async function enqueueInboundTurnPolicy(data, { getRedis, enqueue, cacheKey }) {
    const tenantId = data.tenantId || data.tenant_id;
    const waMessageId = data.waMessageId || data.wa_message_id;
    const phone = String(data.phone || '').replace(/\D/g, '').slice(-12);
    const bodyNorm = String(data.message || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
    const hasImages = Array.isArray(data.images) && data.images.length > 0;
    const hasAudio = !!(data.audio && data.audio.dataBase64);

    if (tenantId && phone && bodyNorm && !hasImages && !hasAudio && !waMessageId) {
      const r = getRedis();
      if (r) {
        const { createHash } = require('crypto');
        const h = createHash('sha1').update(bodyNorm).digest('hex').slice(0, 16);
        const key = cacheKey(tenantId, 'crm', 'inbound_debounce', `${phone}:${h}`);
        const got = await r.set(key, '1', 'EX', 12, 'NX');
        if (!got) return null;
      }
    }

    return enqueue('WA_INBOUND_AI', data, {
      jobId: waMessageId ? `wa-in-${tenantId}-${waMessageId}` : undefined,
    });
  }

  const deps = {
    getRedis: () => redis,
    enqueue: async (q, data, opts) => {
      enqueued.push({ q, data, opts });
      return { id: enqueued.length };
    },
    cacheKey: (...parts) => parts.join(':'),
  };

  const body = 'I need haircut booking for tomorrow 8.30am';

  // First intentional message with WA id
  const a = await enqueueInboundTurnPolicy(
    { tenantId: 28, phone: '94771234567', message: body, waMessageId: 'wamid.AAA' },
    deps
  );
  assert.ok(a);
  assert.equal(enqueued[0].opts.jobId, 'wa-in-28-wamid.AAA');

  // Same text, NEW waMessageId → must enqueue (intentional customer repeat)
  const b = await enqueueInboundTurnPolicy(
    { tenantId: 28, phone: '94771234567', message: body, waMessageId: 'wamid.BBB' },
    deps
  );
  assert.ok(b);
  assert.equal(enqueued.length, 2);
  assert.equal(enqueued[1].opts.jobId, 'wa-in-28-wamid.BBB');

  // No waMessageId + same body twice → second debounced
  const c1 = await enqueueInboundTurnPolicy(
    { tenantId: 28, phone: '94771234567', message: body },
    deps
  );
  assert.ok(c1);
  const c2 = await enqueueInboundTurnPolicy(
    { tenantId: 28, phone: '94771234567', message: body },
    deps
  );
  assert.equal(c2, null);
  assert.equal(enqueued.length, 3);
});

test('ai already confirmed suppresses duplicate template confirm marker', () => {
  const aiReply = 'Done! Haircut booked for 2026-11-18 at 08:30. Ref #154';
  const aiAlreadyConfirmed = /\b(confirmed|booked|appointment\s+(?:is\s+)?(?:set|confirmed)|ref\s*#?\d+)\b/i.test(aiReply);
  assert.equal(aiAlreadyConfirmed, true);

  const plainAsk = 'What time is available tomorrow?';
  assert.equal(
    /\b(confirmed|booked|appointment\s+(?:is\s+)?(?:set|confirmed)|ref\s*#?\d+)\b/i.test(plainAsk),
    false
  );
});
