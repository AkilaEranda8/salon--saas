const { Router } = require('express');
const ctrl = require('../controllers/reportController');
const franchiseCtrl = require('../controllers/commissionReportController');
const { verifyToken } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');

const router = Router();
router.use(verifyToken, branchAccess);

router.get('/revenue',      ctrl.revenue);
router.get('/services',     ctrl.services);
router.get('/staff',        ctrl.staffReport);
router.get('/appointments', ctrl.appointmentStats);
router.get('/dashboard',    ctrl.dashboard);
router.get('/export',       ctrl.exportExcel);

router.get('/franchise/manager-daily-range', franchiseCtrl.managerDailyByDay);
router.get('/franchise/manager-daily',      franchiseCtrl.dailyManagerCommission);
router.get('/franchise/manager-monthly',    franchiseCtrl.monthlyManagerCommission);
router.get('/franchise/branch-summary',     franchiseCtrl.branchCommissionSummary);
router.get('/franchise/staff-contribution', franchiseCtrl.staffContributionReport);

module.exports = router;
