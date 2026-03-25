const { Router } = require('express');
const ctrl = require('../controllers/serviceController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = Router();
router.use(verifyToken);

router.get('/categories', ctrl.categories);
// Category mutations MUST come before /:id to avoid Express matching 'categories' as an id
router.put('/categories/rename', requireRole('superadmin', 'admin'), ctrl.renameCategory);
router.post('/categories/delete', requireRole('superadmin', 'admin'), ctrl.deleteCategory);
router.get('/',       ctrl.list);
router.get('/:id',    ctrl.getOne);
router.post('/',      requireRole('superadmin', 'admin'), ctrl.create);
router.put('/:id',    requireRole('superadmin', 'admin'), ctrl.update);
router.delete('/:id', requireRole('superadmin', 'admin'), ctrl.remove);

module.exports = router;
