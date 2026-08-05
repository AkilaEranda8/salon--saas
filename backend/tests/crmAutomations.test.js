/**
 * CRM Automations — unit tests (no DB).
 * Run: node --test tests/crmAutomations.test.js
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('CRM automation catalog', () => {
  it('exposes seven automation types', () => {
    const { AUTOMATION_CATALOG, interpolate } = require('../services/crmAutomationCatalog');
    assert.equal(AUTOMATION_CATALOG.length, 7);
    const types = AUTOMATION_CATALOG.map((c) => c.type);
    assert.ok(types.includes('appointment_reminder'));
    assert.ok(types.includes('abandoned_booking'));
    assert.ok(types.includes('promotional_campaign'));
    assert.equal(
      interpolate('Hi {{name}} from {{salon}}', { name: 'Akila', salon: 'Larvendo' }),
      'Hi Akila from Larvendo'
    );
  });
});

describe('CRM automation model types', () => {
  it('matches catalog types', () => {
    const CrmAutomation = require('../models/CrmAutomation');
    const { AUTOMATION_CATALOG } = require('../services/crmAutomationCatalog');
    for (const c of AUTOMATION_CATALOG) {
      assert.ok(CrmAutomation.TYPES.includes(c.type), `missing type ${c.type}`);
    }
  });
});

describe('CRM automation runner helpers', () => {
  it('maps delay strings to ms', () => {
    const { delayToMs } = require('../services/crmAutomationRunner');
    assert.equal(delayToMs('2_hours'), 2 * 60 * 60 * 1000);
    assert.equal(delayToMs('30_minutes'), 30 * 60 * 1000);
    assert.equal(delayToMs('unknown'), null);
  });
});

describe('CRM automation routes registered', () => {
  it('crm router stack includes automations paths', () => {
    const router = require('../routes/crm');
    const paths = [];
    for (const layer of router.stack || []) {
      if (layer.route?.path) paths.push(`${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
    }
    const joined = paths.join('\n');
    assert.match(joined, /\/automations/);
    assert.match(joined, /\/automations\/dashboard/);
    assert.match(joined, /\/automations\/history/);
    assert.match(joined, /\/automations\/:id\/run/);
  });
});
