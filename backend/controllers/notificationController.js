'use strict';
const { Op } = require('sequelize');
const { NotificationLog, NotificationSettings, Customer, Branch } = require('../models');
const { tenantWhere } = require('../utils/tenantScope');
const { sendEmail, sendWhatsApp, sendSMS } = require('../services/notificationService');
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

    const companyDefault = process.env.COMPANY_NAME || 'Zane Salon';
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
  out.sms_sender_id   = (row?.sms_sender_id)  || envDefaults.sms_sender_id;
  out.sms_user_id     = (row?.sms_user_id)    || envDefaults.sms_user_id;
  const rawSmsKey     = (row?.sms_api_key)    || envDefaults.sms_api_key;
  out.sms_api_key     = maskSecret(rawSmsKey);
  out.sms_api_key_set = !!rawSmsKey;
  out.sms_source      = (row?.sms_user_id && row?.sms_api_key) ? 'db' : (envDefaults.sms_user_id ? 'env' : 'none');

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
    const row = await NotificationSettings.findOne({ where: { branch_id: null } });

    const envDefaults = {
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

    const [row, created] = await NotificationSettings.findOrCreate({
      where:    { branch_id: null },
      defaults: { ...DEFAULT_SETTINGS, ...update },
    });

    console.log('[updateSettings] created:', created, '| row id:', row.id);

    if (!created) {
      await row.update(update);
      console.log('[updateSettings] after update, appt_confirmed_sms:', row.appt_confirmed_sms);
    }

    const envDef = {
      sms_sender_id: process.env.SMS_SENDER_ID || '', sms_user_id: process.env.SMS_USER_ID || '', sms_api_key: process.env.SMS_API_KEY || '',
      twilio_account_sid: process.env.TWILIO_ACCOUNT_SID || '', twilio_auth_token: process.env.TWILIO_AUTH_TOKEN || '', twilio_whatsapp_from: process.env.TWILIO_WHATSAPP_FROM || '',
      smtp_host: process.env.EMAIL_HOST || 'smtp.gmail.com', smtp_port: process.env.EMAIL_PORT || '587',
      smtp_user: process.env.EMAIL_USER || '', smtp_pass: process.env.EMAIL_PASS || '', smtp_from: process.env.EMAIL_FROM || '',
    };
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

    const meta = {
      customer_name: 'Test Customer',
      event_type:    'test',
      branch_id:     branchId,
    };
    const date = new Date().toISOString().slice(0, 10);

    if (event_type === 'appointment_confirmed') {
      if (email) {
        await sendEmail({
          to:      email,
          subject: '[TEST] Appointment Confirmed — Zane Salon',
          html:    `<p>This is a test appointment confirmation from Zane Salon (${date}).</p>`,
          meta,
        });
      }
      if (phone) {
        await sendWhatsApp({
          to:      phone,
          message: `[TEST] ✂️ Zane Salon — Appointment Confirmed!\n\nHi Test Customer, this is a test notification (${date}).`,
          meta,
        });
      }
      if (sms || phone) {
        await sendSMS({
          to:      sms || phone,
          message: `[TEST] Zane Salon - Appt Confirmed! Hi Test Customer, test notification (${date}).`,
          meta,
        });
      }
    } else if (event_type === 'payment_receipt') {
      if (email) {
        await sendEmail({
          to:      email,
          subject: '[TEST] Payment Receipt — Zane Salon',
          html:    `<p>This is a test payment receipt from Zane Salon (${date}). Amount: Rs. 1,500.00</p>`,
          meta,
        });
      }
      if (phone) {
        await sendWhatsApp({
          to:      phone,
          message: `[TEST] 🧾 Zane Salon — Payment Receipt\n\nHi Test Customer! This is a test receipt (${date}).\n💰 Total Paid: Rs. 1,500.00`,
          meta,
        });
      }
      if (sms || phone) {
        await sendSMS({
          to:      sms || phone,
          message: `[TEST] Zane Salon - Receipt Hi Test Customer! Total: Rs. 1,500.00 (${date}).`,
          meta,
        });
      }
    } else if (event_type === 'loyalty_points') {
      if (phone) {
        await sendWhatsApp({
          to:      phone,
          message: `[TEST] 🌟 Zane Salon — Loyalty Points\n\nHey Test Customer! 🎉\nThis is a test loyalty update.\n• Earned this visit: +150 pts\n• Total balance: 350 pts`,
          meta,
        });
      }
      if (sms || phone) {
        await sendSMS({
          to:      sms || phone,
          message: `[TEST] Zane Salon - Loyalty Update! Earned: +150 pts. Balance: 350 pts.`,
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
    if (provider === 'smtp') {
      await sendEmail({
        to,
        subject: `✅ Zane Salon — SMTP Test (${date})`,
        html: `<div style="font-family:Arial,sans-serif;padding:24px;">
          <h2 style="color:#16A34A;">✅ SMTP Connection Successful!</h2>
          <p>This is a test email from <strong>Zane Salon</strong>.</p>
          <p style="color:#64748B;font-size:13px;">Sent at: ${date}</p>
        </div>`,
        meta: { customer_name: 'Test', event_type: 'test', branch_id: null },
      });
      return res.json({ message: `Test email sent to ${to}` });
    }

    if (provider === 'sms') {
      const result = await sendSMS({
        to,
        message: `[Zane Salon] SMS test successful! Sent at ${date}.`,
        meta: { customer_name: 'Test', event_type: 'test', branch_id: null },
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
        message: `✅ *Zane Salon* — WhatsApp test successful!\n\nSent at: ${date}`,
        meta: { customer_name: 'Test', event_type: 'test', branch_id: null },
      });
      return res.json({ message: `Test WhatsApp sent to ${to}` });
    }

    return res.status(400).json({ message: `Unknown provider: ${provider}. Use smtp, sms, or whatsapp.` });
  } catch (err) {
    console.error('[testProvider]', err);
    return res.status(500).json({ message: err.message || 'Send failed.' });
  }
};

// ── POST /api/notifications/offer-sms ──────────────────────────────────────────
const sendOfferSms = async (req, res) => {
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

    const where = { id: customerIds };
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

    for (const customer of customers) {
      const phone = String(customer.phone || '').trim();
      if (!phone) {
        skipped++;
        continue;
      }
      const result = await sendSMS({
        to: phone,
        message,
        meta: {
          customer_name: customer.name,
          event_type: 'test',
          branch_id: customer.branch_id || req.userBranchId || null,
        },
      });
      if (!result) skipped++;
      else if (result.status === 'failed') failed++;
      else sent++;
    }

    return res.json({
      message: `Offer SMS processed. Sent: ${sent}, Failed: ${failed}, Skipped: ${skipped}.`,
      totals: {
        requested: customerIds.length,
        matched: customers.length,
        sent,
        failed,
        skipped,
      },
    });
  } catch (err) {
    console.error('[sendOfferSms]', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

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
      subject: 'Appointment Confirmed — Zane Salon',
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
      body: `{branch_name}\nHi {customer_name}! Appointment booked.\nService: {service_name}\nDate: {date} | {time}\nBranch: {branch_name}\nThank you!`,
    },
  },
  appointment_completed: {
    sms: {
      body: `{branch_name}\nHi {customer_name}! Your {service_name} is done.\n{date} {time} | {branch_name}\nThank you for visiting!`,
    },
  },
  payment_receipt: {
    email: {
      subject: 'Payment Receipt — Zane Salon',
      body: `<h2 style="margin:0 0 8px;font-size:22px;color:#1e3a8a;">Payment Receipt 🧾</h2>
<p style="margin:0 0 24px;font-size:15px;color:#475569;">Hi <strong>{customer_name}</strong>, thank you for your payment. Here's your receipt:</p>
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#6b7280;width:40%;">📅 Date</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;font-weight:600;">{date}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#6b7280;">💇 Service</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;font-weight:600;">{service_name}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#6b7280;">🏠 Branch</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;font-weight:600;">{branch_name}</td></tr>
  <tr><td style="padding:10px 0;font-size:14px;color:#6b7280;">💰 Total Paid</td><td style="padding:10px 0;font-size:14px;color:#1e293b;font-weight:700;">{amount}</td></tr>
</table>
<p style="margin:28px 0 0;font-size:15px;color:#475569;">Thank you for visiting <strong>{branch_name}</strong>! 💜</p>`,
    },
    whatsapp: {
      body: `🧾 *{branch_name} — Payment Receipt*\n\nHi {customer_name}! Payment confirmed:\n\n💇 Service: {service_name}\n🏠 Branch: {branch_name}\n📅 Date: {date}\n💰 Total Paid: {amount}\n\nThank you for choosing {branch_name}! 💜`,
    },
    sms: {
      body: `{branch_name} - Receipt\nHi {customer_name}!\nPaid: {amount}\nService: {service_name} | {date}\nThank you!`,
    },
  },
  loyalty_points: {
    whatsapp: {
      body: `🌟 *{branch_name} — Loyalty Points Update*\n\nHey {customer_name}! 🎉\n\nYou just earned *+{points_earned} points* at *{branch_name}*!\n\n📊 Points Balance:\n  • Earned this visit: +{points_earned}\n  • Total balance: *{points_total} pts*\n\n💡 Every 10 pts = Rs. 1 discount on your next visit!\n\nKeep visiting {branch_name} to unlock more rewards. 🛍️`,
    },
    sms: {
      body: `{branch_name}\nHi {customer_name}! You earned +{points_earned} loyalty points.\nTotal: {points_total} pts. Every 10 pts = Rs. 1 discount!`,
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

    const rows = await MessageTemplate.findAll({ where: { tenant_id: tenantId || null } });
    const dbMap = {};
    for (const r of rows) {
      if (!dbMap[r.event_type]) dbMap[r.event_type] = {};
      dbMap[r.event_type][r.channel] = { id: r.id, subject: r.subject, body: r.body, is_active: r.is_active };
    }

    const result = [];
    for (const [event_type, channels] of Object.entries(DEFAULT_TEMPLATES)) {
      for (const [channel, defaults] of Object.entries(channels)) {
        const custom = dbMap[event_type]?.[channel];
        result.push({
          event_type,
          channel,
          subject:   custom ? custom.subject  : (defaults.subject  || null),
          body:      custom ? custom.body     : defaults.body,
          is_active: custom ? custom.is_active : true,
          is_custom: !!custom,
          id:        custom ? custom.id        : null,
        });
      }
    }

    return res.json({ templates: result, defaults: DEFAULT_TEMPLATES });
  } catch (err) {
    console.error('[listTemplates]', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/notifications/templates — upsert ────────────────────────────────
const saveTemplate = async (req, res) => {
  try {
    const { MessageTemplate } = require('../models');
    const { resolveTenantId } = require('../utils/tenantScope');
    const tenantId = resolveTenantId(req);

    const { event_type, channel, subject, body, is_active } = req.body;
    if (!event_type || !channel || !body) {
      return res.status(400).json({ message: 'event_type, channel, and body are required.' });
    }
    if (!DEFAULT_TEMPLATES[event_type]?.[channel]) {
      return res.status(400).json({ message: 'Invalid event_type / channel combination.' });
    }

    const [row] = await MessageTemplate.upsert(
      {
        event_type,
        channel,
        subject: subject || null,
        body,
        is_active: is_active !== false,
        tenant_id: tenantId || null,
      },
      { conflictFields: ['event_type', 'channel', 'tenant_id'] }
    );

    return res.json({ ok: true, template: row });
  } catch (err) {
    console.error('[saveTemplate]', err);
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
  sendOfferSms,
  sendStaffMonthlyEarnings,
  testStaffEarningsPdf,
  listTemplates,
  saveTemplate,
  deleteTemplate,
  DEFAULT_TEMPLATES,
};
