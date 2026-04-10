const { Router } = require('express');
const ctrl = require('../controllers/walkinController');
const { verifyToken } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');

const router = Router();

// All walkin routes require authentication
router.use(verifyToken);
router.use(branchAccess);

router.get('/',              ctrl.list);
router.get('/stats',         ctrl.stats);
router.post('/checkin',      ctrl.checkin);
router.patch('/:id/status',  ctrl.updateStatus);
router.patch('/:id/assign',  ctrl.assign);
router.delete('/:id',        ctrl.remove);

module.exports = router;
