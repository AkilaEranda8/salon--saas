'use strict';
const { Op } = require('sequelize');
const { NotificationLog, NotificationSettings, Customer, Branch } = require('../models');
const { tenantWhere, resolveTenantId } = require('../utils/tenantScope');
const { sendEmail, sendWhatsApp, sendSMS } = require('../services/notificationService');
const { isPushConfigured, sendTestPush } = require('../services/fcmService');
const { runStaffMonthlyEarningsEmails } = require('../services/sendStaffMonthlyEarningsEmails');
const { buildStaffEarningsPdfBuffer } = require('../services/staffEarningsPdf');

const DEFAULT_SETTINGS = {
  appt_confirmed_email:       true,
  appt_confirmed_whatsapp:    true,
  appt_confirmed_sms:         false,
  payment_receipt_email:      true,
  payment_receipt_whatsapp:   true,
  payment_receipt_sms:        true,
  loyalty_points_whatsapp:    true,
  loyalty_points_sms:         false,
  customer_registered_sms:    false,
  customer_registered_email:  false,
  appt_completed_sms:         true,
  appt_completed_whatsapp:    true,
  walkin_checkin_whatsapp:    true,
  walkin_serving_whatsapp:    true,
  walkin_completed_whatsapp:  true,
  walkin_checkin_sms:         false,
  walkin_serving_sms:         false,
  walkin_completed_sms:       false,
  recurring_reminder_sms:     true,
  recurring_reminder_whatsapp: true,
  staff_appt_assigned_whatsapp: true,
};

