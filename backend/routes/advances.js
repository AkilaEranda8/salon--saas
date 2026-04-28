const { Router } = require('express');
const ctrl = require('../controllers/advanceController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');

const router = Router();
router.use(verifyToken, branchAccess);

router.get('/',              ctrl.list);
router.post('/',             requireRole('superadmin', 'admin', 'manager'), ctrl.create);
router.patch('/:id/deduct',  requireRole('superadmin', 'admin'), ctrl.markDeducted);
router.delete('/:id',        requireRole('superadmin', 'admin'), ctrl.remove);

module.exports = router;
