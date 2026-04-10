const { Router } = require('express');
const ctrl = require('../controllers/notificationController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');

const router = Router();
router.use(verifyToken, branchAccess);

// Log — all authenticated users (filtered by branch for non-admins via branchAccess)
router.get('/log',      ctrl.getLogs);

// Settings + test — admin/superadmin only
router.get('/settings', requireRole('superadmin', 'admin'), ctrl.getSettings);
router.put('/settings', requireRole('superadmin', 'admin'), ctrl.updateSettings);
router.post('/test',                    requireRole('superadmin', 'admin'), ctrl.sendTest);
router.post('/test-provider',           requireRole('superadmin', 'admin'), ctrl.testProvider);
router.post('/offer-sms',               requireRole('superadmin', 'admin', 'manager'), ctrl.sendOfferSms);
router.post('/staff-monthly-earnings',  requireRole('superadmin', 'admin'), ctrl.sendStaffMonthlyEarnings);
router.post('/test-staff-earnings-pdf', requireRole('superadmin', 'admin'), ctrl.testStaffEarningsPdf);

// Message templates
router.get('/templates',        requireRole('superadmin', 'admin'), ctrl.listTemplates);
router.post('/templates',       requireRole('superadmin', 'admin'), ctrl.saveTemplate);
router.delete('/templates/:id', requireRole('superadmin', 'admin'), ctrl.deleteTemplate);

module.exports = router;
