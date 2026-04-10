const { Router } = require('express');
const ctrl = require('../controllers/staffController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');
const { checkLimit } = require('../middleware/planLimits');

const router = Router();
router.use(verifyToken, branchAccess);

router.get('/',                         ctrl.list);
router.get('/commission',               ctrl.commissionSummary);
router.get('/:id',                      ctrl.getOne);
router.post('/',                        requireRole('superadmin', 'admin', 'manager'), checkLimit('staff'), ctrl.create);
router.put('/:id',                      requireRole('superadmin', 'admin', 'manager'), ctrl.update);
router.delete('/:id',                   requireRole('superadmin', 'admin'), ctrl.remove);
router.get('/:id/commission',           ctrl.commissionReport);
router.post('/:id/specializations',     requireRole('superadmin', 'admin', 'manager'), ctrl.setSpecializations);

module.exports = router;
