const { Router } = require('express');
const ctrl = require('../controllers/serviceController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { checkLimit } = require('../middleware/planLimits');

const router = Router();
router.use(verifyToken);

router.get('/categories', ctrl.categories);
// Category mutations MUST come before /:id to avoid Express matching 'categories' as an id
router.put('/categories/rename', requireRole('superadmin', 'admin', 'manager'), ctrl.renameCategory);
router.post('/categories/delete', requireRole('superadmin', 'admin', 'manager'), ctrl.deleteCategory);
router.get('/',       ctrl.list);
router.get('/:id',    ctrl.getOne);
router.post('/',      requireRole('superadmin', 'admin', 'manager'), checkLimit('service'), ctrl.create);
router.put('/:id',    requireRole('superadmin', 'admin', 'manager'), ctrl.update);
router.delete('/:id', requireRole('superadmin', 'admin', 'manager'), ctrl.remove);

module.exports = router;
