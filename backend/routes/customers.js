const { Router } = require('express');
const ctrl = require('../controllers/customerController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');

const router = Router();
router.use(verifyToken, branchAccess);

router.get('/',                    ctrl.list);
router.post('/qr/resolve',         ctrl.qrResolve);
router.post('/qr/checkin',         ctrl.qrCheckin);
router.get('/:id/checkin-qr',      ctrl.issueCheckinQr);
router.get('/:id',                 ctrl.getOne);
router.post('/',                   ctrl.create);
router.put('/:id',                 ctrl.update);
router.delete('/:id',              requireRole('superadmin', 'admin', 'manager'), ctrl.remove);
router.patch('/:id/loyalty',       ctrl.loyalty);

module.exports = router;
