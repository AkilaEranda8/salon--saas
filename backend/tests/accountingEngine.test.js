'use strict';

/**
 * Accounting engine unit tests — run: node tests/accountingEngine.test.js
 */
const assert = require('assert');
const { money, assertBalanced } = require('../services/accountingEngine/balance');
const { splitInclusiveVat, addVat } = require('../services/accountingEngine/vat');
const { periodKeyFromDate } = require('../services/accountingEngine/periods');

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('✓', name);
  } catch (err) {
    console.error('✗', name, err.message);
    process.exitCode = 1;
  }
}

check('money rounds to 2dp', () => {
  assert.strictEqual(money(10.006), 10.01);
  assert.strictEqual(money(10.004), 10);
});

check('assertBalanced accepts equal sides', () => {
  const r = assertBalanced([
    { debit: 100, credit: 0 },
    { debit: 0, credit: 100 },
  ]);
  assert.strictEqual(r.debit, 100);
  assert.strictEqual(r.credit, 100);
});

check('assertBalanced rejects unbalanced', () => {
  let threw = false;
  try {
    assertBalanced([{ debit: 100, credit: 0 }, { debit: 0, credit: 90 }]);
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'UNBALANCED_JOURNAL');
  }
  assert.ok(threw);
});

check('assertBalanced rejects dual debit+credit on one line', () => {
  let threw = false;
  try {
    assertBalanced([{ debit: 50, credit: 50 }]);
  } catch {
    threw = true;
  }
  assert.ok(threw);
});

check('VAT inclusive split 18%', () => {
  const s = splitInclusiveVat(1180, 18);
  assert.strictEqual(s.gross, 1180);
  assert.strictEqual(s.net, 1000);
  assert.strictEqual(s.vat, 180);
});

check('addVat 18%', () => {
  const s = addVat(1000, 18);
  assert.strictEqual(s.gross, 1180);
  assert.strictEqual(s.vat, 180);
});

check('periodKeyFromDate from DATEONLY string', () => {
  assert.strictEqual(periodKeyFromDate('2026-08-07'), '2026-08');
  assert.strictEqual(periodKeyFromDate('2026-12-01'), '2026-12');
});

check('500 bill gate scenario lines balance with VAT', () => {
  const gross = 1180;
  const { net, vat } = splitInclusiveVat(gross, 18);
  assertBalanced([
    { debit: gross, credit: 0 },
    { debit: 0, credit: net },
    { debit: 0, credit: vat },
  ]);
});

console.log(`\n${passed} accounting engine checks passed`);
if (process.exitCode) process.exit(1);
