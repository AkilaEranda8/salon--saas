'use strict';

const { money } = require('../balance');
const { getSettings } = require('../coa');
const { postFromSource } = require('../posting');
const { hasTenantFeature } = require('../../../utils/tenantFeatures');

async function postCommissionPayoutToGl(payout, { tenant, userId = null, transaction = null } = {}) {
  if (!tenant || !hasTenantFeature(tenant, 'accounting')) return null;
  const settings = await getSettings(payout.tenant_id, { transaction });
  if (!settings?.auto_post_payroll) return null;

  const amt = money(payout.amount);
  if (!(amt > 0)) return null;
  const payroll = settings.default_payroll_account_id;
  const cash = settings.default_cash_account_id;
  if (!payroll || !cash) return null;

  return postFromSource({
    tenantId: payout.tenant_id,
    sourceType: 'commission_payout',
    sourceId: payout.id,
    date: payout.date,
    memo: `Commission payout #${payout.id}`,
    lines: [
      { account_id: payroll, debit: amt, credit: 0, memo: 'Payroll' },
      { account_id: cash, debit: 0, credit: amt, memo: 'Cash' },
    ],
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
  const payroll = settings.default_payroll_account_id;
  const cash = settings.default_cash_account_id;
  if (!payroll || !cash) return null;

  return postFromSource({
    tenantId: advance.tenant_id,
    sourceType: 'staff_advance',
    sourceId: advance.id,
    date: advance.date,
    memo: `Staff advance #${advance.id}`,
    lines: [
      { account_id: payroll, debit: amt, credit: 0, memo: 'Advance' },
      { account_id: cash, debit: 0, credit: amt, memo: 'Cash' },
    ],
    userId,
    transaction,
  });
}

module.exports = { postCommissionPayoutToGl, postStaffAdvanceToGl };
