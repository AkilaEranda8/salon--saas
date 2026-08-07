'use strict';

const router = require('express').Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { featureGate } = require('../middleware/featureGate');
const ctrl = require('../controllers/accountingController');

const mgr = [verifyToken, requireRole('superadmin', 'admin', 'manager'), featureGate('accounting')];
const adm = [verifyToken, requireRole('superadmin', 'admin'), featureGate('accounting')];

router.get('/overview', ...mgr, ctrl.overview);

router.get('/accounts', ...mgr, ctrl.listAccounts);
router.post('/accounts', ...adm, ctrl.createAccount);
router.patch('/accounts/:id', ...adm, ctrl.updateAccount);

router.get('/journals', ...mgr, ctrl.listJournals);
router.get('/journals/:id', ...mgr, ctrl.getJournal);
router.post('/journals', ...mgr, ctrl.createJournal);
router.post('/journals/:id/void', ...mgr, ctrl.voidJournalCtrl);

router.get('/reports/trial-balance', ...mgr, ctrl.trialBalance);
router.get('/reports/profit-loss', ...mgr, ctrl.profitAndLoss);
router.get('/reports/balance-sheet', ...mgr, ctrl.balanceSheet);
router.get('/reports/general-ledger', ...mgr, ctrl.generalLedger);

router.get('/tax', ...mgr, ctrl.getTax);
router.put('/tax', ...mgr, ctrl.updateTax);
router.get('/tax/summary', ...mgr, ctrl.taxSummary);

router.get('/settings', ...mgr, ctrl.getSettings);
router.put('/settings', ...adm, ctrl.updateSettings);

router.get('/periods', ...mgr, ctrl.listPeriods);
router.post('/periods/:id/close', ...adm, ctrl.closePeriod);
router.post('/periods/:id/reopen', ...adm, ctrl.reopenPeriod);

router.get('/bank-accounts', ...mgr, ctrl.listBankAccounts);
router.post('/bank-accounts', ...mgr, ctrl.createBankAccount);
router.get('/bank-txns', ...mgr, ctrl.listBankTxns);
router.post('/bank-txns', ...mgr, ctrl.createBankTxn);

router.get('/petty-cash', ...mgr, ctrl.listPetty);
router.post('/petty-cash', ...mgr, ctrl.createPetty);

router.get('/ar', ...mgr, ctrl.listAr);
router.post('/ar', ...mgr, ctrl.createAr);
router.post('/ar/:id/settle', ...mgr, ctrl.settleAr);
router.get('/ap', ...mgr, ctrl.listAp);
router.post('/ap', ...mgr, ctrl.createAp);
router.post('/ap/:id/settle', ...mgr, ctrl.settleAp);

router.get('/payroll-summary', ...mgr, ctrl.payrollSummary);
router.get('/audit', ...adm, ctrl.listAudit);

module.exports = router;
