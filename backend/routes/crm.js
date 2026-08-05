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
const rulesCtrl = require('../controllers/crmRulesController');

const admin = [verifyToken, requireRole('superadmin', 'admin'), featureGate('whatsapp_ai_crm')];
const kbAdmin = [verifyToken, requireRole('superadmin', 'admin'), featureGate('ai_knowledge_base')];
const staffInbox = [verifyToken, requireRole('superadmin', 'admin', 'manager', 'staff'), featureGate('whatsapp_ai_crm')];

// ── AI Settings ──────────────────────────────────────────────────────────────
router.get('/ai-settings', ...admin, aiSettingsCtrl.getAiSettings);
router.put('/ai-settings', ...admin, aiSettingsCtrl.updateAiSettings);
router.post('/ai-settings/test', ...admin, aiSettingsCtrl.testAiSettings);
router.get('/ai-model-rates', ...admin, aiSettingsCtrl.listModelRates);

// ── AI Rules (bot behaviour) ─────────────────────────────────────────────────
router.get('/rules', ...admin, rulesCtrl.list);
router.post('/rules', ...admin, rulesCtrl.create);
router.put('/rules/:id', ...admin, rulesCtrl.update);
router.delete('/rules/:id', ...admin, rulesCtrl.remove);
router.post('/rules/seed-defaults', ...admin, rulesCtrl.seedDefaults);

// ── Analytics / AI Cost ──────────────────────────────────────────────────────
router.get('/analytics/ai-cost', ...admin, analyticsCtrl.getAiCostSummary);
router.get('/analytics/overview', ...admin, analyticsCtrl.getCrmOverview);
router.post('/analytics/ai-credits/topup', ...admin, analyticsCtrl.addAiCreditTopup);
router.post('/analytics/ai-credits/set-balance', ...admin, analyticsCtrl.setAiCreditBalance);

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
router.post('/knowledge/seed-defaults', ...kbAdmin, kbCtrl.seedDefaults);
router.post('/knowledge/bulk-import', ...kbAdmin, kbCtrl.bulkImport);
router.get('/knowledge/:id', ...kbAdmin, kbCtrl.getOne);
router.post('/knowledge', ...kbAdmin, kbCtrl.create);
router.post('/knowledge/:id/duplicate', ...kbAdmin, kbCtrl.duplicate);
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
router.get('/internal/rules/:tenantId', requireServiceAuth, rulesCtrl.getRulesInternal);
router.post('/internal/whatsapp-qr-send', requireServiceAuth, async (req, res) => {
  try {
    const tenantId = parseInt(req.body?.tenantId || req.body?.tenant_id || req.headers['x-tenant-id'], 10);
    const phone = String(req.body?.phone || '').trim();
    const message = String(req.body?.message || '').trim();
    let replyJid = req.body?.replyJid || req.body?.reply_jid || null;
    const conversationId = parseInt(req.body?.conversation_id || req.body?.conversationId, 10);
    if (!Number.isInteger(tenantId) || tenantId <= 0 || !phone || !message) {
      return res.status(400).json({ message: 'tenantId, phone, message required' });
    }
    // Recover reply JID from last inbound if worker didn't pass it (LID chats)
    if (!replyJid && Number.isInteger(conversationId) && conversationId > 0) {
      const { CrmMessage } = require('../models');
      const lastIn = await CrmMessage.findOne({
        where: { tenant_id: tenantId, conversation_id: conversationId, direction: 'inbound' },
        order: [['id', 'DESC']],
      });
      replyJid = lastIn?.meta?.reply_jid || null;
    }
    const whatsappWeb = require('../services/whatsappWebService');
    if (!whatsappWeb.isConnected(tenantId)) {
      return res.status(503).json({ ok: false, reason: 'qr_not_connected' });
    }
    const result = await whatsappWeb.sendViaQr(tenantId, phone, message, {
      tenant_id: tenantId,
      event_type: req.body?.event_type || 'crm_ai_reply',
      replyJid,
    });
    if (!result?.used) {
      return res.status(502).json({ ok: false, reason: 'qr_send_failed', result });
    }
    return res.json({ ok: true, channel: 'qr', ...result });
  } catch (err) {
    console.error('[crm] internal whatsapp-qr-send', err);
    return res.status(500).json({ message: err.message || 'Send failed' });
  }
});

// ── Leads & Inbox ────────────────────────────────────────────────────────────
router.get('/leads', ...staffInbox, crmCtrl.listLeads);
router.patch('/leads/:id', ...staffInbox, crmCtrl.updateLead);

router.get('/conversations', ...staffInbox, crmCtrl.listConversations);
router.post('/conversations/mark-all-read', ...staffInbox, crmCtrl.markAllRead);
router.get('/conversations/:id', ...staffInbox, crmCtrl.getConversation);
router.post('/conversations/:id/claim', ...staffInbox, crmCtrl.claimConversation);
router.post('/conversations/:id/release', ...staffInbox, crmCtrl.releaseConversation);
router.post('/conversations/:id/close', ...staffInbox, crmCtrl.closeConversation);
router.post('/conversations/:id/agent-reply', ...staffInbox, crmCtrl.agentReply);

// Dev simulate until Cloud webhook
router.post('/dev/simulate-inbound', ...admin, crmCtrl.simulateInbound);

module.exports = router;
