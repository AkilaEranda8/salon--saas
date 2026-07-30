'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/salonInventoryOpsController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');
const { featureGate } = require('../middleware/featureGate');

const router = Router();
router.use(verifyToken, branchAccess, featureGate('inventory'));

const MGR = requireRole('superadmin', 'admin', 'manager');

// Dashboard
router.get('/dashboard', ctrl.dashboard);

// Categories
router.get('/categories', ctrl.listCategories);
router.post('/categories', MGR, ctrl.createCategory);
router.put('/categories/:id', MGR, ctrl.updateCategory);
router.delete('/categories/:id', MGR, ctrl.deleteCategory);

// Suppliers
router.get('/suppliers', ctrl.listSuppliers);
router.post('/suppliers', MGR, ctrl.createSupplier);
router.put('/suppliers/:id', MGR, ctrl.updateSupplier);
router.delete('/suppliers/:id', MGR, ctrl.deleteSupplier);

// Products
router.get('/products', ctrl.listProducts);
router.post('/products', MGR, ctrl.createProduct);
router.put('/products/:id', MGR, ctrl.updateProduct);
router.delete('/products/:id', MGR, ctrl.deleteProduct);
router.get('/low-stock', ctrl.lowStock);

// Purchase Orders
router.get('/purchase-orders', ctrl.listPurchaseOrders);
router.post('/purchase-orders', MGR, ctrl.createPurchaseOrder);
router.patch('/purchase-orders/:id', MGR, ctrl.updatePurchaseOrder);

// Goods Received
router.get('/goods-receipts', ctrl.listGoodsReceipts);
router.post('/goods-receipts', MGR, ctrl.createGoodsReceipt);
router.post('/goods-receipts/:id/confirm', MGR, ctrl.confirmGoodsReceipt);

// Stock Consumption
router.get('/consumptions', ctrl.listConsumptions);
router.post('/consumptions', ctrl.createConsumption);
router.put('/consumptions/:id', ctrl.updateConsumption);
router.post('/consumptions/:id/cancel', ctrl.cancelConsumption);

// Day End
router.get('/day-end/preview', MGR, ctrl.dayEndPreview);
router.post('/day-end/draft', MGR, ctrl.dayEndSaveDraft);
router.post('/day-end/confirm', MGR, ctrl.dayEndConfirm);

// Adjustments
router.get('/adjustments', ctrl.listAdjustments);
router.post('/adjustments', MGR, ctrl.createAdjustment);
router.post('/adjustments/:id/approve', MGR, ctrl.approveAdjustment);

// Stock Count
router.get('/stock-counts', ctrl.listStockCounts);
router.post('/stock-counts', MGR, ctrl.createStockCount);
router.put('/stock-counts/:id', MGR, ctrl.updateStockCount);
router.post('/stock-counts/:id/complete', MGR, ctrl.completeStockCount);

// History & Reports & Settings
router.get('/history', ctrl.listHistory);
router.get('/reports', ctrl.reports);
router.get('/settings', ctrl.getInvSettings);
router.put('/settings', MGR, ctrl.updateInvSettings);

module.exports = router;
