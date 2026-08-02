'use strict';

const nodemailer = require('nodemailer');
const twilio     = require('twilio');

// ── Lazy model loader — avoids circular require on startup ────────────────────
let _models = null;
function getModels() {
  if (!_models) _models = require('../models');
  return _models;
}

// ── SMTP resolver: tenant DB → platform DB (tenant_id=null) → env fallback ────
async function resolveSmtpConfig(tenantId = null) {
  try {
    const { NotificationSettings } = getModels();
    // 1. Tenant-specific SMTP
    if (tenantId) {
      const tenantRow = await NotificationSettings.findOne({ where: { branch_id: null, tenant_id: tenantId } });
      if (tenantRow && tenantRow.smtp_user && tenantRow.smtp_pass) {
        return {
          host: tenantRow.smtp_host || process.env.EMAIL_HOST || 'smtp.gmail.com',
          port: parseInt(tenantRow.smtp_port || process.env.EMAIL_PORT || 587),
          user: tenantRow.smtp_user,
          pass: tenantRow.smtp_pass,
          from: tenantRow.smtp_from || tenantRow.smtp_user,
        };
      }
    }
    // 2. Platform-level SMTP
    const row = await NotificationSettings.findOne({ where: { branch_id: null, tenant_id: null } });
    if (row && row.smtp_user && row.smtp_pass) {
      return {
        host: row.smtp_host || process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(row.smtp_port || process.env.EMAIL_PORT || 587),
        user: row.smtp_user,
        pass: row.smtp_pass,
        from: row.smtp_from || row.smtp_user,
      };
    }
  } catch { /* fall through */ }
  // 3. Env fallback
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return {
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || 587),
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    };
  }
  return null;
}

// ── Twilio client (lazy) ──────────────────────────────────────────────────────
let _twilioClient = null;
function getTwilio() {
  if (_twilioClient) return _twilioClient;
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  _twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return _twilioClient;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatWhatsApp(phone) {
  if (!phone) return null;
  if (phone.startsWith('whatsapp:')) return phone;
  return `whatsapp:+${phone.replace(/\D/g, '')}`;
}

function loyaltyTier(points) {
  if (points >= 500) return { name: 'Gold ✨',    emoji: '🏆' };
  if (points >= 200) return { name: 'Silver 🥈',  emoji: '⭐' };
  return                     { name: 'Bronze 🥉',  emoji: '🌟' };
}

// ── Log writer ────────────────────────────────────────────────────────────────
async function writeLog({ customer_name, phone, email, event_type, channel, message_preview, status, error_message, branch_id, tenant_id }) {
  try {
    const { NotificationLog } = getModels();
    await NotificationLog.create({
      customer_name:   customer_name  || null,
      phone:           (channel === 'whatsapp' || channel === 'sms') ? (phone || null) : null,
      email:           channel === 'email' ? (email || null) : null,
      event_type,
      channel,
      message_preview: String(message_preview || '').slice(0, 255),
      status,
      error_message:   error_message || null,
      branch_id:       branch_id     || null,
      tenant_id:       tenant_id     || null,
    });
  } catch (err) {
    console.error('[Notifications] Log write failed:', err.message);
  }
}

// ── Settings loader ───────────────────────────────────────────────────────────
const DEFAULT_FLAGS = {
  appt_confirmed_email:      true,
  appt_confirmed_whatsapp:   true,
  // Match NotificationSettings default — SMS off unless salon enables it.
  appt_confirmed_sms:        false,
  payment_receipt_email:     true,
  payment_receipt_whatsapp:  true,
  payment_receipt_sms:       true,
  loyalty_points_whatsapp:   true,
  loyalty_points_sms:        false,
  customer_registered_sms:   false,
  customer_registered_email: false,
  appt_completed_sms:        true,
  appt_completed_whatsapp:   true,
  walkin_checkin_whatsapp:   true,
  walkin_serving_whatsapp:   true,
  walkin_completed_whatsapp: true,
  walkin_checkin_sms:        false,
  walkin_serving_sms:        false,
  walkin_completed_sms:      false,
  recurring_reminder_sms:    true,
  recurring_reminder_whatsapp: true,
  // Notify assigned staff when a booking is created/confirmed
  staff_appt_assigned_whatsapp: true,
};

function resolveNotifyTenantId(explicit, ...sources) {
  if (explicit != null) return explicit;
  for (const src of sources) {
    if (src?.tenant_id != null) return src.tenant_id;
  }
  return null;
}

async function getChannelFlags(tenantId = null) {
  try {
    const { NotificationSettings } = getModels();
    const row = await NotificationSettings.findOne({
      where: { branch_id: null, tenant_id: tenantId || null },
    });
    if (!row) return DEFAULT_FLAGS;
    const out = {};
    for (const k of Object.keys(DEFAULT_FLAGS)) out[k] = row[k] ?? DEFAULT_FLAGS[k];
    return out;
  } catch {
    return DEFAULT_FLAGS;
  }
}

// ── Template helpers ──────────────────────────────────────────────────────────
function getDefaultTemplate(event_type, channel) {
  try {
    const { DEFAULT_TEMPLATES } = require('../controllers/notificationController');
    const def = DEFAULT_TEMPLATES[event_type]?.[channel];
    return def ? { subject: def.subject || null, body: def.body } : null;
  } catch {
    return null;
  }
}

/** Replace {variable} placeholders in a template string. */
function interpolate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));
}

