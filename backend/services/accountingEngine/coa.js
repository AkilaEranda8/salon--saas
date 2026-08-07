'use strict';

const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Cash', type: 'asset' },
  { code: '1010', name: 'Bank', type: 'asset' },
  { code: '1100', name: 'Accounts Receivable', type: 'asset' },
  { code: '1200', name: 'Petty Cash', type: 'asset' },
  { code: '2000', name: 'Accounts Payable', type: 'liability' },
  { code: '2100', name: 'VAT Output', type: 'liability' },
  { code: '2200', name: 'VAT Input', type: 'asset' },
  { code: '3000', name: 'Owner Equity', type: 'equity' },
  { code: '4000', name: 'Service Revenue', type: 'revenue' },
  { code: '5000', name: 'Operating Expense', type: 'expense' },
  { code: '5100', name: 'Payroll Expense', type: 'expense' },
];

const CODE_TO_SETTING = {
  '1000': 'default_cash_account_id',
  '1010': 'default_bank_account_id',
  '1100': 'default_ar_account_id',
  '1200': 'default_petty_account_id',
  '2000': 'default_ap_account_id',
  '2100': 'output_vat_account_id',
  '2200': 'input_vat_account_id',
  '4000': 'default_revenue_account_id',
  '5000': 'default_expense_account_id',
  '5100': 'default_payroll_account_id',
};

async function ensureTenantBooks(tenantId, { transaction } = {}) {
  const {
    AcctAccount,
    AcctTaxSetting,
    AcctPeriod,
    AcctBankAccount,
  } = require('../../models');

  const tid = Number(tenantId);
  if (!tid) {
    const err = new Error('tenantId required');
    err.status = 400;
    throw err;
  }

  const existing = await AcctAccount.count({ where: { tenant_id: tid }, transaction });
  if (!existing) {
    for (const row of DEFAULT_ACCOUNTS) {
      await AcctAccount.create({
        tenant_id: tid,
        code: row.code,
        name: row.name,
        type: row.type,
        is_system: true,
        is_active: true,
      }, { transaction });
    }
  }

  const accounts = await AcctAccount.findAll({
    where: { tenant_id: tid },
    transaction,
  });
  const byCode = Object.fromEntries(accounts.map((a) => [a.code, a]));

  let settings = await AcctTaxSetting.findOne({ where: { tenant_id: tid }, transaction });
  if (!settings) {
    const patch = {
      tenant_id: tid,
      vat_enabled: false,
      vat_rate: 18,
      auto_post_payments: true,
      auto_post_expenses: true,
      auto_post_payroll: true,
    };
    for (const [code, field] of Object.entries(CODE_TO_SETTING)) {
      if (byCode[code]) patch[field] = byCode[code].id;
    }
    settings = await AcctTaxSetting.create(patch, { transaction });
  } else {
    const patch = {};
    for (const [code, field] of Object.entries(CODE_TO_SETTING)) {
      if (!settings[field] && byCode[code]) patch[field] = byCode[code].id;
    }
    if (Object.keys(patch).length) {
      await settings.update(patch, { transaction });
    }
  }

  const now = new Date();
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let period = await AcctPeriod.findOne({
    where: { tenant_id: tid, period_key: periodKey },
    transaction,
  });
  if (!period) {
    period = await AcctPeriod.create({
      tenant_id: tid,
      period_key: periodKey,
      status: 'open',
    }, { transaction });
  }

  const cashCount = await AcctBankAccount.count({ where: { tenant_id: tid }, transaction });
  if (!cashCount && byCode['1000'] && byCode['1010']) {
    await AcctBankAccount.bulkCreate([
      {
        tenant_id: tid,
        name: 'Cash Drawer',
        gl_account_id: byCode['1000'].id,
        is_cash: true,
        is_active: true,
        opening_balance: 0,
      },
      {
        tenant_id: tid,
        name: 'Main Bank',
        gl_account_id: byCode['1010'].id,
        is_cash: false,
        is_active: true,
        opening_balance: 0,
      },
    ], { transaction });
  }

  return { settings, accounts, period };
}

async function getSettings(tenantId, { transaction } = {}) {
  await ensureTenantBooks(tenantId, { transaction });
  const { AcctTaxSetting } = require('../../models');
  return AcctTaxSetting.findOne({ where: { tenant_id: Number(tenantId) }, transaction });
}

async function getAccountByCode(tenantId, code, { transaction } = {}) {
  const { AcctAccount } = require('../../models');
  return AcctAccount.findOne({
    where: { tenant_id: Number(tenantId), code: String(code) },
    transaction,
  });
}

module.exports = {
  DEFAULT_ACCOUNTS,
  ensureTenantBooks,
  getSettings,
  getAccountByCode,
};
