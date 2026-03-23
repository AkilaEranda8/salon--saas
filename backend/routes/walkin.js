const { Router } = require('express');
const ctrl = require('../controllers/walkinController');
const { verifyToken } = require('../middleware/auth');

const router = Router();

// All walkin routes require authentication
router.use(verifyToken);

router.get('/',              ctrl.list);
router.get('/stats',         ctrl.stats);
router.post('/checkin',      ctrl.checkin);
router.put('/:id',           ctrl.update);
router.patch('/:id/status',  ctrl.updateStatus);
router.patch('/:id/assign',  ctrl.assign);
router.delete('/:id',        ctrl.remove);

module.exports = router;
