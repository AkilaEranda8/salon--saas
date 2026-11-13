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
const packageAdapter = require('./adapters/package');
const inventoryAdapter = require('./adapters/inventory');
const { resolveAccountingTenant } = require('./resolveTenant');
const warning = require('./warning');

module.exports = {
  ...balance,
  ...vat,
  ...audit,
  ...coa,
  ...periods,
  ...journal,
  ...posting,
  ...reports,
  ...warning,
  resolveAccountingTenant,
  postPaymentToGl: paymentAdapter.postPaymentToGl,
  voidPaymentGl: paymentAdapter.voidPaymentGl,
  repostPaymentToGl: paymentAdapter.repostPaymentToGl,
  postExpenseToGl: expenseAdapter.postExpenseToGl,
  voidExpenseGl: expenseAdapter.voidExpenseGl,
  repostExpenseToGl: expenseAdapter.repostExpenseToGl,
  postCommissionPayoutToGl: payrollAdapter.postCommissionPayoutToGl,
  postStaffAdvanceToGl: payrollAdapter.postStaffAdvanceToGl,
  postAdvanceRecoveryToGl: payrollAdapter.postAdvanceRecoveryToGl,
  buildCommissionPayoutLines: payrollAdapter.buildCommissionPayoutLines,
  postPackagePurchaseToGl: packageAdapter.postPackagePurchaseToGl,
  postPackageSaleToGl: packageAdapter.postPackageSaleToGl,
  voidPackageSaleGl: packageAdapter.voidPackageSaleGl,
  postGoodsReceiptToGl: inventoryAdapter.postGoodsReceiptToGl,
  postConsumptionToGl: inventoryAdapter.postConsumptionToGl,
};
