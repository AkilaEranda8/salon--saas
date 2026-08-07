'use strict';

const { money } = require('../balance');
const { splitInclusiveVat } = require('../vat');
const { getSettings } = require('../coa');
const { postFromSource } = require('../posting');
const { hasTenantFeature } = require('../../../utils/tenantFeatures');

async function postExpenseToGl(expense, { tenant, userId = null, transaction = null } = {}) {
  if (!tenant || !hasTenantFeature(tenant, 'accounting')) return null;
  const settings = await getSettings(expense.tenant_id, { transaction });
  if (!settings?.auto_post_expenses) return null;

  const gross = money(expense.amount);
  if (!(gross > 0)) return null;

  const expenseAcct = settings.default_expense_account_id;
  const method = String(expense.payment_method || 'cash').toLowerCase();
  const creditAcct = method.includes('bank') || method.includes('card') || method.includes('cheque')
    ? (settings.default_bank_account_id || settings.default_cash_account_id)
    : settings.default_cash_account_id;

  if (!expenseAcct || !creditAcct) return null;

  let expenseAmt = gross;
  let vat = 0;
  const lines = [];
  if (settings.vat_enabled && settings.input_vat_account_id) {
    const split = splitInclusiveVat(gross, settings.vat_rate);
    expenseAmt = split.net;
    vat = split.vat;
  }

  lines.push({ account_id: expenseAcct, debit: expenseAmt, credit: 0, memo: expense.title || 'Expense' });
  if (vat > 0) {
    lines.push({
      account_id: settings.input_vat_account_id,
      debit: vat,
      credit: 0,
      memo: 'VAT input',
    });
  }
  lines.push({ account_id: creditAcct, debit: 0, credit: gross, memo: expense.payment_method || 'Cash' });

  return postFromSource({
    tenantId: expense.tenant_id,
    sourceType: 'expense',
    sourceId: expense.id,
    date: expense.date,
    memo: `Expense #${expense.id}: ${expense.title || ''}`,
    lines,
    userId,
    transaction,
  });
}

module.exports = { postExpenseToGl };
