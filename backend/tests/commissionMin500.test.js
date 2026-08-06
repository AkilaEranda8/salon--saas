/**
 * Full commission system checks — run: node tests/commissionMin500.test.js
 */
'use strict';

const assert = require('assert');
const { computeCommissionDetails } = require('../utils/commissionCalculator');
const { computeHelperCommissionSplit } = require('../utils/helperCommission');
const { getMinCommissionableAmount, COMMISSION_MIN_AMOUNT } = require('../utils/tenantFeatures');

const pctStaff = { commission_type: 'percentage', commission_value: 10 };
const fixedStaff = { commission_type: 'fixed', commission_value: 100 };
const salaryOnly = { salary_type: 'salary_only', commission_type: 'percentage', commission_value: 10 };
const MIN = 500;

function bill(staff, amount, extra = {}) {
  return computeCommissionDetails({
    staff,
    total_amount: amount,
    subtotal: amount,
    minCommissionableAmount: MIN,
    ...extra,
  });
}

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('✓', name);
  } catch (err) {
    console.error('✗', name);
    console.error(' ', err.message);
    process.exitCode = 1;
  }
}

// ── Threshold on payment total ──────────────────────────────────────────────
check('499 → no commission (10%)', () => {
  assert.strictEqual(bill(pctStaff, 499).amount, 0);
});
check('500 → no commission (10%)', () => {
  assert.strictEqual(bill(pctStaff, 500).amount, 0);
});
check('501 → commission 50.1 (10%)', () => {
  assert.strictEqual(bill(pctStaff, 501).amount, 50.1);
});
check('1000 → commission 100 (10%)', () => {
  assert.strictEqual(bill(pctStaff, 1000).amount, 100);
});

check('500 fixed → 0', () => {
  assert.strictEqual(bill(fixedStaff, 500).amount, 0);
});
check('501 fixed → 100', () => {
  assert.strictEqual(bill(fixedStaff, 501).amount, 100);
});

check('salary_only always 0', () => {
  assert.strictEqual(bill(salaryOnly, 5000).amount, 0);
});

check('feature off (min=0) → 500 earns', () => {
  const r = computeCommissionDetails({
    staff: pctStaff,
    total_amount: 500,
    subtotal: 500,
    minCommissionableAmount: 0,
  });
  assert.strictEqual(r.amount, 50);
});

// ── Discounts reduce net below threshold ────────────────────────────────────
check('paid 600 - loyalty 100 = net 500 → 0', () => {
  const r = computeCommissionDetails({
    staff: pctStaff,
    total_amount: 600,
    subtotal: 600,
    loyalty_discount: 100,
    minCommissionableAmount: MIN,
  });
  assert.strictEqual(r.breakdown.netTotal, 500);
  assert.strictEqual(r.amount, 0);
});
check('paid 700 - promo 100 = net 600 → 60', () => {
  const r = computeCommissionDetails({
    staff: pctStaff,
    total_amount: 700,
    subtotal: 700,
    promo_discount: 100,
    minCommissionableAmount: MIN,
  });
  assert.strictEqual(r.breakdown.netTotal, 600);
  assert.strictEqual(r.amount, 60);
});

// ── Multi-service: gate on BILL total, not per line ─────────────────────────
check('500+500=1000 bill → earns (not zeroed per line)', () => {
  const r = computeCommissionDetails({
    staff: pctStaff,
    serviceIds: [1, 2],
    servicePrices: { 1: 500, 2: 500 },
    serviceNames: { 1: 'Cut', 2: 'Beard' },
    total_amount: 1000,
    subtotal: 1000,
    minCommissionableAmount: MIN,
  });
  assert.strictEqual(r.breakdown.netTotal, 1000);
  assert.strictEqual(r.amount, 100);
  assert.ok(!r.breakdown.skippedUnderMin);
  assert.strictEqual(r.breakdown.lines[0].commission, 50);
  assert.strictEqual(r.breakdown.lines[1].commission, 50);
});

