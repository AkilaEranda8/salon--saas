const express = require('express');
const router  = express.Router();
const { verifyToken }    = require('../middleware/auth');
const { platformAdmin }  = require('../middleware/platformAdmin');
const ctrl               = require('../controllers/platformController');
const parity             = require('../controllers/platformParityController');
const deepen             = require('../controllers/platformDeepenController');
const waCtrl             = require('../controllers/whatsappController');

// All platform routes require platform_admin role
router.use(verifyToken, platformAdmin);

router.get('/tenants',                      ctrl.listTenants);
router.post('/tenants',                     ctrl.createTenant);
router.get('/tenants/:id',                  ctrl.getTenant);
router.patch('/tenants/:id',                ctrl.updateTenant);
router.post('/tenants/:id/trial/adjust',    ctrl.adjustTenantTrial);
router.post('/tenants/:id/clear-data',     ctrl.clearTenantData);
router.delete('/tenants/:id',               ctrl.deleteTenant);
router.get('/tenants/:id/stats',            ctrl.tenantStats);
router.get('/tenants/:id/features',         ctrl.getTenantFeatures);
router.patch('/tenants/:id/features',       ctrl.updateTenantFeatures);
router.post('/tenants/:id/impersonate',     ctrl.impersonateTenant);
router.patch('/tenants/:id/quick-status',   ctrl.quickStatusTenant);
router.get('/tenants/:id/whatsapp',         waCtrl.getPlatformTenantWhatsApp);
router.post('/tenants/:id/revoke-sessions', deepen.revokeTenantSessions);
router.get('/stats',            ctrl.platformStats);
router.get('/analytics',        deepen.platformAnalytics);
router.get('/analytics/mrr-chart', deepen.mrrChart);
router.get('/notifications',    deepen.platformNotifications);
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
router.patch('/admins/:id',     deepen.enrichUpdateAdmin);
router.post('/admins/:id/reset-password', deepen.resetAdminPassword);
router.delete('/admins/:id',    ctrl.deleteAdmin);
router.post('/users/:id/reset-password', deepen.resetUserPassword);
router.get('/activity-logs',          ctrl.listActivityLogs);
router.get('/system/maintenance', ctrl.getMaintenance);
router.get('/system/maintenance/logs', ctrl.getMaintenanceLogs);
router.get('/system/monitoring', ctrl.getMonitoring);
router.patch('/system/maintenance', ctrl.updateMaintenance);
router.post('/system/broadcast-sms', ctrl.broadcastSms);

// SMTP / SMS configuration (platform-level global defaults)
router.get('/system/smtp-sms',       ctrl.getPlatformSmtpSms);
router.put('/system/smtp-sms',       ctrl.updatePlatformSmtpSms);
router.post('/system/smtp-sms/test', ctrl.testPlatformSmtp);

// Plan configuration management
router.get('/plans',              ctrl.listPlans);
router.get('/plans/change-logs',  ctrl.listPlanChangeLogs);
router.post('/plans',             ctrl.createPlan);
router.patch('/plans/:id',        ctrl.updatePlan);
router.delete('/plans/:id',       ctrl.deletePlan);

// ── Enterprise parity: announcements / releases / suggestions / catalog ─────
router.get('/announcements',              parity.listAnnouncements);
router.post('/announcements',             parity.createAnnouncement);
router.patch('/announcements/:id',        parity.updateAnnouncement);
router.patch('/announcements/:id/send',   parity.sendAnnouncement);
router.delete('/announcements/:id',       parity.deleteAnnouncement);

router.get('/releases',                   parity.listReleases);
router.get('/releases/:id',               parity.getRelease);
router.post('/releases',                  parity.createRelease);
router.put('/releases/:id',               parity.updateRelease);
router.patch('/releases/:id/publish',     parity.publishRelease);
router.delete('/releases/:id',            parity.deleteRelease);

router.get('/feature-suggestions/summary', parity.suggestionsSummary);
router.get('/feature-suggestions',         parity.listSuggestions);
router.get('/feature-suggestions/:id',     parity.getSuggestion);
router.patch('/feature-suggestions/:id',   parity.updateSuggestion);
router.post('/feature-suggestions',        parity.createSuggestion);

router.get('/master-catalog/categories',           parity.listCatalogCategories);
router.post('/master-catalog/categories',          parity.createCatalogCategory);
router.patch('/master-catalog/categories/:id',     parity.updateCatalogCategory);
router.delete('/master-catalog/categories/:id',    parity.deleteCatalogCategory);
router.post('/master-catalog/items',               parity.createCatalogItem);
router.patch('/master-catalog/items/:id',          parity.updateCatalogItem);
router.delete('/master-catalog/items/:id',         parity.deleteCatalogItem);

// ── Wave 4: platform WhatsApp console ───────────────────────────────────────
router.get('/whatsapp/status',            deepen.platformWaStatus);
router.post('/whatsapp/connect',          deepen.platformWaConnect);
router.post('/whatsapp/disconnect',       deepen.platformWaDisconnect);
router.post('/whatsapp/test-message',     deepen.platformWaTestMessage);
router.post('/whatsapp/send-onboard',     deepen.platformWaSendOnboard);
router.put('/whatsapp/tenant',            deepen.setPlatformWaTenant);

module.exports = router;
