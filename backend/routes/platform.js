const express = require('express');
const router  = express.Router();
const { verifyToken }    = require('../middleware/auth');
const { platformAdmin }  = require('../middleware/platformAdmin');
const ctrl               = require('../controllers/platformController');

// All platform routes require platform_admin role
router.use(verifyToken, platformAdmin);

router.get('/tenants',          ctrl.listTenants);
router.get('/tenants/:id',      ctrl.getTenant);
router.patch('/tenants/:id',    ctrl.updateTenant);
router.delete('/tenants/:id',   ctrl.deleteTenant);
router.get('/tenants/:id/stats', ctrl.tenantStats);
router.get('/stats',            ctrl.platformStats);

module.exports = router;
