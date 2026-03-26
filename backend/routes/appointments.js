const { Router } = require('express');
const ctrl = require('../controllers/appointmentController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');

const router = Router();
router.use(verifyToken, branchAccess);

router.get('/calendar',       ctrl.calendar);
router.get('/recurring',      ctrl.listRecurring);
router.get('/',               ctrl.list);
router.get('/:id',            ctrl.getOne);
router.post('/',              requireRole('superadmin', 'admin', 'manager', 'staff'), ctrl.create);
router.put('/:id',            requireRole('superadmin', 'admin', 'manager', 'staff'), ctrl.update);
router.patch('/:id/status',   requireRole('superadmin', 'admin', 'manager', 'staff'), ctrl.changeStatus);
router.patch('/:id/stop-recurring', ctrl.stopRecurring);
router.delete('/:id',         requireRole('superadmin', 'admin', 'manager'), ctrl.remove);

module.exports = router;
