'use strict';

const balance = require('./balance');
const vat = require('./vat');
const audit = require('./audit');
const coa = require('./coa');
const periods = require('./periods');
const journal = require('./journal');
const posting = require('./posting');
const reports = require('./reports');
const paymentAdapter = require('./adapters/payment');
const expenseAdapter = require('./adapters/expense');
const payrollAdapter = require('./adapters/payroll');

module.exports = {
  ...balance,
  ...vat,
  ...audit,
  ...coa,
  ...periods,
  ...journal,
  ...posting,
  ...reports,
  postPaymentToGl: paymentAdapter.postPaymentToGl,
  postExpenseToGl: expenseAdapter.postExpenseToGl,
  postCommissionPayoutToGl: payrollAdapter.postCommissionPayoutToGl,
  postStaffAdvanceToGl: payrollAdapter.postStaffAdvanceToGl,
  postAdvanceRecoveryToGl: payrollAdapter.postAdvanceRecoveryToGl,
  buildCommissionPayoutLines: payrollAdapter.buildCommissionPayoutLines,
};
