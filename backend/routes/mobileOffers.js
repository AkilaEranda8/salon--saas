const { Router } = require('express');
const ctrl = require('../controllers/mobileOffersController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');

const router = Router();
router.use(verifyToken, branchAccess);

router.get('/', requireRole('superadmin', 'admin', 'manager'), ctrl.list);
router.get('/:id', requireRole('superadmin', 'admin', 'manager'), ctrl.getOne);
router.post('/', requireRole('superadmin', 'admin', 'manager'), ctrl.create);
router.patch('/:id', requireRole('superadmin', 'admin', 'manager'), ctrl.update);
router.put('/:id', requireRole('superadmin', 'admin', 'manager'), ctrl.update);
router.delete('/:id', requireRole('superadmin', 'admin', 'manager'), ctrl.remove);

module.exports = router;
