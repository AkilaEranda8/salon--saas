const { Router } = require('express');
const ctrl = require('../controllers/commissionPayoutController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');

const router = Router();
router.use(verifyToken, branchAccess);

router.get('/',        ctrl.list);
router.post('/',       requireRole('superadmin', 'admin', 'manager'), ctrl.create);
router.delete('/:id',  requireRole('superadmin', 'admin'), ctrl.remove);

module.exports = router;