/**
 * Fetch template for event + channel + tenantId.
 * Prefer the selected default custom; else any active custom; else built-in system default.
 */
async function getTemplate(event_type, channel, tenantId) {
  try {
    const { MessageTemplate } = getModels();
    const tid = tenantId || null;
    const baseWhere = {
      event_type,
      channel,
      tenant_id: tid,
      is_active: true,
    };

    // 1) Explicitly selected custom template
    let row = await MessageTemplate.findOne({
      where: { ...baseWhere, is_default: true },
      order: [['id', 'ASC']],
    });

    // 2) Any active custom for this event/channel (covers save-without-select)
    if (!row) {
      row = await MessageTemplate.findOne({
        where: baseWhere,
        order: [['updatedAt', 'DESC'], ['id', 'DESC']],
      });
    }

    if (row) return { subject: row.subject, body: row.body };
    return getDefaultTemplate(event_type, channel);
  } catch {
    return getDefaultTemplate(event_type, channel);
  }
}

/**
 * Look up a template chosen at send time (e.g. picked in Record Payment).
 * Returns null when no template was chosen or it is no longer usable.
 */
async function resolveChosenTemplate(templateId, event_type, tenantId) {
  const id = parseInt(templateId, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  try {
    const { MessageTemplate } = getModels();
    const row = await MessageTemplate.findOne({
      where: { id, event_type, tenant_id: tenantId || null, is_active: true },
    });
    if (!row) return null;
    return { channel: row.channel, subject: row.subject, body: row.body };
  } catch {
    return null;
  }
}

// ── SMS credentials: tenant DB → platform DB (tenant_id=null) → env fallback ─
function smsCredsFromRow(row) {
  if (!row) return null;
  const provider = String(row.sms_provider || 'notify_lk').toLowerCase();
  const apiKey = row.sms_api_key?.trim();
  if (!apiKey) return null;
  if (provider === 'textit') {
    return {
      provider: 'textit',
      apiKey,
      senderId: row.sms_sender_id?.trim() || process.env.SMS_SENDER_ID || null,
      userId: null,
    };
  }
  const userId = row.sms_user_id?.trim();
  if (!userId) return null;
  return {
    provider: 'notify_lk',
    userId,
    apiKey,
    senderId: row.sms_sender_id?.trim() || process.env.SMS_SENDER_ID || null,
  };
}

function smsCredsFromEnv() {
  const provider = String(process.env.SMS_PROVIDER || 'notify_lk').toLowerCase();
  if (provider === 'textit') {
    if (!process.env.SMS_API_KEY) return null;
    return {
      provider: 'textit',
      apiKey: process.env.SMS_API_KEY,
      senderId: process.env.SMS_SENDER_ID || null,
      userId: null,
    };
  }
  if (process.env.SMS_USER_ID && process.env.SMS_API_KEY) {
    return {
      provider: 'notify_lk',
      userId: process.env.SMS_USER_ID,
      apiKey: process.env.SMS_API_KEY,
      senderId: process.env.SMS_SENDER_ID || null,
    };
  }
  return null;
}

async function getSMSCreds(tenantId = null, { allowPlatformFallback = true } = {}) {
  try {
    const { NotificationSettings } = getModels();
    // 1. Tenant-specific SMS (saved on Notifications page per salon)
    if (tenantId) {
      const tenantRow = await NotificationSettings.findOne({ where: { branch_id: null, tenant_id: tenantId } });
      const tenantCreds = smsCredsFromRow(tenantRow);
      if (tenantCreds) return tenantCreds;
      // Tenant scoped send should not silently bill platform SMS unless allowed.
      if (!allowPlatformFallback) return null;
    }
    // 2. Platform-level SMS
    const row = await NotificationSettings.findOne({ where: { branch_id: null, tenant_id: null } });
    const platformCreds = smsCredsFromRow(row);
    if (platformCreds) return platformCreds;
  } catch { /* fall through */ }
  // 3. Env fallback
  return smsCredsFromEnv();
}

function formatSmsTo94(to) {
  const digits = String(to || '').replace(/\D/g, '');
  const local = digits.startsWith('94') ? digits.slice(2)
    : digits.startsWith('0') ? digits.slice(1)
    : digits;
  return '94' + local.slice(-9);
}

/** GSM-7 basic + extension set used for segment billing. */
const GSM_CHAR_RE = /^[\x00-\x7F]*$/;
const GSM_EXTENDED = new Set(['^', '{', '}', '\\', '[', ']', '~', '|', '€']);

function normalizeSmsBody(message) {
  return String(message || '')
    .replace(/[–—−]/g, '-')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[•·]/g, '-')
    .replace(/[…]/g, '...')
    .replace(/[×]/g, 'x')
    .replace(/[÷]/g, '/')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Strip emoji / symbols that force Unicode multiparts (cost x2+)
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u2600-\u27BF]/g, '')
    .trim();
}

/**
 * Estimate billed SMS parts.
 * GSM: 160 / 153; Unicode: 70 / 67.
 */
function estimateSmsSegments(message) {
  const text = normalizeSmsBody(message);
  if (!text) return { chars: 0, encoding: 'gsm', segments: 0, isUnicode: false };
  const isUnicode = !GSM_CHAR_RE.test(text);
  if (isUnicode) {
    const chars = [...text].length;
    const segments = chars <= 70 ? 1 : Math.ceil(chars / 67);
    return { chars, encoding: 'unicode', segments, isUnicode: true };
  }
  let units = 0;
  for (const ch of text) units += GSM_EXTENDED.has(ch) ? 2 : 1;
  const segments = units <= 160 ? 1 : Math.ceil(units / 153);
  return { chars: text.length, encoding: 'gsm', segments, isUnicode: false };
}

