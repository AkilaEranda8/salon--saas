'use strict';

const assert = require('assert');
const {
  generateAvailableSlots,
  generateRemainderSlots,
  freeGaps,
} = require('../utils/staffAvailability');

const day = { closed: false, startMin: 9 * 60, endMin: 18 * 60 }; // 09:00–18:00

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

check('299 min booking from 09:00 leaves leftover after 13:59', () => {
  const blocked = [[9 * 60, 9 * 60 + 299]]; // 09:00–13:59
  const gaps = freeGaps(day, blocked);
  assert.strictEqual(gaps.length, 1);
  assert.strictEqual(gaps[0][0], 9 * 60 + 299);
  assert.strictEqual(gaps[0][1], 18 * 60);
  assert.strictEqual(gaps[0][1] - gaps[0][0], 241);
});

check('next 200 min service gets starts after 13:59', () => {
  const blocked = [[9 * 60, 9 * 60 + 299]];
  const slots = generateAvailableSlots({
    dayWindow: day,
    durationMinutes: 200,
    blockedRanges: blocked,
  });
  assert.ok(slots.includes('14:00'), `expected 14:00, got ${slots.slice(0, 5)}`);
  assert.ok(!slots.includes('09:00'));
  assert.ok(!slots.includes('13:45'));
});

check('120 min at 16:00 blocks until 18:00 — no mid-block starts', () => {
  const blocked = [[16 * 60, 16 * 60 + 120]]; // 16:00–18:00
  const slots30 = generateAvailableSlots({
    dayWindow: day,
    durationMinutes: 30,
    blockedRanges: blocked,
  });
  assert.ok(!slots30.includes('16:00'));
  assert.ok(!slots30.includes('16:15'));
  assert.ok(!slots30.includes('16:30'));
  assert.ok(!slots30.includes('17:00'));
  assert.ok(!slots30.includes('17:45'));
  // Day ends 18:00 — no leftover after a block that ends at close
  assert.ok(!slots30.includes('18:00'));
});

check('120 min at 16:00 leaves afternoon free before it', () => {
  const blocked = [[16 * 60, 16 * 60 + 120]];
  const slots30 = generateAvailableSlots({
    dayWindow: day,
    durationMinutes: 30,
    blockedRanges: blocked,
  });
  assert.ok(slots30.includes('09:00'));
  assert.ok(slots30.includes('15:30'));
  assert.ok(!slots30.includes('15:45')); // 15:45+30 = 16:15 overlaps 16:00–18:00
});

check('when leftover is 200 min, remainder starts still appear', () => {
  const blocked = [[9 * 60, 9 * 60 + 299]];
  const remainder = generateRemainderSlots({
    dayWindow: day,
    blockedRanges: blocked,
  });
  assert.ok(remainder.includes('14:00'));
  assert.ok(remainder.includes('14:15'));
  assert.ok(!remainder.includes('13:45'));
});

check('200 min leftover cannot fit another 299 min — fit empty, remainder separate', () => {
  const blocked = [[9 * 60, 9 * 60 + 340]]; // leave 200 min (1080-880=200)
  const fit = generateAvailableSlots({
    dayWindow: day,
    durationMinutes: 299,
    blockedRanges: blocked,
  });
  const remainder = generateRemainderSlots({
    dayWindow: day,
    blockedRanges: blocked,
  });
  assert.strictEqual(fit.length, 0);
  assert.ok(remainder.length > 0);
  assert.ok(remainder[0] >= '14:00' || remainder.includes('14:40') || remainder.length > 0);
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(1);
