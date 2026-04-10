const express = require('express');
const router  = express.Router();
const { verifyToken }    = require('../middleware/auth');
const { platformAdmin }  = require('../middleware/platformAdmin');
const ctrl               = require('../controllers/platformController');

// All platform routes require platform_admin role
router.use(verifyToken, platformAdmin);

router.get('/tenants',                      ctrl.listTenants);
router.post('/tenants',                     ctrl.createTenant);
router.get('/tenants/:id',                  ctrl.getTenant);
router.patch('/tenants/:id',                ctrl.updateTenant);
router.delete('/tenants/:id',               ctrl.deleteTenant);
router.get('/tenants/:id/stats',            ctrl.tenantStats);
router.post('/tenants/:id/impersonate',     ctrl.impersonateTenant);
router.patch('/tenants/:id/quick-status',   ctrl.quickStatusTenant);
router.get('/stats',            ctrl.platformStats);
router.get('/subscriptions',    ctrl.listSubscriptions);
router.post('/subscriptions',   ctrl.createSubscription);
router.patch('/subscriptions/:id', ctrl.updateSubscription);
router.delete('/subscriptions/:id', ctrl.deleteSubscription);
router.get('/invoices',             ctrl.listInvoices);
router.post('/invoices',            ctrl.createInvoice);
router.get('/invoices/:id',         ctrl.getInvoice);
router.get('/invoices/:id/pdf',     ctrl.downloadInvoicePdf);
router.post('/invoices/:id/email',  ctrl.emailInvoice);
router.patch('/invoices/:id',       ctrl.updateInvoice);
router.delete('/invoices/:id',      ctrl.deleteInvoice);
router.get('/admins',           ctrl.listAdmins);
router.post('/admins',          ctrl.createAdmin);
router.delete('/admins/:id',    ctrl.deleteAdmin);
router.get('/system/maintenance', ctrl.getMaintenance);
router.get('/system/maintenance/logs', ctrl.getMaintenanceLogs);
router.get('/system/monitoring', ctrl.getMonitoring);
router.patch('/system/maintenance', ctrl.updateMaintenance);
router.post('/system/broadcast-sms', ctrl.broadcastSms);

// Plan configuration management
router.get('/plans',         ctrl.listPlans);
router.post('/plans',        ctrl.createPlan);
router.patch('/plans/:id',   ctrl.updatePlan);
router.delete('/plans/:id',  ctrl.deletePlan);

module.exports = router;
