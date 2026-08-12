'use strict';

const assert = require('assert');
const { normalizeWallClockTime } = require('../utils/dateUtils');

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

check('string TIME stays wall-clock', () => {
  assert.strictEqual(normalizeWallClockTime('16:00:00'), '16:00');
  assert.strictEqual(normalizeWallClockTime('09:30'), '09:30');
});

check('Date TIME (UTC clock) does not get +05:30 shift', () => {
  const d = new Date(Date.UTC(1970, 0, 1, 16, 0, 0));
  assert.strictEqual(normalizeWallClockTime(d), '16:00');
});

check('ISO instant shifts to Asia/Colombo', () => {
  // 10:30 UTC = 16:00 Colombo
  assert.strictEqual(normalizeWallClockTime('2026-08-12T10:30:00.000Z'), '16:00');
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(1);
