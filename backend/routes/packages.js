'use strict';
const { Router }      = require('express');
const ctrl            = require('../controllers/packageController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess }    = require('../middleware/branchAccess');
const { featureGate } = require('../middleware/featureGate');

const router = Router();
router.use(verifyToken, branchAccess, featureGate('packages'));

// Customer packages (must be before /:id to avoid ambiguity)
router.get('/customer-packages',           ctrl.listAllCustomerPackages);
router.get('/customer/:customerId',        ctrl.customerPackages);
router.get('/customer/:customerId/active', ctrl.activePackages);
router.post('/purchase', ctrl.purchase);
router.post('/purchase-all', requireRole('superadmin', 'admin', 'manager'), ctrl.purchaseForAllCustomers);
router.post('/redeem',   ctrl.redeem);

// Package templates (admin+ for CUD, all roles can list)
router.get('/',      ctrl.list);
router.get('/:id',   ctrl.getOne);
router.post('/',     requireRole('superadmin', 'admin'), ctrl.create);
router.put('/:id',   requireRole('superadmin', 'admin'), ctrl.update);
router.delete('/:id', requireRole('superadmin', 'admin'), ctrl.remove);

module.exports = router;
