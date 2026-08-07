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
    await model.sync({ alter: true });
  }
  console.log('[migration] accounting schema ready');
}

module.exports = ensureAccountingSchema;
