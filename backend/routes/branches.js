const { Router } = require('express');
const ctrl = require('../controllers/branchController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { checkLimit } = require('../middleware/planLimits');

const router = Router();
router.use(verifyToken);

router.get('/',            requireRole('superadmin', 'admin', 'manager', 'staff'), ctrl.list);
router.get('/:id',         requireRole('superadmin', 'admin', 'manager', 'staff'), ctrl.getOne);
router.post('/',           requireRole('superadmin', 'admin'), checkLimit('branch'), ctrl.create);
router.put('/:id',         requireRole('superadmin', 'admin'), ctrl.update);
router.delete('/:id',      requireRole('superadmin', 'admin'), ctrl.remove);
router.patch('/:id/status', requireRole('superadmin', 'admin'), ctrl.toggleStatus);

module.exports = router;