// ── Core senders ──────────────────────────────────────────────────────────────

/**
 * Send an HTML email. Logs result to notification_logs. Never throws.
 * @param {{ to, subject, html, meta? }} opts
 *   meta = { customer_name, event_type, branch_id } used for the log row
 */
async function sendEmail({ to, subject, html, meta = {}, tenantId = null, attachments }) {
  if (!to) return;
  const smtpConf = await resolveSmtpConfig(tenantId);
  if (!smtpConf) {
    console.warn('[Notifications] Email skipped — no SMTP configured (set via Platform Admin → SMTP & SMS or .env).');
    return;
  }
  const transporter = nodemailer.createTransport({
    host:   smtpConf.host,
    port:   smtpConf.port,
    secure: smtpConf.port === 465,
    auth:   { user: smtpConf.user, pass: smtpConf.pass },
    tls:    { rejectUnauthorized: false },
  });
  // Ensure from always contains an email address
  const fromRaw = smtpConf.from || smtpConf.user;
  const fromAddr = (fromRaw && fromRaw.includes('@')) ? fromRaw : (fromRaw ? `${fromRaw} <${smtpConf.user}>` : smtpConf.user);
  let status = 'sent', errorMsg = null;
  try {
    await transporter.sendMail({
      from:        fromAddr,
      to,
      subject,
      html,
      ...(attachments ? { attachments } : {}),
    });
    console.log(`[Notifications] Email sent → ${to}`);
  } catch (err) {
    status   = 'failed';
    errorMsg = err.message;
    console.error(`[Notifications] Email failed → ${to}:`, err.message);
  }
  await writeLog({
    ...meta,
    channel:         'email',
    email:           to,
    message_preview: subject,
    status,
    error_message:   errorMsg,
  });
}

/**
 * Send an SMS via Notify.lk or Textit.biz. Logs result. Never throws.
 * @param {{ to, message, meta?, tenantId? }} opts
 */
