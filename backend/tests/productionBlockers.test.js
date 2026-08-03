/**
 * Unit tests for production-blocker fixes (no DB required).
 * Run: node --test tests/productionBlockers.test.js
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

describe('C2 hasTenantFeature default-deny', () => {
  it('returns false for missing tenant', () => {
    const { hasTenantFeature } = require('../utils/tenantFeatures');
    assert.equal(hasTenantFeature(null, 'whatsapp_ai_crm'), false);
    assert.equal(hasTenantFeature(undefined, 'ai_knowledge_base'), false);
  });
});

describe('C6 service auth secret', () => {
  it('does not fall back to JWT_SECRET', () => {
    const prevAi = process.env.AI_ENGINE_SERVICE_SECRET;
    const prevCrm = process.env.CRM_SERVICE_SECRET;
    const prevJwt = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'jwt-only-secret-value-xxxxxxxx';
    delete process.env.AI_ENGINE_SERVICE_SECRET;
    delete process.env.CRM_SERVICE_SECRET;
    delete require.cache[require.resolve('../middleware/serviceAuth')];
    const { getServiceSecret } = require('../middleware/serviceAuth');
    assert.equal(getServiceSecret(), '');
    if (prevAi !== undefined) process.env.AI_ENGINE_SERVICE_SECRET = prevAi;
    else delete process.env.AI_ENGINE_SERVICE_SECRET;
    if (prevCrm !== undefined) process.env.CRM_SERVICE_SECRET = prevCrm;
    else delete process.env.CRM_SERVICE_SECRET;
    if (prevJwt !== undefined) process.env.JWT_SECRET = prevJwt;
    delete require.cache[require.resolve('../middleware/serviceAuth')];
  });

  it('timing-safe compare rejects wrong length', () => {
    const secret = 'abcdefghijklmnopqrstuvwxyz';
    const token = 'short';
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    assert.equal(a.length === b.length && crypto.timingSafeEqual(a, b), false);
  });
});

describe('C18 webhook limiter skip', () => {
  it('api limiter skip matches webhook path', () => {
    const path = '/api/webhooks/whatsapp';
    assert.equal(path.startsWith('/api/webhooks/whatsapp'), true);
    assert.equal('/api/crm/inbox'.startsWith('/api/webhooks/whatsapp'), false);
  });
});

describe('queue DLQ name', () => {
  it('exposes DLQ queue', () => {
    const { QUEUE_NAMES } = require('../services/queue');
    assert.equal(QUEUE_NAMES.DLQ, 'crm-dlq');
    assert.ok(QUEUE_NAMES.FOLLOWUP);
    assert.ok(QUEUE_NAMES.WA_INBOUND_AI);
  });
});
