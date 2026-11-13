'use strict';

const {
  AcctAccount,
  AcctPeriod,
  AcctJournal,
  AcctJournalLine,
  AcctTaxSetting,
  AcctBankAccount,
  AcctBankTxn,
  AcctPettyCashTxn,
  AcctArInvoice,
  AcctApBill,
  AcctAuditLog,
} = require('../models');

async function ensureAccountingSchema() {
  const models = [
    AcctAccount,
    AcctPeriod,
    AcctJournal,
    AcctJournalLine,
    AcctTaxSetting,
    AcctBankAccount,
    AcctBankTxn,
    AcctPettyCashTxn,
    AcctArInvoice,
    AcctApBill,
    AcctAuditLog,
  ];
  for (const model of models) {
    try {
      // Prefer create-if-missing. alter:true can hit MySQL ER_TOO_MANY_KEYS (max 64)
      // when Sequelize re-applies UNIQUE on tables that already have many indexes.
      await model.sync();
    } catch (err) {
      const code = err?.parent?.code || err?.original?.code || err?.code;
      console.warn(
        `[migration] accounting sync skipped for ${model.tableName || model.name}:`,
        code || err.message,
      );
    }
  }
  // model.sync() never adds columns to existing tables — add new setting columns idempotently.
  try {
    const { sequelize } = require('../config/database');
    const { DataTypes } = require('sequelize');
    const qi = sequelize.getQueryInterface();
    const table = AcctTaxSetting.tableName;
    const desc = await qi.describeTable(table);
    for (const col of [
      'default_inventory_account_id',
      'default_cogs_account_id',
      'default_deposit_liability_id',
    ]) {
      if (!desc[col]) {
        await qi.addColumn(table, col, { type: DataTypes.INTEGER, allowNull: true });
        console.log(`[migration] Added ${table}.${col}`);
      }
    }
  } catch (err) {
    console.warn('[migration] acct_tax_settings column check failed:', err.message);
  }
  console.log('[migration] accounting schema ready');
}

module.exports = ensureAccountingSchema;