const SETTINGS_FIELDS = Object.keys(DEFAULT_SETTINGS);
const STRING_FIELDS   = ['sms_sender_id', 'sms_user_id', 'twilio_account_sid', 'twilio_whatsapp_from', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_from'];
// secrets returned masked — never expose raw value
const MASKED_FIELDS   = ['twilio_auth_token', 'sms_api_key', 'smtp_pass'];

// ── GET /api/notifications/log ────────────────────────────────────────────────
const getLogs = async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 20, 200);
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const offset = (page - 1) * limit;

    const where = tenantWhere(req);
    if (req.userBranchId)         where.branch_id  = req.userBranchId;
    else if (req.query.branchId)  where.branch_id  = req.query.branchId;
    if (req.query.channel)        where.channel    = req.query.channel;
    if (req.query.event_type)     where.event_type = req.query.event_type;
    if (req.query.status)         where.status     = req.query.status;
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt[Op.gte] = new Date(req.query.from);
      if (req.query.to)   where.createdAt[Op.lte] = new Date(req.query.to + 'T23:59:59');
    }

    const { count, rows } = await NotificationLog.findAndCountAll({
      where, limit, offset,
      order: [['createdAt', 'DESC']],
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'], required: false }],
    });

    const companyDefault = process.env.COMPANY_NAME || 'HEXAONE';
    const data = rows.map((row) => {
      const plain = row.get ? row.get({ plain: true }) : row;
      return {
        ...plain,
        company_name: plain.branch?.name || companyDefault,
      };
    });

    return res.json({ total: count, page, limit, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// mask helper — show asterisks + last 4 chars
function maskSecret(val) {
  if (!val) return '';
  const s = String(val);
  if (s.length <= 4) return '****';
  return '••••••••' + s.slice(-4);
}

// ── Shared response builder ────────────────────────────────────────────────────
function buildSettingsOut(row, envDefaults) {
  const out = {};
  for (const f of SETTINGS_FIELDS) out[f] = row ? row[f] : DEFAULT_SETTINGS[f];

  // SMS gateway
  out.sms_provider    = (row?.sms_provider)   || envDefaults.sms_provider || 'notify_lk';
  out.sms_sender_id   = (row?.sms_sender_id)  || envDefaults.sms_sender_id;
  out.sms_user_id     = (row?.sms_user_id)    || envDefaults.sms_user_id;
  const rawSmsKey     = (row?.sms_api_key)    || envDefaults.sms_api_key;
  out.sms_api_key     = maskSecret(rawSmsKey);
  out.sms_api_key_set = !!rawSmsKey;
  if (row?.sms_api_key) out.sms_source = 'db';
  else if (envDefaults.sms_api_key) out.sms_source = 'env';
  else out.sms_source = 'none';

  // Twilio
  out.twilio_account_sid    = (row?.twilio_account_sid)   || envDefaults.twilio_account_sid;
  out.twilio_whatsapp_from  = (row?.twilio_whatsapp_from) || envDefaults.twilio_whatsapp_from;
  const rawToken            = (row?.twilio_auth_token)    || envDefaults.twilio_auth_token;
  out.twilio_auth_token     = maskSecret(rawToken);
  out.twilio_auth_token_set = !!rawToken;
  out.twilio_source         = (row?.twilio_account_sid && row?.twilio_auth_token) ? 'db' : (envDefaults.twilio_account_sid ? 'env' : 'none');

  // SMTP
  out.smtp_host     = (row?.smtp_host) || envDefaults.smtp_host;
  out.smtp_port     = (row?.smtp_port) || envDefaults.smtp_port;
  out.smtp_user     = (row?.smtp_user) || envDefaults.smtp_user;
  out.smtp_from     = (row?.smtp_from) || envDefaults.smtp_from;
  const rawPass     = (row?.smtp_pass) || envDefaults.smtp_pass;
  out.smtp_pass     = maskSecret(rawPass);
  out.smtp_pass_set = !!rawPass;
  out.smtp_source   = (row?.smtp_user && row?.smtp_pass) ? 'db' : (envDefaults.smtp_user ? 'env' : 'none');

  return out;
}

// ── GET /api/notifications/settings ──────────────────────────────────────────
const getSettings = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const row = await NotificationSettings.findOne({ where: { branch_id: null, tenant_id: tenantId || null } });

    const envDefaults = {
      sms_provider:         process.env.SMS_PROVIDER          || 'notify_lk',
      sms_sender_id:        process.env.SMS_SENDER_ID        || '',
      sms_user_id:          process.env.SMS_USER_ID           || '',
      sms_api_key:          process.env.SMS_API_KEY           || '',
      twilio_account_sid:   process.env.TWILIO_ACCOUNT_SID   || '',
      twilio_auth_token:    process.env.TWILIO_AUTH_TOKEN     || '',
      twilio_whatsapp_from: process.env.TWILIO_WHATSAPP_FROM  || '',
      smtp_host:            process.env.EMAIL_HOST || 'smtp.gmail.com',
      smtp_port:            process.env.EMAIL_PORT || '587',
      smtp_user:            process.env.EMAIL_USER || '',
      smtp_pass:            process.env.EMAIL_PASS || '',
      smtp_from:            process.env.EMAIL_FROM || '',
    };

    return res.json(buildSettingsOut(row, envDefaults));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── PUT /api/notifications/settings ──────────────────────────────────────────
const updateSettings = async (req, res) => {
  try {
    const update = {};
    for (const f of SETTINGS_FIELDS) {
      if (typeof req.body[f] === 'boolean') update[f] = req.body[f];
    }
    // String fields
    if (typeof req.body.sms_provider === 'string') {
      const p = req.body.sms_provider.trim().toLowerCase();
      update.sms_provider = (p === 'textit' || p === 'notify_lk') ? p : 'notify_lk';
    }
    if (typeof req.body.sms_sender_id === 'string') {
      update.sms_sender_id = req.body.sms_sender_id.trim().slice(0, 50) || null;
    }
    if (typeof req.body.sms_user_id === 'string') {
      update.sms_user_id = req.body.sms_user_id.trim() || null;
    }
    // SMS API key — only update if real value (not masked)
    if (typeof req.body.sms_api_key === 'string' && !req.body.sms_api_key.includes('•')) {
      update.sms_api_key = req.body.sms_api_key.trim() || null;
    }
    if (typeof req.body.twilio_account_sid === 'string') {
      update.twilio_account_sid = req.body.twilio_account_sid.trim() || null;
    }
    if (typeof req.body.twilio_whatsapp_from === 'string') {
      update.twilio_whatsapp_from = req.body.twilio_whatsapp_from.trim() || null;
    }
    // Auth token: only update if a real new value was provided (not a masked string)
    if (typeof req.body.twilio_auth_token === 'string' && !req.body.twilio_auth_token.includes('•')) {
      update.twilio_auth_token = req.body.twilio_auth_token.trim() || null;
    }
    // SMTP fields
    if (typeof req.body.smtp_host === 'string') update.smtp_host = req.body.smtp_host.trim() || null;
    if (req.body.smtp_port !== undefined)        update.smtp_port = parseInt(req.body.smtp_port) || null;
    if (typeof req.body.smtp_user === 'string') update.smtp_user = req.body.smtp_user.trim() || null;
    if (typeof req.body.smtp_from === 'string') update.smtp_from = req.body.smtp_from.trim() || null;
    // SMTP pass — only update if real value (not masked)
    if (typeof req.body.smtp_pass === 'string' && !req.body.smtp_pass.includes('•')) {
      update.smtp_pass = req.body.smtp_pass.trim() || null;
    }

    console.log('[updateSettings] update object:', JSON.stringify(update));

    const tenantId = resolveTenantId(req);
    const [row, created] = await NotificationSettings.findOrCreate({
      where:    { branch_id: null, tenant_id: tenantId || null },
      defaults: { ...DEFAULT_SETTINGS, tenant_id: tenantId || null, ...update },
    });

    console.log('[updateSettings] created:', created, '| row id:', row.id);

    if (!created) {
      await row.update(update);
      console.log('[updateSettings] after update, appt_confirmed_sms:', row.appt_confirmed_sms);
    }

    const envDef = {
      sms_provider: process.env.SMS_PROVIDER || 'notify_lk',
      sms_sender_id: process.env.SMS_SENDER_ID || '', sms_user_id: process.env.SMS_USER_ID || '', sms_api_key: process.env.SMS_API_KEY || '',
      twilio_account_sid: process.env.TWILIO_ACCOUNT_SID || '', twilio_auth_token: process.env.TWILIO_AUTH_TOKEN || '', twilio_whatsapp_from: process.env.TWILIO_WHATSAPP_FROM || '',
      smtp_host: process.env.EMAIL_HOST || 'smtp.gmail.com', smtp_port: process.env.EMAIL_PORT || '587',
      smtp_user: process.env.EMAIL_USER || '', smtp_pass: process.env.EMAIL_PASS || '', smtp_from: process.env.EMAIL_FROM || '',
    };
    await row.reload();
    return res.json(buildSettingsOut(row, envDef));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/notifications/test ──────────────────────────────────────────────
const sendTest = async (req, res) => {
  try {
    const { event_type = 'appointment_confirmed', email, phone } = req.body;
    const branchId = req.userBranchId || req.user.branchId || null;

    const VALID = ['appointment_confirmed', 'payment_receipt', 'loyalty_points'];
    if (!VALID.includes(event_type)) {
      return res.status(400).json({ message: `event_type must be one of: ${VALID.join(', ')}` });
    }
    if (!email && !phone) {
      return res.status(400).json({ message: 'Provide at least one of: email, phone.' });
    }
    const { sms } = req.body;

    const tenantId = resolveTenantId(req);
    const meta = {
      customer_name: 'Test Customer',
      event_type:    'test',
      branch_id:     branchId,
      tenant_id:     tenantId,
    };
    const date = new Date().toISOString().slice(0, 10);

    if (event_type === 'appointment_confirmed') {
      if (email) {
        await sendEmail({
          to:      email,
          subject: '[TEST] Appointment Confirmed — HEXAONE',
          html:    `<p>This is a test appointment confirmation from HEXAONE (${date}).</p>`,
          meta,
          tenantId,
        });
      }
      if (phone) {
        await sendWhatsApp({
          to:      phone,
          message: `[TEST] ✂️ HEXAONE — Appointment Confirmed!\n\nHi Test Customer, this is a test notification (${date}).`,
          meta,
        });
      }
      if (sms || phone) {
        await sendSMS({
          to:      sms || phone,
          message: `[TEST] HEXAONE - Appt Confirmed! Hi Test Customer, test notification (${date}).`,
          meta,
        });
      }
    } else if (event_type === 'payment_receipt') {
      if (email) {
        await sendEmail({
          to:      email,
          subject: '[TEST] Payment Receipt — HEXAONE',
          html:    `<p>This is a test payment receipt from HEXAONE (${date}). Amount: Rs. 1,500.00</p>`,
          meta,
          tenantId,
        });
      }
      if (phone) {
        await sendWhatsApp({
          to:      phone,
          message: `[TEST] 🧾 HEXAONE — Payment Receipt\n\nHi Test Customer! This is a test receipt (${date}).\n💰 Total Paid: Rs. 1,500.00`,
          meta,
        });
      }
      if (sms || phone) {
        await sendSMS({
          to:      sms || phone,
          message: `[TEST] HEXAONE - Receipt Hi Test Customer! Total: Rs. 1,500.00 (${date}).`,
          meta,
        });
      }
    } else if (event_type === 'loyalty_points') {
      if (phone) {
        await sendWhatsApp({
          to:      phone,
          message: `[TEST] 🌟 HEXAONE — Loyalty Points\n\nHey Test Customer! 🎉\nThis is a test loyalty update.\n• Earned this visit: +150 pts\n• Total balance: 350 pts`,
          meta,
        });
      }
      if (sms || phone) {
        await sendSMS({
          to:      sms || phone,
          message: `[TEST] HEXAONE - Loyalty Update! Earned: +150 pts. Balance: 350 pts.`,
          meta,
        });
      }
    }

    return res.json({ message: `Test notifications dispatched for "${event_type}".` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/notifications/test-provider ─────────────────────────────────────
// Tests a single provider with a real message. Body: { provider, to }
const testProvider = async (req, res) => {
  const { provider, to } = req.body;
  if (!provider) return res.status(400).json({ message: 'provider is required.' });
  if (!to)       return res.status(400).json({ message: 'to (destination) is required.' });

  const date = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });

  try {
    const tenantId = resolveTenantId(req);
    if (provider === 'smtp') {
      await sendEmail({
        to,
        subject: `✅ HEXAONE — SMTP Test (${date})`,
        html: `<div style="font-family:Arial,sans-serif;padding:24px;">
          <h2 style="color:#16A34A;">✅ SMTP Connection Successful!</h2>
          <p>This is a test email from <strong>HEXAONE</strong>.</p>
          <p style="color:#64748B;font-size:13px;">Sent at: ${date}</p>
        </div>`,
        meta: { customer_name: 'Test', event_type: 'test', branch_id: null },
        tenantId,
      });
      return res.json({ message: `Test email sent to ${to}` });
    }

    if (provider === 'sms') {
      const result = await sendSMS({
        to,
        message: `[HEXAONE] SMS test successful! Sent at ${date}.`,
        meta: { customer_name: 'Test', event_type: 'test', branch_id: null, tenant_id: tenantId },
        tenantId,
      });
      if (result && result.status === 'failed') {
        return res.status(400).json({ message: `SMS failed: ${result.error}` });
      }
      if (!result) {
        return res.status(400).json({ message: 'SMS not sent — check User ID, API Key, and Sender ID.' });
      }
      return res.json({ message: `Test SMS sent to ${to}` });
    }

    if (provider === 'whatsapp') {
      await sendWhatsApp({
        to,
        message: `✅ *HEXAONE* — WhatsApp test successful!\n\nSent at: ${date}`,
        meta: { customer_name: 'Test', event_type: 'test', branch_id: null, tenant_id: tenantId },
        tenantId,
      });
      return res.json({ message: `Test WhatsApp sent to ${to}` });
    }

    return res.status(400).json({ message: `Unknown provider: ${provider}. Use smtp, sms, or whatsapp.` });
  } catch (err) {
    console.error('[testProvider]', err);
    return res.status(500).json({ message: err.message || 'Send failed.' });
  }
};

// ── POST /api/notifications/test-push ─────────────────────────────────────────
// Sends a test FCM push to staff devices (always tenant-scoped; branch when set).
const testPush = async (req, res) => {
  try {
    if (!isPushConfigured()) {
      return res.status(503).json({
        message: 'Push notifications are not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON on the server and restart the backend.',
      });
    }

    const { StaffFcmToken, Branch } = require('../models');
    const { Op } = require('sequelize');
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        message: 'Tenant context required. Open Notifications from a salon workspace (not platform-wide).',
      });
    }

    const branchId = req.body.branchId || req.userBranchId || req.user?.branchId || null;
    const tenantBranches = await Branch.findAll({
      where: { tenant_id: tenantId },
      attributes: ['id'],
    });
    const tenantBranchIds = tenantBranches.map((b) => b.id);

    // Match tagged tokens + legacy null-tenant rows only for this salon's branches
    const where = {
      [Op.or]: [
        { tenant_id: tenantId },
        ...(tenantBranchIds.length
          ? [{ tenant_id: null, branch_id: { [Op.in]: tenantBranchIds } }]
          : []),
      ],
    };
    if (branchId) {
      if (!tenantBranchIds.includes(Number(branchId)) && !tenantBranchIds.includes(branchId)) {
        return res.status(403).json({ message: 'Branch does not belong to this salon.' });
      }
      where.branch_id = branchId;
    }

    const rows = await StaffFcmToken.findAll({
      where,
      attributes: ['fcm_token'],
    });
    const tokens = [...new Set(rows.map((r) => r.fcm_token).filter(Boolean))];
    if (tokens.length === 0) {
      return res.status(404).json({
        message: branchId
          ? 'No staff devices registered for this branch. Open the staff mobile app, allow notifications, and sign in.'
          : 'No staff devices registered for this salon. Open the staff mobile app, allow notifications, and sign in.',
      });
    }

    const when = new Date().toLocaleString('en-GB', {
      timeZone: 'Asia/Colombo',
      dateStyle: 'short',
      timeStyle: 'short',
    });
    const title = 'Hexaone — Test Notification';
    const body = `[TEST] Push reminder test at ${when}. If you see this, FCM is working.`;
    const result = await sendTestPush(tokens, title, body, {
      type: 'test',
      branch_id: String(branchId || ''),
      tenant_id: String(tenantId),
    });

    if (result.sent === 0) {
      return res.status(502).json({
        message: 'FCM is configured but all sends failed. Tokens may be stale — re-open the staff app and sign in again.',
        tokenCount: tokens.length,
        failed: result.failed,
      });
    }

    return res.json({
      message: `Test push sent to ${result.sent} of ${tokens.length} device(s).`,
      tokenCount: tokens.length,
      sent: result.sent,
      failed: result.failed,
      branchId,
    });
  } catch (err) {
    console.error('[testPush]', err);
    return res.status(500).json({ message: err.message || 'Push test failed.' });
  }
};

// ── POST /api/notifications/offer-sms | office-sms ─────────────────────────────
const sendBulkCustomerSms = async (req, res, {
  eventType = 'offer_sms',
  label = 'Offer SMS',
}) => {
  try {
    const ids = Array.isArray(req.body.customerIds) ? req.body.customerIds : [];
    const customerIds = ids
      .map((v) => parseInt(v, 10))
      .filter((v) => Number.isInteger(v) && v > 0);
    const message = String(req.body.message || '').trim();

    if (!customerIds.length) {
      return res.status(400).json({ message: 'Select at least one customer.' });
    }
    if (!message) {
      return res.status(400).json({ message: 'Message is required.' });
    }
    const isUnicode = /[^\u0000-\u007F]/.test(message);
    const maxLen    = isUnicode ? 335 : 480;
    if (message.length > maxLen) {
      return res.status(400).json({
        message: isUnicode
          ? `Sinhala/Unicode message is too long (max ${maxLen} characters — Unicode SMS uses 70 chars per part).`
          : `Message is too long (max ${maxLen} characters).`,
      });
    }

    const tenantId = resolveTenantId(req);
    const where = { ...tenantWhere(req), id: customerIds };
    if (req.userBranchId) where.branch_id = req.userBranchId;
    const customers = await Customer.findAll({
      where,
      attributes: ['id', 'name', 'phone', 'branch_id'],
    });

    if (!customers.length) {
      return res.status(404).json({ message: 'No matching customers found.' });
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const results = [];
    const sentAt = new Date().toISOString();

    for (const customer of customers) {
      const phone = String(customer.phone || '').trim();
      const base = {
        customerId: customer.id,
        name: customer.name,
        phone: phone || null,
      };
      if (!phone) {
        skipped++;
        results.push({ ...base, status: 'skipped', error: 'No phone number' });
        continue;
      }
      const result = await sendSMS({
        to: phone,
        message,
        meta: {
          customer_name: customer.name,
          event_type: eventType,
          branch_id: customer.branch_id || req.userBranchId || null,
          tenant_id: tenantId,
        },
        tenantId,
      });
      if (!result) {
        skipped++;
        results.push({ ...base, status: 'skipped', error: 'SMS not configured or not sent' });
      } else if (result.status === 'failed') {
        failed++;
        results.push({ ...base, status: 'failed', error: result.error || 'Send failed' });
      } else {
        sent++;
        results.push({ ...base, status: 'sent', error: null });
      }
    }

    return res.json({
      message: `${label} processed. Sent: ${sent}, Failed: ${failed}, Skipped: ${skipped}.`,
      sentAt,
      event_type: eventType,
      totals: {
        requested: customerIds.length,
        matched: customers.length,
        sent,
        failed,
        skipped,
      },
      results,
    });
  } catch (err) {
    console.error(`[sendBulkCustomerSms:${eventType}]`, err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const sendOfferSms = (req, res) =>
  sendBulkCustomerSms(req, res, { eventType: 'offer_sms', label: 'Offer SMS' });

const sendOfficeSms = (req, res) =>
  sendBulkCustomerSms(req, res, { eventType: 'office_sms', label: 'Office SMS' });

/**
 * POST /api/notifications/staff-monthly-earnings
 * Body: { year?: number, month?: number } — omit both to use previous calendar month.
 * Sends a PDF earnings report by email to each active staff member who has an email.
 * Managers: only staff in their branch. SMTP must be configured (DB or .env).
 */
const sendStaffMonthlyEarnings = async (req, res) => {
  try {
    const year = req.body.year != null ? parseInt(req.body.year, 10) : null;
    const month = req.body.month != null ? parseInt(req.body.month, 10) : null;
    const out = await runStaffMonthlyEarningsEmails({
      year: Number.isFinite(year) ? year : undefined,
      month: Number.isFinite(month) ? month : undefined,
      userRole: req.user?.role,
      userBranchId: req.userBranchId,
    });
    return res.json(out);
  } catch (err) {
    console.error('[sendStaffMonthlyEarnings]', err);
    return res.status(400).json({ message: err.message || 'Server error.' });
  }
};

/**
 * POST /api/notifications/test-staff-earnings-pdf
 * Body: { to: "email@..." } — sends one sample PDF (demo data, previous month label) to verify SMTP + PDF.
 */
const testStaffEarningsPdf = async (req, res) => {
  try {
    const to = String(req.body.to || '').trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({ message: 'Valid email address (to) is required.' });
    }
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const mm = String(month).padStart(2, '0');

    const buffer = await buildStaffEarningsPdfBuffer({
      staff: {
        name: 'Test / Sample Staff',
        email: to,
        role_title: 'Stylist',
        branch: { name: 'Sample Branch' },
      },
      payments: [],
      year,
      month,
      totalCommission: 0,
    });

    const result = await sendEmail({
      to,
      subject: `[TEST] Staff earnings report (sample PDF) — ${year}-${mm}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111;">
        <p>This is a <strong>test email</strong> with a sample PDF (same layout as real monthly staff reports).</p>
        <p style="color:#64748B;font-size:13px;">Label period: <strong>${year}-${mm}</strong> (previous calendar month). Demo only — no real payments.</p>
      </div>`,
      attachments: [{ filename: `Earnings_TEST_${year}-${mm}.pdf`, content: buffer, contentType: 'application/pdf' }],
      meta: {
        customer_name: 'Test',
        event_type: 'staff_earnings_pdf_test',
        branch_id: null,
      },
    });

    if (!result?.ok) {
      return res.status(400).json({
        message: result?.skipped
          ? 'SMTP not configured. Save SMTP in Notification settings or set EMAIL_USER / EMAIL_PASS in .env.'
          : (result?.error || 'Email failed.'),
      });
    }
    return res.json({ message: `Test earnings PDF sent to ${to}` });
  } catch (err) {
    console.error('[testStaffEarningsPdf]', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
};

// ── Message Template defaults ─────────────────────────────────────────────────
const DEFAULT_TEMPLATES = {
  appointment_confirmed: {
    email: {
      subject: 'Appointment Confirmed — HEXAONE',
      body: `<h2 style="margin:0 0 8px;font-size:22px;color:#1e3a8a;">Appointment Confirmed! 🎉</h2>
<p style="margin:0 0 24px;font-size:15px;color:#475569;">Hi <strong>{customer_name}</strong>, your appointment has been confirmed. Here are the details:</p>
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#6b7280;width:40%;">📅 Date</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;font-weight:600;">{date}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#6b7280;">⏰ Time</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;font-weight:600;">{time}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#6b7280;">💇 Service</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;font-weight:600;">{service_name}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#6b7280;">🏠 Branch</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;font-weight:600;">{branch_name}</td></tr>
  <tr><td style="padding:10px 0;font-size:14px;color:#6b7280;">💰 Amount</td><td style="padding:10px 0;font-size:14px;color:#1e293b;font-weight:600;">{amount}</td></tr>
</table>
<div style="margin:28px 0;padding:16px 20px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;">
  <p style="margin:0;font-size:14px;color:#1e40af;">📌 Please arrive 5 minutes early. Contact us if you need to reschedule.</p>
</div>
<p style="margin:0;font-size:15px;color:#475569;">Thank you for choosing <strong>{branch_name}</strong>! See you soon. ✨</p>`,
    },
    whatsapp: {
      body: `✂️ *{branch_name} — Appointment Confirmed!*\n\nHi {customer_name}, your booking is confirmed:\n\n📅 Date: {date}\n⏰ Time: {time}\n💇 Service: {service_name}\n🏠 Branch: {branch_name}\n💰 Amount: {amount}\n\nPlease arrive 5 mins early. See you soon! 😊`,
    },
    sms: {
      body: `{branch_name}: Hi {customer_name}, booked {service_name} on {date} {time}. See you!`,
    },
  },
  staff_appointment_assigned: {
    whatsapp: {
      body: `*{branch_name} — New Appointment*\n\nHi {staff_name}, you have a new appointment:\n\nCustomer: {customer_name}\nService: {service_name}\nDate: {date}\nTime: {time}\nAmount: {amount}\nBranch: {branch_name}`,
    },
  },
  appointment_completed: {
    whatsapp: {
      body: `✅ *{branch_name} — Service Complete*\n\nHi {customer_name}! Your {service_name} is done.\n📅 {date} {time}\n🏠 {branch_name}\n\nThank you for visiting! 🙏`,
    },
    sms: {
      body: `{branch_name}: Hi {customer_name}, {service_name} done on {date}. Thank you!`,
    },
  },
  recurring_reminder: {
    whatsapp: {
      body: `✂️ *{branch_name} — Recurring Visit Reminder*\n\nHi {customer_name}! Reminder for your visit today:\n\n📅 Date: {date}\n⏰ Time: {time}\n💇 Service: {service_name}\n🏠 Branch: {branch_name}\n\nSee you soon! 😊`,
    },
    sms: {
      body: `{branch_name}: Hi {customer_name}, reminder today {service_name} at {time}. See you!`,
    },
  },
  payment_receipt: {
    email: {
      subject: 'Payment Receipt — {branch_name}',
      body: `<h2 style="margin:0 0 8px;font-size:22px;color:#1e3a8a;">Payment Receipt 🧾</h2>
<p style="margin:0 0 24px;font-size:15px;color:#475569;">Hi <strong>{customer_name}</strong>, here's your receipt:</p>
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#6b7280;width:40%;">📅 Date</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;font-weight:600;">{date}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#6b7280;">💇 Service</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;font-weight:600;">{service_name}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#6b7280;">🏠 Branch</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;font-weight:600;">{branch_name}</td></tr>
  <tr><td style="padding:10px 0;font-size:14px;color:#6b7280;">💰 Total Paid</td><td style="padding:10px 0;font-size:14px;color:#1e293b;font-weight:700;">{amount}</td></tr>
</table>
<p style="margin:16px 0 0;font-size:14px;color:#475569;white-space:pre-line;">{loyalty_section}</p>`,
    },
    whatsapp: {
      body: `🧾 *{branch_name} — Payment Receipt*\n\nHi {customer_name}!\n\n💇 Service: {service_name}\n🏠 Branch: {branch_name}\n📅 Date: {date}\n💰 Paid: {amount}{loyalty_section}`,
    },
    sms: {
      body: `{branch_name} receipt: Hi {customer_name}, paid {amount} for {service_name} on {date}.{loyalty_section}`,
    },
  },
  loyalty_points: {
    whatsapp: {
      body: `🌟 *{branch_name} — Loyalty Points Update*\n\nHey {customer_name}! 🎉\n\nYou just earned *+{points_earned} points* at *{branch_name}*!\n\n📊 Points Balance:\n  • Earned this visit: +{points_earned}\n  • Total balance: *{points_total} pts*\n\n💡 Every 10 pts = Rs. 1 discount on your next visit!\n\nKeep visiting {branch_name} to unlock more rewards. 🛍️`,
    },
    sms: {
      body: `{branch_name}: Hi {customer_name}, +{points_earned} pts earned. Total {points_total}. 10pts=Rs1.`,
    },
  },
  walk_in_checkin: {
    whatsapp: {
      body: `🚶 *{branch_name} — Walk-In Check-In*\n\nHi {customer_name}! You're checked in.\n\n🎫 Token: *{token}*\n💇 Service: {service_name}\n🏠 Branch: {branch_name}\n⏳ Est. wait: {wait_mins} mins\n\nPlease wait — we'll call your token soon.`,
    },
    sms: {
      body: `{branch_name}: Hi {customer_name}, checked in. Token {token}. Wait ~{wait_mins} mins.`,
    },
  },
  walk_in_serving: {
    whatsapp: {
      body: `🚶 *{branch_name} — Your Turn!*\n\nHi {customer_name}, token *{token}* is now being served.\n💇 {service_name}\n🏠 {branch_name}\n\nPlease proceed to the service area.`,
    },
    sms: {
      body: `{branch_name}: Hi {customer_name}, token {token} is now serving. Please come in.`,
    },
  },
  walk_in_completed: {
    whatsapp: {
      body: `✅ *{branch_name} — Service Complete*\n\nHi {customer_name}! Your walk-in service is complete.\n💇 {service_name}\n\nThank you for visiting {branch_name}! 🙏`,
    },
    sms: {
      body: `{branch_name}: Hi {customer_name}, {service_name} complete. Thank you!`,
    },
  },
  review_request: {
    email: {
      subject: 'How was your visit? — Share your feedback',
      body: `<h2 style="margin:0 0 8px;font-size:22px;color:#1e3a8a;">How was your experience? ⭐</h2>
<p style="margin:0 0 24px;font-size:15px;color:#475569;">Hi <strong>{customer_name}</strong>, thank you for visiting <strong>{branch_name}</strong>! We'd love to hear your feedback on <strong>{service_name}</strong>.</p>
<div style="text-align:center;margin:32px 0;">
  <a href="{review_url}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#1e3a8a,#3b82f6);color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:700;">✍️ Leave a Review</a>
</div>
<p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">This link is unique to your visit and can only be used once.</p>`,
    },
    whatsapp: {
      body: `⭐ *{branch_name} — Share Your Feedback!*\n\nHi {customer_name}! 😊 Thank you for visiting *{branch_name}*.\n\nHow was your *{service_name}* experience? We'd love your feedback!\n\n👉 Leave a review (takes 30 seconds):\n{review_url}\n\n_This link is unique and can only be used once._`,
    },
  },
  customer_registered: {
    email: {
      subject: 'Welcome to {branch_name}!',
      body: `<h2 style="margin:0 0 8px;font-size:22px;color:#1e3a8a;">Welcome to {branch_name}! 🎉</h2>
<p style="margin:0 0 24px;font-size:15px;color:#475569;">Hi <strong>{customer_name}</strong>, your account has been created. We're excited to have you!</p>
<p style="margin:0;font-size:15px;color:#475569;">Visit us again and earn loyalty rewards. See you soon! ✨</p>`,
    },
    sms: {
      body: `Welcome to {branch_name}, {customer_name}! Your account is ready. Visit us to earn loyalty rewards!`,
    },
  },
};

// ── GET /api/notifications/templates ─────────────────────────────────────────
const listTemplates = async (req, res) => {
  try {
    const { MessageTemplate } = require('../models');
    const { resolveTenantId } = require('../utils/tenantScope');
    const tenantId = resolveTenantId(req);

    const rows = await MessageTemplate.findAll({
      where: { tenant_id: tenantId || null },
      order: [['event_type', 'ASC'], ['channel', 'ASC'], ['id', 'ASC']],
    });

    const result = [];
    for (const [event_type, channels] of Object.entries(DEFAULT_TEMPLATES)) {
      for (const [channel, defaults] of Object.entries(channels)) {
        const customs = rows.filter((row) => row.event_type === event_type && row.channel === channel);
        const hasSelectedCustom = customs.some((row) => row.is_active && row.is_default);
        result.push({
          event_type,
          channel,
          name:      'System default',
          subject:   defaults.subject || null,
          body:      defaults.body,
          is_active: true,
          is_default: !hasSelectedCustom,
          is_custom: false,
          id:        null,
        });
        for (const custom of customs) {
          result.push({
            id: custom.id,
            event_type,
            channel,
            name: custom.name || `Template ${custom.id}`,
            subject: custom.subject,
            body: custom.body,
            is_active: custom.is_active,
            is_default: custom.is_active && custom.is_default,
            is_custom: true,
          });
        }
      }
    }

    return res.json({ templates: result, defaults: DEFAULT_TEMPLATES });
  } catch (err) {
    console.error('[listTemplates]', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/notifications/templates — create or update a variant ───────────
const saveTemplate = async (req, res) => {
  try {
    const { MessageTemplate } = require('../models');
    const { resolveTenantId } = require('../utils/tenantScope');
    const { sequelize } = require('../config/database');
    const tenantId = resolveTenantId(req);

    const { id, event_type, channel, subject, body, is_active, is_default } = req.body;
    if (!event_type || !channel || !body) {
      return res.status(400).json({ message: 'event_type, channel, and body are required.' });
    }
    if (!DEFAULT_TEMPLATES[event_type]?.[channel]) {
      return res.status(400).json({ message: 'Invalid event_type / channel combination.' });
    }

    const cleanName = String(req.body.name || '').trim().slice(0, 120);
    if (!cleanName) {
      return res.status(400).json({ message: 'Template name is required.' });
    }

    // Editing/creating a custom template should become the live send template unless
    // the client explicitly passes is_default: false.
    const makeDefault = is_default !== false;

    let row;
    await sequelize.transaction(async (transaction) => {
      if (id) {
        row = await MessageTemplate.findOne({
          where: { id: parseInt(id, 10), tenant_id: tenantId || null },
          transaction,
        });
        if (!row) {
          const err = new Error('Template not found.');
          err.statusCode = 404;
          throw err;
        }
        if (row.event_type !== event_type || row.channel !== channel) {
          const err = new Error('A template event and channel cannot be changed.');
          err.statusCode = 400;
          throw err;
        }
        await row.update({
          name: cleanName,
          subject: subject || null,
          body: String(body).trim(),
          is_active: is_active !== false,
          is_default: makeDefault ? true : row.is_default,
        }, { transaction });
      } else {
        row = await MessageTemplate.create({
          event_type,
          channel,
          name: cleanName,
          subject: subject || null,
          body: String(body).trim(),
          is_active: is_active !== false,
          is_default: makeDefault,
          tenant_id: tenantId || null,
        }, { transaction });
      }

      if (makeDefault) {
        await MessageTemplate.update(
          { is_default: false },
          {
            where: {
              event_type,
              channel,
              tenant_id: tenantId || null,
              id: { [Op.ne]: row.id },
            },
            transaction,
          }
        );
        if (!row.is_default) {
          await row.update({ is_default: true }, { transaction });
        }
      }
    });

    return res.json({ ok: true, template: row });
  } catch (err) {
    console.error('[saveTemplate]', err);
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/notifications/templates/options ─────────────────────────────────
// Lightweight list used by operational pages (e.g. Record Payment) to pick the
// message that should go out for a single record.
const listTemplateOptions = async (req, res) => {
  try {
    const { MessageTemplate } = require('../models');
    const tenantId = resolveTenantId(req);
    const eventType = String(req.query.event_type || '').trim();

    if (!DEFAULT_TEMPLATES[eventType]) {
      return res.status(400).json({ message: 'Invalid event_type.' });
    }

    const rows = await MessageTemplate.findAll({
      where: { event_type: eventType, tenant_id: tenantId || null, is_active: true },
      attributes: ['id', 'name', 'channel', 'is_default'],
      order: [['channel', 'ASC'], ['id', 'ASC']],
    });

    const options = rows.map((row) => ({
      id: row.id,
      name: row.name || `Template ${row.id}`,
      channel: row.channel,
      is_default: row.is_default,
    }));

    return res.json({ event_type: eventType, options });
  } catch (err) {
    console.error('[listTemplateOptions]', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/notifications/templates/select ─────────────────────────────────
const selectTemplate = async (req, res) => {
  try {
    const { MessageTemplate } = require('../models');
    const { sequelize } = require('../config/database');
    const tenantId = resolveTenantId(req);
    const { event_type, channel } = req.body;
    const templateId = req.body.template_id == null ? null : parseInt(req.body.template_id, 10);

    if (!DEFAULT_TEMPLATES[event_type]?.[channel]) {
      return res.status(400).json({ message: 'Invalid event_type / channel combination.' });
    }

    await sequelize.transaction(async (transaction) => {
      await MessageTemplate.update(
        { is_default: false },
        { where: { event_type, channel, tenant_id: tenantId || null }, transaction }
      );
      if (templateId != null) {
        const row = await MessageTemplate.findOne({
          where: { id: templateId, event_type, channel, tenant_id: tenantId || null, is_active: true },
          transaction,
        });
        if (!row) {
          const err = new Error('Active template not found.');
          err.statusCode = 404;
          throw err;
        }
        await row.update({ is_default: true }, { transaction });
      }
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[selectTemplate]', err);
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── DELETE /api/notifications/templates/:id — reset to default ────────────────
const deleteTemplate = async (req, res) => {
  try {
    const { MessageTemplate } = require('../models');
    const { resolveTenantId } = require('../utils/tenantScope');
    const tenantId = resolveTenantId(req);

    const id = parseInt(req.params.id, 10);
    await MessageTemplate.destroy({ where: { id, tenant_id: tenantId || null } });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[deleteTemplate]', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  getLogs,
  getSettings,
  updateSettings,
  sendTest,
  testProvider,
  testPush,
  sendOfferSms,
  sendOfficeSms,
  sendStaffMonthlyEarnings,
  testStaffEarningsPdf,
  listTemplates,
  listTemplateOptions,
  saveTemplate,
  selectTemplate,
  deleteTemplate,
  DEFAULT_TEMPLATES,
};
