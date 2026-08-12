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
  console.log('[migration] accounting schema ready');
}

module.exports = ensureAccountingSchema;
