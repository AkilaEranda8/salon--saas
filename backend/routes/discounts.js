const { Router } = require('express');
const ctrl = require('../controllers/discountController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');

const router = Router();
router.use(verifyToken, branchAccess);

router.get('/payment', ctrl.listForPayment);
router.get('/preview/:id', ctrl.preview);
router.get('/', requireRole('superadmin', 'admin', 'manager', 'staff'), ctrl.list);
router.get('/:id', requireRole('superadmin', 'admin', 'manager', 'staff'), ctrl.getOne);
router.post('/', requireRole('superadmin', 'admin', 'manager'), ctrl.create);
router.put('/:id', requireRole('superadmin', 'admin', 'manager'), ctrl.update);
router.delete('/:id', requireRole('superadmin', 'admin', 'manager'), ctrl.remove);

module.exports = router;
