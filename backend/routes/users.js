const { Router } = require('express');
const ctrl = require('../controllers/userController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = Router();
router.use(verifyToken);

router.get('/mobile-features/catalog', requireRole('superadmin'), ctrl.mobileFeaturesCatalog);
router.get('/:id/mobile-features',       requireRole('superadmin'), ctrl.getMobileFeatures);
router.put('/:id/mobile-features',     requireRole('superadmin'), ctrl.updateMobileFeatures);

router.get('/',             requireRole('superadmin', 'admin'), ctrl.list);
router.post('/',            requireRole('superadmin', 'admin'), ctrl.create);
router.put('/:id',          requireRole('superadmin', 'admin'), ctrl.update);
router.patch('/:id/password', requireRole('superadmin', 'admin'), ctrl.changePassword);
router.delete('/:id',       requireRole('superadmin'),          ctrl.remove);

module.exports = router;
