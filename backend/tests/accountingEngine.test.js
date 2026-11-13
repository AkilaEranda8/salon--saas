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

const { buildCommissionPayoutLines } = require('../services/accountingEngine/adapters/payroll');

check('payout lines: cash only', () => {
  const lines = buildCommissionPayoutLines({
    payrollAccountId: 1,
    cashAccountId: 2,
    cashAmount: 4000,
    advanceCleared: 0,
  });
  assertBalanced(lines);
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(lines[0].debit, 4000);
  assert.strictEqual(lines[1].credit, 4000);
});

check('payout lines: cash + advance recovery (salary/commission net)', () => {
  const lines = buildCommissionPayoutLines({
    payrollAccountId: 1,
    cashAccountId: 2,
    advanceAccountId: 3,
    cashAmount: 4000,
    advanceCleared: 1000,
  });
  assertBalanced(lines);
  assert.strictEqual(lines.length, 3);
  assert.strictEqual(lines[0].debit, 5000);
  assert.strictEqual(lines[1].credit, 1000);
  assert.strictEqual(lines[2].credit, 4000);
});

const { buildReverseLines, LEDGER_JOURNAL_STATUSES } = require('../services/accountingEngine/balance');
const { buildTenderDebitLines } = require('../services/accountingEngine/adapters/payment');

/** Net signed (debit - credit) per account across journals that count toward the ledger. */
function netByAccount(journals) {
  const net = {};
  for (const j of journals) {
    if (!LEDGER_JOURNAL_STATUSES.includes(j.status)) continue;
    for (const l of j.lines) {
      net[l.account_id] = money((net[l.account_id] || 0) + money(l.debit) - money(l.credit));
    }
  }
  return net;
}

check('void: voided original + posted reversal net to zero in ledger', () => {
  const original = {
    status: 'voided',
    lines: [
      { account_id: 1, debit: 1180, credit: 0 },
      { account_id: 4, debit: 0, credit: 1000 },
      { account_id: 2, debit: 0, credit: 180 },
    ],
  };
  const reversing = { status: 'posted', lines: buildReverseLines(original.lines) };
  assertBalanced(reversing.lines);
  const net = netByAccount([original, reversing]);
  assert.deepStrictEqual(net, { 1: 0, 4: 0, 2: 0 });
});

check('void: excluding voided originals (old behaviour) flips the books', () => {
  const lines = [{ account_id: 1, debit: 100, credit: 0 }, { account_id: 4, debit: 0, credit: 100 }];
  const reversing = { status: 'posted', lines: buildReverseLines(lines) };
  const flipped = {};
  for (const l of reversing.lines) flipped[l.account_id] = money(l.debit - l.credit);
  assert.strictEqual(flipped[1], -100); // what excluding `voided` would have produced
  assert.ok(LEDGER_JOURNAL_STATUSES.includes('voided') && LEDGER_JOURNAL_STATUSES.includes('posted'));
});

check('void + repost: only the new posted journal remains net', () => {
  const lines = [{ account_id: 1, debit: 100, credit: 0 }, { account_id: 4, debit: 0, credit: 100 }];
  const repost = [{ account_id: 1, debit: 150, credit: 0 }, { account_id: 4, debit: 0, credit: 150 }];
  const net = netByAccount([
    { status: 'voided', lines },
    { status: 'posted', lines: buildReverseLines(lines) },
    { status: 'posted', lines: repost },
  ]);
  assert.deepStrictEqual(net, { 1: 150, 4: -150 });
});

check('payment tenders: rounding drift absorbed by last debit line', () => {
  const settings = { default_cash_account_id: 1, default_bank_account_id: 2 };
  // 3 equal tenders scaled to a gross that does not divide evenly
  const gross = 100;
  const rows = [
    { method: 'Cash', amount: 33.33 },
    { method: 'Card', amount: 33.33 },
    { method: 'Card', amount: 33.33 },
  ];
  const lines = buildTenderDebitLines(rows, gross, settings);
  const total = money(lines.reduce((s, l) => s + l.debit, 0));
  assert.strictEqual(total, gross);
  assertBalanced([...lines, { account_id: 4, debit: 0, credit: gross }]);
});

check('payment tenders: unmapped tender falls back to cash account', () => {
  const lines = buildTenderDebitLines(
    [{ method: 'Package', amount: 50 }],
    50,
    { default_cash_account_id: 1 },
  );
  assert.strictEqual(lines.length, 1);
  assert.strictEqual(lines[0].account_id, 1);
  assert.strictEqual(lines[0].debit, 50);
});

console.log(`\n${passed} accounting engine checks passed`);
if (process.exitCode) process.exit(1);
