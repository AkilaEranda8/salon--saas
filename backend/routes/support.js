const { Router } = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/supportController');

const router = Router();

router.use(verifyToken);

router.get('/', requireRole('platform_admin', 'superadmin', 'admin', 'manager', 'staff'), ctrl.list);
router.post('/', requireRole('platform_admin', 'superadmin', 'admin', 'manager', 'staff'), ctrl.create);

router.post('/ai-classify', requireRole('platform_admin', 'superadmin', 'admin', 'manager', 'staff'), ctrl.aiClassify);

router.patch('/:id', requireRole('platform_admin', 'superadmin', 'admin', 'manager', 'staff'), ctrl.update);
router.post('/:id/replies', requireRole('platform_admin', 'superadmin', 'admin', 'manager', 'staff'), ctrl.createReply);
router.post('/:id/ai-suggest', requireRole('platform_admin', 'superadmin', 'admin', 'manager', 'staff'), ctrl.aiSuggest);
router.delete('/:id', requireRole('platform_admin'), ctrl.remove);

module.exports = router;
