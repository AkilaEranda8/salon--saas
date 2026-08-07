'use strict';

function money(n) {
  const v = Math.round((parseFloat(n) || 0) * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function assertBalanced(lines = []) {
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    const d = money(line.debit);
    const c = money(line.credit);
    if (d < 0 || c < 0) {
      const err = new Error('Debit and credit must be non-negative.');
      err.status = 400;
      throw err;
    }
    if (d > 0 && c > 0) {
      const err = new Error('A journal line cannot have both debit and credit.');
      err.status = 400;
      throw err;
    }
    if (d === 0 && c === 0) {
      const err = new Error('A journal line must have a debit or credit amount.');
      err.status = 400;
      throw err;
    }
    debit = money(debit + d);
    credit = money(credit + c);
  }
  if (debit !== credit) {
    const err = new Error(`Journal is unbalanced (debit ${debit.toFixed(2)} vs credit ${credit.toFixed(2)}).`);
    err.status = 400;
    err.code = 'UNBALANCED_JOURNAL';
    throw err;
  }
  if (debit === 0) {
    const err = new Error('Journal must have non-zero amounts.');
    err.status = 400;
    throw err;
  }
  return { debit, credit };
}

module.exports = { money, assertBalanced };