check('300+200=500 bill → 0', () => {
  const r = computeCommissionDetails({
    staff: pctStaff,
    serviceIds: [1, 2],
    servicePrices: { 1: 300, 2: 200 },
    total_amount: 500,
    subtotal: 500,
    minCommissionableAmount: MIN,
  });
  assert.strictEqual(r.amount, 0);
  assert.strictEqual(r.breakdown.skippedUnderMin, true);
  assert.ok(r.breakdown.lines.every((l) => l.commission === 0 && l.skippedUnderMin));
});

check('400+101=501 bill → earns', () => {
  const r = computeCommissionDetails({
    staff: pctStaff,
    serviceIds: [1, 2],
    servicePrices: { 1: 400, 2: 101 },
    total_amount: 501,
    subtotal: 501,
    minCommissionableAmount: MIN,
  });
  assert.strictEqual(r.amount, 50.1);
});

// ── Service-wise rates ──────────────────────────────────────────────────────
check('service catalogue rate respected when bill > 500', () => {
  const r = computeCommissionDetails({
    staff: pctStaff,
    allowServiceOverrides: true,
    serviceIds: [1],
    servicePrices: { 1: 1000 },
    serviceCommissions: { 1: { commission_type: 'percentage', commission_value: 20 } },
    total_amount: 1000,
    subtotal: 1000,
    minCommissionableAmount: MIN,
  });
  assert.strictEqual(r.amount, 200);
  assert.strictEqual(r.breakdown.lines[0].source, 'service_catalog');
});

check('staff override rate when bill > 500', () => {
  const r = computeCommissionDetails({
    staff: pctStaff,
    allowServiceOverrides: true,
    specializations: [{ service_id: 1, commission_type: 'fixed', commission_value: 75 }],
    serviceIds: [1],
    servicePrices: { 1: 800 },
    total_amount: 800,
    subtotal: 800,
    minCommissionableAmount: MIN,
  });
  assert.strictEqual(r.amount, 75);
  assert.strictEqual(r.breakdown.lines[0].source, 'staff_override');
});

check('service override ignored when bill ≤ 500', () => {
  const r = computeCommissionDetails({
    staff: pctStaff,
    allowServiceOverrides: true,
    serviceIds: [1],
    servicePrices: { 1: 400 },
    serviceCommissions: { 1: { commission_type: 'percentage', commission_value: 50 } },
    total_amount: 400,
    subtotal: 400,
    minCommissionableAmount: MIN,
  });
  assert.strictEqual(r.amount, 0);
});

// ── Helpers cascade from main ───────────────────────────────────────────────
check('helpers get 0 when main gross is 0 (bill ≤ 500)', () => {
  const main = bill(pctStaff, 500);
  const split = computeHelperCommissionSplit(main.amount, [
    { staff_id: 9, commission_type: 'percentage_of_main', commission_value: 20 },
  ]);
  assert.strictEqual(main.amount, 0);
  assert.strictEqual(split.helpersTotal, 0);
  assert.strictEqual(split.mainNet, 0);
});

check('helpers split from main when bill > 500', () => {
  const main = bill(pctStaff, 1000); // 100
  const split = computeHelperCommissionSplit(main.amount, [
    { staff_id: 9, commission_type: 'percentage_of_main', commission_value: 20 },
  ]);
  assert.strictEqual(split.grossMain, 100);
  assert.strictEqual(split.helpersTotal, 20);
  assert.strictEqual(split.mainNet, 80);
});

check('helper fixed from main when bill > 500', () => {
  const main = bill(pctStaff, 1000);
  const split = computeHelperCommissionSplit(main.amount, [
    { staff_id: 9, commission_type: 'fixed', commission_value: 30 },
  ]);
  assert.strictEqual(split.helpersTotal, 30);
  assert.strictEqual(split.mainNet, 70);
});

// ── Feature flag helper ─────────────────────────────────────────────────────
check('getMinCommissionableAmount respects feature flag', () => {
  assert.strictEqual(COMMISSION_MIN_AMOUNT, 500);
  assert.strictEqual(
    getMinCommissionableAmount({ enabled_features: { skip_commission_under_500: true } }),
    500,
  );
  // Without admin flags, plan defaults have feature off
  assert.strictEqual(getMinCommissionableAmount({ plan: 'pro', enabled_features: null }), 0);
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(1);
