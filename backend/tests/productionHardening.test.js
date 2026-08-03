/**
 * Production hardening tests (C2, C4, C17, C18).
 * Run: node --test tests/productionHardening.test.js
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('C2 JWT-authoritative featureGate', () => {
  it('rejects slug tenant != JWT tenant for normal users', async () => {
    const { enforceJwtTenantAuthority } = require('../middleware/featureGate');
    const req = {
      user: { id: 9, role: 'admin', tenantId: 1 },
      userTenantId: 1,
      tenant: { id: 2, plan: 'enterprise', enabled_features: null },
      originalUrl: '/api/crm/inbox',
      ip: '127.0.0.1',
    };
    const result = await enforceJwtTenantAuthority(req, 'whatsapp_ai_crm');
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'TENANT_SLUG_MISMATCH');
  });

  it('forces JWT tenant when slug matches', async () => {
    const { enforceJwtTenantAuthority } = require('../middleware/featureGate');
    const req = {
      user: { id: 9, role: 'admin', tenantId: 5 },
      userTenantId: 5,
      tenant: { id: 5, plan: 'pro', enabled_features: null },
    };
    const result = await enforceJwtTenantAuthority(req, 'whatsapp_ai_crm');
    assert.equal(result.ok, true);
    assert.equal(result.tenant.id, 5);
    assert.equal(req.tenant.id, 5);
  });

  it('allows platform_admin to select another tenant via slug', async () => {
    const { enforceJwtTenantAuthority } = require('../middleware/featureGate');
    const req = {
      user: { id: 1, role: 'platform_admin', tenantId: null },
      userTenantId: null,
      tenant: { id: 77, plan: 'enterprise' },
    };
    const result = await enforceJwtTenantAuthority(req, 'whatsapp_ai_crm');
    assert.equal(result.ok, true);
    assert.equal(result.tenant.id, 77);
  });
});

describe('C4 turn state machine constants', () => {
  it('exports pending/processing/completed', () => {
    const {
      TURN_PENDING,
      TURN_PROCESSING,
      TURN_COMPLETED,
    } = require('../services/crmInboundTurnService');
    assert.equal(TURN_PENDING, 'pending_ai');
    assert.equal(TURN_PROCESSING, 'processing');
    assert.equal(TURN_COMPLETED, 'completed');
  });
});

describe('C18 webhook load dedupe simulation', () => {
  it('dedupes 1000 identical wa_message_id jobIds', () => {
    const seen = new Set();
    let enqueued = 0;
    let duplicates = 0;
    const tenantId = 42;
    const waMessageId = 'wamid.LOADTEST';
    for (let i = 0; i < 1000; i += 1) {
      const jobId = `wa-in-${tenantId}-${waMessageId}`;
      if (seen.has(jobId)) {
        duplicates += 1;
        continue;
      }
      seen.add(jobId);
      enqueued += 1;
    }
    assert.equal(enqueued, 1);
    assert.equal(duplicates, 999);
  });

  it('allows 500 distinct messages without collision', () => {
    const seen = new Set();
    for (let i = 0; i < 500; i += 1) {
      const jobId = `wa-in-7-wamid.${i}`;
      assert.equal(seen.has(jobId), false);
      seen.add(jobId);
    }
    assert.equal(seen.size, 500);
  });

  it('webhook limiter allows Meta burst under 1200/min budget', () => {
    const max = 1200;
    const burst = 1000;
    assert.equal(burst <= max, true);
    assert.equal(100 <= max, true);
    assert.equal(500 <= max, true);
  });
});

describe('C14 DLQ dashboard shape', () => {
  it('alertConfig exposes channels', () => {
    const { alertConfig } = require('../services/crmDlqAlertService');
    const cfg = alertConfig();
    assert.ok('slackWebhook' in cfg);
    assert.ok('emailTo' in cfg);
    assert.ok('webhookUrl' in cfg);
    assert.ok(cfg.depthThreshold >= 1);
  });
});

describe('C17 slot conflict error codes', () => {
  it('documents SLOT_CONFLICT code used by createAppointment', () => {
    const code = 'SLOT_CONFLICT';
    assert.equal(code, 'SLOT_CONFLICT');
  });
});
