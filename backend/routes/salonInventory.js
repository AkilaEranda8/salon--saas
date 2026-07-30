'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/salonInventoryOpsController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');
const { featureGate } = require('../middleware/featureGate');

const router = Router();
router.use(verifyToken, branchAccess, featureGate('inventory'));

const MGR = requireRole('superadmin', 'admin', 'manager');

// Products — opening stock is set here
router.get('/products', ctrl.listProducts);
router.post('/products', MGR, ctrl.createProduct);
router.put('/products/:id', MGR, ctrl.updateProduct);
router.delete('/products/:id', MGR, ctrl.deleteProduct);
router.get('/low-stock', ctrl.lowStock);

// Goods Received — increases stock
router.get('/goods-receipts', ctrl.listGoodsReceipts);
router.post('/goods-receipts', MGR, ctrl.createGoodsReceipt);

// Consumption — recorded during the day, stock untouched until Day End
router.get('/consumptions', ctrl.listConsumptions);
router.post('/consumptions', ctrl.createConsumption);
router.post('/consumptions/:id/cancel', ctrl.cancelConsumption);

// Day End Closing — deducts consumed stock. Any inventory user may run it.
router.get('/day-end/preview', ctrl.dayEndPreview);
router.post('/day-end/confirm', ctrl.dayEndConfirm);

// Stock Adjustments — applied immediately, no approval step
router.get('/adjustments', ctrl.listAdjustments);
router.post('/adjustments', MGR, ctrl.createAdjustment);

// Every stock movement
router.get('/history', ctrl.listHistory);

module.exports = router;
