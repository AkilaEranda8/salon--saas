const { Router } = require('express');
const ctrl = require('../controllers/expenseController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');

const router = Router();
router.use(verifyToken, branchAccess);

// Specific paths before :id to avoid shadowing
router.get('/summary',     ctrl.summary);
router.get('/profit-loss', ctrl.profitLoss);
router.get('/',            ctrl.list);
router.get('/:id',         ctrl.getOne);

router.post('/',    requireRole('superadmin'), ctrl.create);
router.put('/:id',  requireRole('superadmin', 'admin', 'manager'), ctrl.update);
router.delete('/:id', requireRole('superadmin', 'admin'),          ctrl.remove);

module.exports = router;
