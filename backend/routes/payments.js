const { Router } = require('express');
const ctrl = require('../controllers/paymentController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');

const router = Router();
router.use(verifyToken, branchAccess);

router.get('/summary', ctrl.summary);
router.get('/',        ctrl.list);
router.get('/:id',     ctrl.getOne);
router.put('/:id',     requireRole('superadmin', 'admin', 'manager', 'staff'), ctrl.update);
router.post('/',       requireRole('superadmin', 'admin', 'manager', 'staff'), ctrl.create);

module.exports = router;
