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
router.post('/test',    requireRole('superadmin', 'admin'), ctrl.sendTest);

module.exports = router;