async function sendSMS({ to, message, meta = {}, tenantId = null, allowPlatformFallback }) {
  if (!to) return null;
  const tid = tenantId || meta.tenant_id || null;
  // Tenant transactional SMS: do not fall back to platform account (stops Hexaone SMS bill).
  // Set SMS_PLATFORM_FALLBACK=1 to restore old billing-to-platform behaviour.
  const fallbackAllowed = allowPlatformFallback != null
    ? !!allowPlatformFallback
    : (tid == null ? true : process.env.SMS_PLATFORM_FALLBACK === '1');
  const creds = await getSMSCreds(tid, { allowPlatformFallback: fallbackAllowed });
  if (!creds) {
    console.warn(
      tid
        ? `[Notifications] SMS skipped — tenant ${tid} has no SMS credentials (platform fallback disabled).`
        : '[Notifications] SMS skipped — SMS credentials not configured.'
    );
    return null;
  }
  const provider = creds.provider || 'notify_lk';
  if (provider === 'notify_lk' && !creds.senderId) {
    console.warn('[Notifications] SMS skipped — SMS Sender ID not configured.');
    return null;
  }
  // Prefer GSM-7: strip fancy punctuation/emoji that force multi-part unicode billing.
  const smsBody = normalizeSmsBody(message);
  const segInfo = estimateSmsSegments(smsBody);
  if (segInfo.segments > 1) {
    console.warn(
      `[Notifications] SMS will bill ~${segInfo.segments} parts (${segInfo.encoding}, ${segInfo.chars} chars) → ${to}`
    );
  }
  const toFormatted = formatSmsTo94(to);
  let status = 'sent', errorMsg = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let res;
    try {
      if (provider === 'textit') {
        // Textit.biz REST API — Key only (Authorization: Basic <API_KEY>)
        // https://textit.biz/integration_REST_API.php
        res = await fetch('https://api.textit.biz/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: '*/*',
            'X-API-VERSION': 'v1',
            Authorization: `Basic ${creds.apiKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({ to: toFormatted, text: smsBody }),
        });
      } else {
        const isUnicode = segInfo.isUnicode;
        res = await fetch('https://app.notify.lk/api/v1/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            user_id: creds.userId,
            api_key: creds.apiKey,
            sender_id: creds.senderId,
            to: toFormatted,
            message: smsBody,
            ...(isUnicode ? { type: 'unicode' } : {}),
          }),
        });
      }
    } finally {
      clearTimeout(timer);
    }
    const raw = await res.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    console.log(`[Notifications] SMS (${provider}) response → ${toFormatted}:`, JSON.stringify(data));
    if (provider === 'textit') {
      if (!res.ok || data.status === 'error' || data.success === false || data.Status === 'Error') {
        throw new Error(data.message || data.error || data.raw || `HTTP ${res.status}`);
      }
    } else if (!res.ok || data.status === 'error') {
      const errMsg = (Array.isArray(data.errors) && data.errors[0]) || data.message || `HTTP ${res.status}`;
      throw new Error(errMsg);
    }
    console.log(
      `[Notifications] SMS sent via ${provider} → ${toFormatted} (~${segInfo.segments} part(s), ${segInfo.encoding})`
    );
  } catch (err) {
    status = 'failed';
    errorMsg = err.name === 'AbortError' ? 'SMS gateway timeout (15s)' : err.message;
    console.error(`[Notifications] SMS failed → ${toFormatted}:`, errorMsg);
  }
  await writeLog({
    ...meta,
    tenant_id: meta.tenant_id ?? tid,
    channel: 'sms',
    phone: to,
    message_preview: smsBody.slice(0, 255),
    status,
    error_message: errorMsg,
  });
  return { status, error: errorMsg, segments: segInfo.segments, encoding: segInfo.encoding };
}

/**
 * Send a WhatsApp message — QR session first, then Twilio fallback.
 * @param {{ to, message, meta?, tenantId? }} opts
 */
async function sendWhatsApp({ to, message, meta = {}, tenantId = null }) {
  if (!to) return;
  const tid = tenantId || meta.tenant_id;

  if (tid) {
    try {
      const whatsappWeb = require('./whatsappWebService');
      if (whatsappWeb.isConnected(tid)) {
        let status = 'sent';
        let errorMsg = null;
        try {
          await whatsappWeb.sendViaQr(tid, to, message, meta);
          console.log(`[Notifications] WhatsApp (QR) sent → ${to}`);
        } catch (err) {
          status = 'failed';
          errorMsg = err.message;
          console.error(`[Notifications] WhatsApp (QR) failed → ${to}:`, err.message);
        }
        await writeLog({
          ...meta,
          channel: 'whatsapp',
          phone: to,
          message_preview: message.slice(0, 255),
          status,
          error_message: errorMsg,
        });
        if (status === 'sent') return;
      }
    } catch (err) {
      console.warn('[Notifications] WhatsApp QR path error:', err.message);
    }
  }

  const client = getTwilio();
  if (!client) {
    console.warn('[Notifications] WhatsApp skipped — not connected via QR and Twilio not configured.');
    return;
  }
  const from        = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
  const toFormatted = formatWhatsApp(to);
  if (!toFormatted) return;
  let status = 'sent', errorMsg = null;
  try {
    await client.messages.create({ from, to: toFormatted, body: message });
    console.log(`[Notifications] WhatsApp (Twilio) sent → ${toFormatted}`);
  } catch (err) {
    status   = 'failed';
    errorMsg = err.message;
    console.error(`[Notifications] WhatsApp (Twilio) failed → ${toFormatted}:`, err.message);
  }
  await writeLog({
    ...meta,
    channel:         'whatsapp',
    phone:           to,
    message_preview: message.slice(0, 255),
    status,
    error_message:   errorMsg,
  });
}

// ── HTML escaping helper ─────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── Email HTML builder ────────────────────────────────────────────────────────
function buildEmailWrapper(title, bodyHtml, branchName = 'HEXAONE', branchPhone = '') {
  const safeBranchName  = escapeHtml(branchName);
  const safeBranchPhone = escapeHtml(branchPhone);
  const safeTitle       = escapeHtml(title);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7ff;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7ff;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#1a0a2e 0%,#4a1a6e 50%,#c9a96e 100%);padding:32px 40px;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">✂️</div>
            <h1 style="margin:0;font-size:28px;font-weight:800;color:#c9a96e;letter-spacing:2px;">HEXAONE</h1>
            <p style="margin:6px 0 0;font-size:13px;color:#e8d5b0;letter-spacing:1px;">Smart Salon Management System</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">${bodyHtml}</td>
        </tr>
        <tr>
          <td style="background:#f8faff;padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">
              <strong style="color:#7c3aed;">${safeBranchName}</strong>
              ${safeBranchPhone ? ` &nbsp;·&nbsp; 📞 ${safeBranchPhone}` : ''}
            </p>
            <p style="margin:0;font-size:11px;color:#9ca3af;">
              You're receiving this because you booked a service with us.
              Reply STOP to unsubscribe from WhatsApp messages.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function detailRow(label, value) {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#6b7280;width:40%;">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;font-weight:600;">${value}</td>
  </tr>`;
}

// ── 1. Appointment Confirmed ──────────────────────────────────────────────────
async function notifyAppointmentConfirmed(appointment, branch, service, tenantId) {
  const tid = resolveNotifyTenantId(tenantId, appointment, branch);
  const flags = await getChannelFlags(tid);
  const phone = appointment.phone        || null;
  const email = appointment.email        || null;
  if (!phone && !email) return;

  const date    = appointment.date   || '—';
  const time    = appointment.time   ? appointment.time.slice(0, 5) : '—';
  const amount  = appointment.amount ? `Rs. ${parseFloat(appointment.amount).toFixed(2)}` : '—';
  const svcName = service?.name      || '—';
  const brName  = branch?.name       || '—';
  const brPhone = branch?.phone      || '';
  const meta    = {
    customer_name: appointment.customer_name,
    event_type:    'appointment_confirmed',
    branch_id:     branch?.id || appointment.branch_id,
    tenant_id:     tid,
  };
  const vars = {
    customer_name: appointment.customer_name,
    date,
    time,
    service_name: svcName,
    branch_name: brName,
    amount,
  };

  if (email && flags.appt_confirmed_email) {
    const tpl = await getTemplate('appointment_confirmed', 'email', tid);
    const subject = tpl ? interpolate(tpl.subject || 'Appointment Confirmed — HEXAONE', vars) : 'Appointment Confirmed — HEXAONE';
    const bodyHtml = tpl ? interpolate(tpl.body, vars) : `
      <h2 style="margin:0 0 8px;font-size:22px;color:#7c3aed;">Appointment Confirmed! 🎉</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;">
        Hi <strong>${appointment.customer_name}</strong>, your appointment has been confirmed.
        Here are the details:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${detailRow('📅 Date',    date)}
        ${detailRow('⏰ Time',    time)}
        ${detailRow('💇 Service', svcName)}
        ${detailRow('🏠 Branch',  brName)}
        ${detailRow('💰 Amount',  amount)}
      </table>
      <div style="margin:28px 0;padding:16px 20px;background:#f5f0ff;border-left:4px solid #7c3aed;border-radius:4px;">
        <p style="margin:0;font-size:14px;color:#5b21b6;">📌 Please arrive 5 minutes early. Contact us if you need to reschedule.</p>
      </div>
      <p style="margin:0;font-size:15px;color:#475569;">Thank you for choosing <strong>HEXAONE</strong>! See you soon. ✨</p>`;
    await sendEmail({
      to:      email,
      subject,
      html:    buildEmailWrapper(subject, bodyHtml, brName, brPhone),
      meta,
      tenantId: tid,
    });
  }

  if (phone && flags.appt_confirmed_whatsapp) {
    const tpl = await getTemplate('appointment_confirmed', 'whatsapp', tid);
    const msg = tpl
      ? interpolate(tpl.body, vars)
      : `✂️ *HEXAONE — Appointment Confirmed!*\n\n` +
        `Hi ${appointment.customer_name}, your booking is confirmed:\n\n` +
        `📅 Date: ${date}\n⏰ Time: ${time}\n💇 Service: ${svcName}\n🏠 Branch: ${brName}\n💰 Amount: ${amount}\n\n` +
        `Please arrive 5 mins early. See you soon! 😊`;
    await sendWhatsApp({ to: phone, message: msg, meta, tenantId: tid });
  }

  if (phone && flags.appt_confirmed_sms) {
    const tpl = await getTemplate('appointment_confirmed', 'sms', tid);
    const smsMsg = tpl
      ? interpolate(tpl.body, vars)
      : `${brName}: Hi ${appointment.customer_name}, booked ${svcName} on ${date} ${time}. See you!`;
    await sendSMS({ to: phone, message: smsMsg, meta, tenantId: tid });
  }
}

/**
 * WhatsApp to assigned staff when they get a new appointment.
 */
async function notifyStaffAppointmentAssigned(appointment, branch, service, tenantId) {
  try {
    const tid = resolveNotifyTenantId(tenantId, appointment, branch);
    const flags = await getChannelFlags(tid);
    if (!flags.staff_appt_assigned_whatsapp) return;

    const staffId = appointment.staff_id;
    if (!staffId) return;

    const { Staff } = getModels();
    const staff = await Staff.findByPk(staffId);
    if (!staff || !staff.phone) return;

    const rawDate = appointment.date || appointment.appointment_date || '';
    const date = rawDate
      ? (typeof rawDate === 'string' ? rawDate.slice(0, 10) : rawDate.toISOString().slice(0, 10))
      : '—';
    const rawTime = appointment.time || appointment.appointment_time || '';
    const time = rawTime ? String(rawTime).slice(0, 5) : '—';
    const svcName = service?.name || appointment.service_name || 'Service';
    const brName = branch?.name || 'Salon';
    const amountNum = Number(appointment.amount ?? appointment.total_amount ?? service?.price ?? 0);
    const amount = Number.isFinite(amountNum) ? `Rs. ${amountNum.toFixed(2)}` : '—';
    const staffName = staff.name || 'there';
    const customerName = appointment.customer_name || 'Customer';

    const vars = {
      staff_name: staffName,
      customer_name: customerName,
      service_name: svcName,
      date,
      time,
      amount,
      branch_name: brName,
    };

    const meta = {
      event_type: 'staff_appointment_assigned',
      related_id: appointment.id,
      related_type: 'appointment',
      customer_name: customerName,
      branch_id: branch?.id || appointment.branch_id || null,
      tenant_id: tid,
    };

    const tpl = await getTemplate('staff_appointment_assigned', 'whatsapp', tid);
    const msg = tpl
      ? interpolate(tpl.body, vars)
      : `*${brName} — New Appointment*\n` +
        `Hi ${staffName}, you have a new appointment:\n\n` +
        `Customer: ${customerName}\n` +
        `Service: ${svcName}\n` +
        `Date: ${date}\n` +
        `Time: ${time}\n` +
        `Amount: ${amount}\n` +
        `Branch: ${brName}`;

    await sendWhatsApp({ to: staff.phone, message: msg, meta, tenantId: tid });
  } catch (err) {
    console.error('[notify] staff appointment WhatsApp failed:', err.message);
  }
}

// ── 2. Appointment Completed ────────────────────────────────────────────────
async function notifyAppointmentCompleted(appointment, branch, service, tenantId) {
  const tid = resolveNotifyTenantId(tenantId, appointment, branch);
  const flags = await getChannelFlags(tid);
  const phone = appointment.phone || null;
  if (!phone) return;

  const date    = appointment.date || '—';
  const time    = appointment.time ? appointment.time.slice(0, 5) : '—';
  const svcName = service?.name   || '—';
  const brName  = branch?.name    || '—';
  const meta    = {
    customer_name: appointment.customer_name,
    event_type:    'appointment_completed',
    branch_id:     branch?.id || appointment.branch_id,
    tenant_id:     tid,
  };
  const vars = { customer_name: appointment.customer_name, date, time, service_name: svcName, branch_name: brName };

  if (flags.appt_completed_whatsapp) {
    const tpl = await getTemplate('appointment_completed', 'whatsapp', tid);
    const msg = tpl
      ? interpolate(tpl.body, vars)
      : `✅ *HEXAONE — Service Complete*\n\nHi ${appointment.customer_name}! Your ${svcName} is done.\n📅 ${date} ${time}\n🏠 ${brName}\n\nThank you for visiting! 🙏`;
    await sendWhatsApp({ to: phone, message: msg, meta, tenantId: tid });
  }

  if (flags.appt_completed_sms) {
    const tpl = await getTemplate('appointment_completed', 'sms', tid);
    const smsMsg = tpl
      ? interpolate(tpl.body, vars)
      : `${brName}: Hi ${appointment.customer_name}, ${svcName} done on ${date}. Thank you!`;
    await sendSMS({ to: phone, message: smsMsg, meta, tenantId: tid });
  }
}

// ── 3. Payment Receipt ────────────────────────────────────────────────────────
function buildPaymentReceiptVars(payment, branch, service, customer) {
  const customerName = customer?.name || payment.customer_name || 'Valued Customer';
  const brName       = branch?.name   || '—';
  const svcName      = service?.name  || '—';
  const paid         = parseFloat(payment.total_amount || 0);
  const amount       = `Rs. ${paid.toFixed(2)}`;
  const discount     = parseFloat(payment.loyalty_discount || 0);
  const promoDisc    = parseFloat(payment.promo_discount || 0);
  const pointsEarned = payment.points_earned || 0;
  const pointsTotal  = customer?.loyalty_points ?? 0;
  const date         = payment.date || new Date().toISOString().slice(0, 10);
  const splits       = payment.splits || [];
  const walkinToken  = payment.walkin_token || '';

  const paymentMethods = splits.length
    ? splits.map((s) => `${s.method}: Rs. ${parseFloat(s.amount).toFixed(2)}`).join('\n')
    : '';

  const loyaltyLines = [];
  if (walkinToken) loyaltyLines.push(`🎫 Ticket: ${walkinToken}`);
  if (promoDisc > 0) {
    const pStr = promoDisc % 1 === 0 ? promoDisc.toFixed(0) : promoDisc.toFixed(2);
    loyaltyLines.push(`🏷️ Promo discount: Rs. ${pStr}`);
  }
  if (discount > 0) {
    const ptsUsed = Math.floor(discount);
    const dStr = discount % 1 === 0 ? discount.toFixed(0) : discount.toFixed(2);
    loyaltyLines.push(`🎁 Loyalty discount: Rs. ${dStr}${ptsUsed > 0 ? ` (-${ptsUsed} pts)` : ''}`);
  }
  if (pointsEarned > 0) loyaltyLines.push(`🌟 Points earned: +${pointsEarned}`);
  if (pointsTotal > 0) loyaltyLines.push(`📊 Total points: ${pointsTotal} pts`);

  const loyalty_section = loyaltyLines.length ? `\n${loyaltyLines.join('\n')}` : '';
  const ticket_line = walkinToken ? `Ticket: ${walkinToken}\n` : '';

  return {
    customer_name: customerName,
    branch_name: brName,
    service_name: svcName,
    date,
    amount,
    points_earned: String(pointsEarned),
    points_total: String(pointsTotal),
    loyalty_discount: discount > 0 ? `Rs. ${discount.toFixed(2)}` : '',
    promo_discount: promoDisc > 0 ? `Rs. ${promoDisc.toFixed(2)}` : '',
    walkin_token: walkinToken,
    payment_methods: paymentMethods,
    loyalty_section,
    ticket_line,
  };
}

async function notifyPaymentReceipt(payment, branch, service, customer, tenantId) {
  const tid = resolveNotifyTenantId(tenantId, payment, branch, customer);
  const flags = await getChannelFlags(tid);
  const phone = customer?.phone || null;
  const email = customer?.email || null;
  if (!phone && !email) return;

  const vars = buildPaymentReceiptVars(payment, branch, service, customer);
  const brPhone = branch?.phone || '';
  const discount = parseFloat(payment.loyalty_discount || 0);
  const pointsEarned = payment.points_earned || 0;
  const splits = payment.splits || [];
  const total = vars.amount;
  const meta = {
    customer_name: vars.customer_name,
    event_type:    'payment_receipt',
    branch_id:     branch?.id || payment.branch_id,
    tenant_id:     tid,
  };

  const splitRows = splits.length
    ? splits.map((s) => detailRow(`💳 ${s.method}`, `Rs. ${parseFloat(s.amount).toFixed(2)}`)).join('')
    : detailRow('💳 Payment', total);

  if (email && flags.payment_receipt_email) {
    const tpl = await getTemplate('payment_receipt', 'email', tid);
    let subject, bodyHtml;
    if (tpl) {
      subject  = interpolate(tpl.subject || 'Payment Receipt — HEXAONE', vars);
      bodyHtml = interpolate(tpl.body, vars);
    } else {
      subject  = 'Payment Receipt — HEXAONE';
      bodyHtml = `
      <h2 style="margin:0 0 8px;font-size:22px;color:#7c3aed;">Payment Receipt 🧾</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;">
        Hi <strong>${vars.customer_name}</strong>, here's your receipt:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${detailRow('📅 Date',    vars.date)}
        ${detailRow('💇 Service', vars.service_name)}
        ${detailRow('🏠 Branch',  vars.branch_name)}
        ${splitRows}
        ${discount > 0 ? detailRow('🎁 Loyalty Discount', `- ${vars.loyalty_discount}`) : ''}
        <tr>
          <td style="padding:14px 0 4px;font-size:16px;color:#1e293b;font-weight:700;border-top:2px solid #e2e8f0;" colspan="2">
            Total Paid: <span style="float:right;color:#7c3aed;">${total}</span>
          </td>
        </tr>
      </table>
      ${pointsEarned > 0 ? `
      <div style="margin:24px 0;padding:16px 20px;background:#f0fdf4;border-left:4px solid #22c55e;border-radius:4px;">
        <p style="margin:0;font-size:14px;color:#166534;">🌟 You earned <strong>${pointsEarned} loyalty points</strong> — balance: <strong>${vars.points_total} pts</strong></p>
      </div>` : ''}`;
    }
    await sendEmail({
      to:      email,
      subject,
      html:    buildEmailWrapper(subject, bodyHtml, vars.branch_name, brPhone),
      meta,
      tenantId: tid,
    });
  }

  if (phone && flags.payment_receipt_whatsapp) {
    const tpl = await getTemplate('payment_receipt', 'whatsapp', tid);
    const msg = tpl
      ? interpolate(tpl.body, vars)
      : `🧾 *${vars.branch_name} — Payment Receipt*\n\nHi ${vars.customer_name}!\n\n💇 Service: ${vars.service_name}\n🏠 Branch: ${vars.branch_name}\n📅 Date: ${vars.date}\n💰 Paid: ${vars.amount}${vars.payment_methods ? `\n💳 ${vars.payment_methods.replace(/\n/g, '\n💳 ')}` : ''}${vars.loyalty_section}`;
    await sendWhatsApp({ to: phone, message: msg, meta, tenantId: tid });
  }

  if (phone && flags.payment_receipt_sms) {
    const tpl = await getTemplate('payment_receipt', 'sms', tid);
    const smsMsg = tpl
      ? interpolate(tpl.body, vars)
      : `${vars.branch_name} - Receipt\n${vars.ticket_line}Hi ${vars.customer_name}!\nPaid: ${vars.amount}\nService: ${vars.service_name} | ${vars.date}${vars.loyalty_section}`;
    await sendSMS({ to: phone, message: smsMsg, meta, tenantId: tid });
  }
}

// ── 3. Loyalty Points Update ──────────────────────────────────────────────────
async function notifyLoyaltyPoints(customer, pointsEarned, totalPoints, branch, tenantId) {
  const tid = resolveNotifyTenantId(tenantId, customer, branch);
  const flags = await getChannelFlags(tid);
  const phone = customer?.phone;
  if (!phone) return;

  const name   = customer.name || 'Valued Customer';
  const brName = branch?.name  || 'HEXAONE';
  const tier   = loyaltyTier(totalPoints);
  const meta   = {
    customer_name: name,
    event_type:    'loyalty_points',
    branch_id:     branch?.id,
    tenant_id:     tid,
  };
  const vars = { customer_name: name, branch_name: brName, points_earned: pointsEarned, points_total: totalPoints };

  if (flags.loyalty_points_whatsapp) {
    const tpl = await getTemplate('loyalty_points', 'whatsapp', tid);
    const msg = tpl
      ? interpolate(tpl.body, vars)
      : `${tier.emoji} *HEXAONE — Loyalty Points Update*\n\n` +
        `Hey ${name}! 🎉\n\nYou just earned *+${pointsEarned} points* at *${brName}*!\n\n` +
        `📊 Your Points Balance:\n  • Earned this visit: +${pointsEarned}\n  • Total balance: *${totalPoints} pts*\n  • Tier status: ${tier.name}\n\n` +
        `💡 Tip: Every 10 pts = Rs. 1 discount on your next visit!\n\nKeep visiting HEXAONE to unlock more rewards. 🛍️`;
    await sendWhatsApp({ to: phone, message: msg, meta, tenantId: tid });
  }

  if (flags.loyalty_points_sms) {
    const tpl = await getTemplate('loyalty_points', 'sms', tid);
    const smsMsg = tpl
      ? interpolate(tpl.body, vars)
      : `HEXAONE\nHi ${name}! You earned +${pointsEarned} loyalty points.\nTotal: ${totalPoints} pts. Every 10 pts = Rs. 1 discount!`;
    await sendSMS({ to: phone, message: smsMsg, meta, tenantId: tid });
  }
}

// ── 5. Walk-In Queue ──────────────────────────────────────────────────────────
async function notifyWalkInCheckIn(walkin, branch, service, tenantId) {
  const tid = resolveNotifyTenantId(tenantId, walkin, branch);
  const flags = await getChannelFlags(tid);
  const phone = walkin?.phone || null;
  if (!phone) return;

  const name    = walkin.customer_name || 'Guest';
  const token   = walkin.token || '—';
  const svcName = service?.name || '—';
  const brName  = branch?.name  || '—';
  const wait    = walkin.estimated_wait ?? '—';
  const meta    = {
    customer_name: name,
    event_type:    'walk_in_checkin',
    branch_id:     branch?.id || walkin.branch_id,
    tenant_id:     tid,
  };
  const vars = { customer_name: name, token, service_name: svcName, branch_name: brName, wait_mins: wait };
  if (flags.walkin_checkin_whatsapp) {
    const tpl = await getTemplate('walk_in_checkin', 'whatsapp', tid);
    const msg = tpl
      ? interpolate(tpl.body, vars)
      : `🚶 *HEXAONE — Walk-In Check-In*\n\nHi ${name}! You're checked in.\n\n🎫 Token: *${token}*\n💇 Service: ${svcName}\n🏠 Branch: ${brName}\n⏳ Est. wait: ${wait} mins\n\nPlease wait — we'll call your token soon.`;
    await sendWhatsApp({ to: phone, message: msg, meta, tenantId: tid });
  }
  if (flags.walkin_checkin_sms) {
    const tpl = await getTemplate('walk_in_checkin', 'sms', tid);
    const msg = interpolate(tpl.body, vars);
    await sendSMS({ to: phone, message: msg, meta, tenantId: tid });
  }
}

async function notifyWalkInServing(walkin, branch, service, tenantId) {
  const tid = resolveNotifyTenantId(tenantId, walkin, branch);
  const flags = await getChannelFlags(tid);
  const phone = walkin?.phone || null;
  if (!phone) return;

  const name    = walkin.customer_name || 'Guest';
  const token   = walkin.token || '—';
  const svcName = service?.name || '—';
  const brName  = branch?.name  || '—';
  const meta    = {
    customer_name: name,
    event_type:    'walk_in_serving',
    branch_id:     branch?.id || walkin.branch_id,
    tenant_id:     tid,
  };
  const vars = { customer_name: name, token, service_name: svcName, branch_name: brName };
  if (flags.walkin_serving_whatsapp) {
    const tpl = await getTemplate('walk_in_serving', 'whatsapp', tid);
    const msg = tpl
      ? interpolate(tpl.body, vars)
      : `🚶 *HEXAONE — Your Turn!*\n\nHi ${name}, token *${token}* is now being served.\n💇 ${svcName}\n🏠 ${brName}\n\nPlease proceed to the service area.`;
    await sendWhatsApp({ to: phone, message: msg, meta, tenantId: tid });
  }
  if (flags.walkin_serving_sms) {
    const tpl = await getTemplate('walk_in_serving', 'sms', tid);
    const msg = interpolate(tpl.body, vars);
    await sendSMS({ to: phone, message: msg, meta, tenantId: tid });
  }
}

async function notifyWalkInCompleted(walkin, branch, service, tenantId) {
  const tid = resolveNotifyTenantId(tenantId, walkin, branch);
  const flags = await getChannelFlags(tid);
  const phone = walkin?.phone || null;
  if (!phone) return;

  const name   = walkin.customer_name || 'Guest';
  const brName = branch?.name || 'HEXAONE';
  const meta   = {
    customer_name: name,
    event_type:    'walk_in_completed',
    branch_id:     branch?.id || walkin.branch_id,
    tenant_id:     tid,
  };
  const vars = { customer_name: name, branch_name: brName, service_name: service?.name || '—' };
  if (flags.walkin_completed_whatsapp) {
    const tpl = await getTemplate('walk_in_completed', 'whatsapp', tid);
    const msg = tpl
      ? interpolate(tpl.body, vars)
      : `✅ *HEXAONE — Service Complete*\n\nHi ${name}! Your walk-in service is complete.\n\nThank you for visiting ${brName}! 🙏`;
    await sendWhatsApp({ to: phone, message: msg, meta, tenantId: tid });
  }
  if (flags.walkin_completed_sms) {
    const tpl = await getTemplate('walk_in_completed', 'sms', tid);
    const msg = interpolate(tpl.body, vars);
    await sendSMS({ to: phone, message: msg, meta, tenantId: tid });
  }
}

// ── 6. Waitlist Slot Available ────────────────────────────────────────────────
async function notifyWaitlistSlotAvailable(waitlistEntry, branch, service) {
  const phone = waitlistEntry?.phone || null;
  if (!phone) return;
  const tid = resolveNotifyTenantId(null, waitlistEntry, branch);
  const brName  = branch?.name  || 'the salon';
  const svcName = service?.name || 'your requested service';
  const message =
    `${brName}: Hi ${waitlistEntry.customer_name || 'there'}, a slot opened for ${svcName}. Call or book online to confirm.`;
  try {
    await sendSMS({
      to: phone,
      message,
      tenantId: tid,
      meta: {
        customer_name: waitlistEntry.customer_name,
        event_type: 'waitlist_slot',
        branch_id: branch?.id || waitlistEntry.branch_id,
        tenant_id: tid,
      },
    });
  } catch { /* ignore */ }
  try {
    await sendWhatsApp({
      to: phone,
      message,
      tenantId: tid,
      meta: {
        customer_name: waitlistEntry.customer_name,
        event_type: 'waitlist_slot',
        branch_id: branch?.id || waitlistEntry.branch_id,
        tenant_id: tid,
      },
    });
  } catch { /* ignore */ }
}

module.exports = {
  sendEmail,
  sendWhatsApp,
  sendSMS,
  notifyAppointmentConfirmed,
  notifyStaffAppointmentAssigned,
  notifyAppointmentCompleted,
  notifyPaymentReceipt,
  notifyLoyaltyPoints,
  notifyWalkInCheckIn,
  notifyWalkInServing,
  notifyWalkInCompleted,
  notifyWaitlistSlotAvailable,
  getTemplate,
  resolveChosenTemplate,
  interpolate,
  getChannelFlags,
  estimateSmsSegments,
  normalizeSmsBody,
};

