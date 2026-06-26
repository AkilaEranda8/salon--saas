const { Router } = require('express');
const ctrl = require('../controllers/reminderController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');

const router = Router();
router.use(verifyToken, branchAccess);

router.get('/',               ctrl.list);
router.post('/',              ctrl.create);
router.put('/:id',            ctrl.update);
router.patch('/:id/toggle',   ctrl.toggle);
router.post('/:id/notify',   ctrl.notifyStaff);
router.delete('/:id',         requireRole('superadmin', 'admin', 'manager'), ctrl.remove);

module.exports = router;
