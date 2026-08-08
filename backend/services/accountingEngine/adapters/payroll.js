'use strict';

const { money } = require('../balance');
const { getSettings } = require('../coa');
const { postFromSource } = require('../posting');
const { hasTenantFeature } = require('../../../utils/tenantFeatures');

/** Build balanced lines for a commission/salary payout (cash + optional advance recovery). */
function buildCommissionPayoutLines({
  payrollAccountId,
  cashAccountId,
  advanceAccountId = null,
  cashAmount,
  advanceCleared = 0,
}) {
  const cash = money(cashAmount);
  const adv = money(advanceCleared);
  if (!(cash > 0) && !(adv > 0)) return null;

  const lines = [
    {
      account_id: payrollAccountId,
      debit: money(cash + adv),
      credit: 0,
      memo: adv > 0 ? 'Payroll (gross)' : 'Payroll',
    },
  ];
  if (adv > 0) {
    if (!advanceAccountId) {
      const err = new Error('Advance account required to clear staff advances in GL');
      err.code = 'MISSING_ADVANCE_ACCOUNT';
      throw err;
    }
    lines.push({
      account_id: advanceAccountId,
      debit: 0,
      credit: adv,
      memo: 'Advance recovery',
    });
  }
  if (cash > 0) {
    lines.push({
      account_id: cashAccountId,
      debit: 0,
      credit: cash,
      memo: 'Cash',
    });
  }
  return lines;
}

async function postCommissionPayoutToGl(
  payout,
  { tenant, userId = null, transaction = null, advanceCleared = 0 } = {},
) {
  if (!tenant || !hasTenantFeature(tenant, 'accounting')) return null;
  const settings = await getSettings(payout.tenant_id, { transaction });
  if (!settings?.auto_post_payroll) return null;

  const cashAmt = money(payout.amount);
  const advAmt = money(advanceCleared);
  if (!(cashAmt > 0) && !(advAmt > 0)) return null;

  const payroll = settings.default_payroll_account_id;
  const cash = settings.default_cash_account_id;
  const advanceAcct = settings.default_advance_account_id || null;
  if (!payroll || !cash) return null;

  const lines = buildCommissionPayoutLines({
    payrollAccountId: payroll,
    cashAccountId: cash,
    advanceAccountId: advanceAcct,
    cashAmount: cashAmt,
    advanceCleared: advAmt,
  });
  if (!lines) return null;

  return postFromSource({
    tenantId: payout.tenant_id,
    sourceType: 'commission_payout',
    sourceId: payout.id,
    date: payout.date,
    memo: advAmt > 0
      ? `Commission/salary payout #${payout.id} (incl. advance recovery ${advAmt})`
      : `Commission/salary payout #${payout.id}`,
    lines,
    userId,
    transaction,
  });
}

async function postStaffAdvanceToGl(advance, { tenant, userId = null, transaction = null } = {}) {
  if (!tenant || !hasTenantFeature(tenant, 'accounting')) return null;
  const settings = await getSettings(advance.tenant_id, { transaction });
  if (!settings?.auto_post_payroll) return null;

  const amt = money(advance.amount);
  if (!(amt > 0)) return null;
  const advanceAcct = settings.default_advance_account_id || settings.default_payroll_account_id;
  const cash = settings.default_cash_account_id;
  if (!advanceAcct || !cash) return null;

  return postFromSource({
    tenantId: advance.tenant_id,
    sourceType: 'staff_advance',
    sourceId: advance.id,
    date: advance.date,
    memo: `Staff advance #${advance.id}`,
    lines: [
      { account_id: advanceAcct, debit: amt, credit: 0, memo: 'Staff advance receivable' },
      { account_id: cash, debit: 0, credit: amt, memo: 'Cash' },
    ],
    userId,
    transaction,
  });
}

/** Clear advance receivable against payroll when marked deducted outside a payout. */
async function postAdvanceRecoveryToGl(advance, { tenant, userId = null, transaction = null } = {}) {
  if (!tenant || !hasTenantFeature(tenant, 'accounting')) return null;
  const settings = await getSettings(advance.tenant_id, { transaction });
  if (!settings?.auto_post_payroll) return null;

  const amt = money(advance.amount);
  if (!(amt > 0)) return null;
  const advanceAcct = settings.default_advance_account_id;
  const payroll = settings.default_payroll_account_id;
  if (!advanceAcct || !payroll) return null;

  return postFromSource({
    tenantId: advance.tenant_id,
    sourceType: 'staff_advance_recovery',
    sourceId: advance.id,
    date: advance.date,
    memo: `Advance recovery #${advance.id}`,
    lines: [
      { account_id: payroll, debit: amt, credit: 0, memo: 'Payroll (advance recovery)' },
      { account_id: advanceAcct, debit: 0, credit: amt, memo: 'Advance cleared' },
    ],
    userId,
    transaction,
  });
}

module.exports = {
  buildCommissionPayoutLines,
  postCommissionPayoutToGl,
  postStaffAdvanceToGl,
  postAdvanceRecoveryToGl,
};
