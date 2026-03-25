'use strict';
const { Op } = require('sequelize');
const { NotificationLog, NotificationSettings } = require('../models');
const { sendEmail, sendWhatsApp, sendSMS } = require('../services/notificationService');

const DEFAULT_SETTINGS = {
  appt_confirmed_email:     true,
  appt_confirmed_whatsapp:  true,
  appt_confirmed_sms:       false,
  payment_receipt_email:    true,
  payment_receipt_whatsapp: true,
  payment_receipt_sms:      false,
  loyalty_points_whatsapp:  true,
  loyalty_points_sms:       false,
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

    const where = {};
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
    });

    return res.json({ total: count, page, limit, data: rows });
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

    const [row, created] = await NotificationSettings.findOrCreate({
      where:    { branch_id: null },
      defaults: { ...DEFAULT_SETTINGS, ...update },
    });

    if (!created) await row.update(update);

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
      await sendSMS({
        to,
        message: `[Zane Salon] SMS test successful! Sent at ${date}.`,
        meta: { customer_name: 'Test', event_type: 'test', branch_id: null },
      });
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

module.exports = { getLogs, getSettings, updateSettings, sendTest, testProvider };
