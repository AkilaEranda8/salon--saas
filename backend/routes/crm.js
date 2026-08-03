'use strict';

const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { featureGate } = require('../middleware/featureGate');
const { requireServiceAuth } = require('../middleware/serviceAuth');
const aiSettingsCtrl = require('../controllers/crmAiSettingsController');
const crmCtrl = require('../controllers/crmController');
const wabaCtrl = require('../controllers/crmWhatsappController');
const kbCtrl = require('../controllers/crmKnowledgeController');
const analyticsCtrl = require('../controllers/crmAnalyticsController');

const admin = [verifyToken, requireRole('superadmin', 'admin'), featureGate('whatsapp_ai_crm')];
const kbAdmin = [verifyToken, requireRole('superadmin', 'admin'), featureGate('ai_knowledge_base')];
const staffInbox = [verifyToken, requireRole('superadmin', 'admin', 'manager', 'staff'), featureGate('whatsapp_ai_crm')];

// ── AI Settings ──────────────────────────────────────────────────────────────
router.get('/ai-settings', ...admin, aiSettingsCtrl.getAiSettings);
router.put('/ai-settings', ...admin, aiSettingsCtrl.updateAiSettings);
router.post('/ai-settings/test', ...admin, aiSettingsCtrl.testAiSettings);
router.get('/ai-model-rates', ...admin, aiSettingsCtrl.listModelRates);

// ── Analytics / AI Cost ──────────────────────────────────────────────────────
router.get('/analytics/ai-cost', ...admin, analyticsCtrl.getAiCostSummary);
router.get('/analytics/overview', ...admin, analyticsCtrl.getCrmOverview);

// ── WhatsApp Cloud (WABA) ────────────────────────────────────────────────────
router.get('/whatsapp-cloud', ...admin, wabaCtrl.getWabaSettings);
router.put('/whatsapp-cloud', ...admin, wabaCtrl.updateWabaSettings);
router.post('/whatsapp-cloud/test', ...admin, wabaCtrl.testWaba);
router.post('/whatsapp-cloud/send-test', ...admin, wabaCtrl.sendTestMessage);

// ── Reminders / follow-ups ───────────────────────────────────────────────────
router.get('/follow-ups', ...admin, async (req, res) => {
  try {
    const { resolveTenantId } = require('../utils/tenantScope');
    const { CrmFollowUpJob } = require('../models');
    const tenantId = resolveTenantId(req);
    const rows = await CrmFollowUpJob.findAll({
      where: { tenant_id: tenantId },
      order: [['id', 'DESC']],
      limit: 50,
    });
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});
router.post('/follow-ups/run-reminders', ...admin, async (req, res) => {
  try {
    const { resolveTenantId } = require('../utils/tenantScope');
    const { runDayBeforeReminders } = require('../services/crmReminderService');
    const tenantId = resolveTenantId(req);
    const isPlatform = req.user?.role === 'platform_admin';
    // C8: tenant admins only run their tenant; platform_admin may pass ?global=1
    if (!tenantId && !(isPlatform && String(req.query.global) === '1')) {
      return res.status(403).json({ message: 'Tenant context required.' });
    }
    const result = await runDayBeforeReminders({
      tenantId: tenantId || null,
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});
router.post('/follow-ups/run-abandoned', ...admin, async (req, res) => {
  try {
    const { resolveTenantId } = require('../utils/tenantScope');
    const { runAbandonedBookingNudges } = require('../services/crmReminderService');
    const tenantId = resolveTenantId(req);
    const isPlatform = req.user?.role === 'platform_admin';
    if (!tenantId && !(isPlatform && String(req.query.global) === '1')) {
      return res.status(403).json({ message: 'Tenant context required.' });
    }
    const result = await runAbandonedBookingNudges({
      tenantId: tenantId || null,
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// ── Knowledge Base ───────────────────────────────────────────────────────────
router.get('/knowledge', ...kbAdmin, kbCtrl.list);
router.get('/knowledge/search', ...kbAdmin, kbCtrl.search);
router.get('/knowledge/:id', ...kbAdmin, kbCtrl.getOne);
router.post('/knowledge', ...kbAdmin, kbCtrl.create);
router.put('/knowledge/:id', ...kbAdmin, kbCtrl.update);
router.delete('/knowledge/:id', ...kbAdmin, kbCtrl.remove);

router.get('/queue-stats', ...admin, async (_req, res) => {
  try {
    const { getQueueDashboard } = require('../services/crmDlqAlertService');
    const dash = await getQueueDashboard();
    return res.json({
      redis: !!process.env.REDIS_URL,
      ...dash,
      badge: dash.dlq?.alert ? { type: 'dlq', label: `DLQ ${dash.dlq.depth}`, tone: 'danger' } : null,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});
router.post('/queue-stats/check-dlq-alerts', ...admin, async (_req, res) => {
  try {
    const { maybeAlertDlq, getDlqDepth } = require('../services/crmDlqAlertService');
    const depth = await getDlqDepth();
    const result = await maybeAlertDlq({ message: 'Manual DLQ alert check' });
    return res.json({ depth, result });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.get('/internal/ai-settings/:tenantId', requireServiceAuth, aiSettingsCtrl.getAiSettingsInternal);

// ── Leads & Inbox ────────────────────────────────────────────────────────────
router.get('/leads', ...staffInbox, crmCtrl.listLeads);
router.patch('/leads/:id', ...admin, crmCtrl.updateLead);

router.get('/conversations', ...staffInbox, crmCtrl.listConversations);
router.get('/conversations/:id', ...staffInbox, crmCtrl.getConversation);
router.post('/conversations/:id/claim', ...staffInbox, crmCtrl.claimConversation);
router.post('/conversations/:id/release', ...staffInbox, crmCtrl.releaseConversation);
router.post('/conversations/:id/agent-reply', ...staffInbox, crmCtrl.agentReply);

// Dev simulate until Cloud webhook
router.post('/dev/simulate-inbound', ...admin, crmCtrl.simulateInbound);

module.exports = router;
