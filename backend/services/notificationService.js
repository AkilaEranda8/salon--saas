'use strict';

const nodemailer = require('nodemailer');
const twilio     = require('twilio');

// ── Lazy model loader — avoids circular require on startup ────────────────────
let _models = null;
function getModels() {
  if (!_models) _models = require('../models');
  return _models;
}

// ── Transporter (lazy) ────────────────────────────────────────────────────────
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  _transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  return _transporter;
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
async function writeLog({ customer_name, phone, email, event_type, channel, message_preview, status, error_message, branch_id }) {
  try {
    const { NotificationLog } = getModels();
    await NotificationLog.create({
      customer_name:   customer_name  || null,
      phone:           channel === 'whatsapp' ? (phone  || null) : null,
      email:           channel === 'email'    ? (email  || null) : null,
      event_type,
      channel,
      message_preview: String(message_preview || '').slice(0, 255),
      status,
      error_message:   error_message || null,
      branch_id:       branch_id     || null,
    });
  } catch (err) {
    console.error('[Notifications] Log write failed:', err.message);
  }
}

// ── Settings loader ───────────────────────────────────────────────────────────
const DEFAULT_FLAGS = {
  appt_confirmed_email:      true,
  appt_confirmed_whatsapp:   true,
  appt_confirmed_sms:        false,
  payment_receipt_email:     true,
  payment_receipt_whatsapp:  true,
  payment_receipt_sms:       true,
  loyalty_points_whatsapp:   true,
  loyalty_points_sms:        false,
  customer_registered_sms:   false,
  customer_registered_email: false,
};

async function getChannelFlags() {
  try {
    const { NotificationSettings } = getModels();
    const row = await NotificationSettings.findOne({ where: { branch_id: null } });
    if (!row) return DEFAULT_FLAGS;
    const out = {};
    for (const k of Object.keys(DEFAULT_FLAGS)) out[k] = row[k];
    return out;
  } catch {
    return DEFAULT_FLAGS;
  }
}

// ── SMS credentials loader ──────────────────────────────────────────────────
async function getSMSCreds() {
  try {
    const { NotificationSettings } = getModels();
    const row = await NotificationSettings.findOne({ where: { branch_id: null } });
    if (row && row.sms_user_id && row.sms_api_key) {
      return {
        userId:   row.sms_user_id.trim(),
        apiKey:   row.sms_api_key.trim(),
        senderId: row.sms_sender_id?.trim() || process.env.SMS_SENDER_ID || null,
      };
    }
  } catch { /* fall through */ }
  if (process.env.SMS_USER_ID && process.env.SMS_API_KEY) {
    return {
      userId:   process.env.SMS_USER_ID,
      apiKey:   process.env.SMS_API_KEY,
      senderId: process.env.SMS_SENDER_ID || null,
    };
  }
  return null;
}

// ── Core senders ──────────────────────────────────────────────────────────────

/**
 * Send an HTML email. Logs result to notification_logs. Never throws.
 * @param {{ to, subject, html, meta? }} opts
 *   meta = { customer_name, event_type, branch_id } used for the log row
 */
async function sendEmail({ to, subject, html, meta = {} }) {
  if (!to) return;
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[Notifications] Email skipped — EMAIL_USER/EMAIL_PASS not configured.');
    return;
  }
  let status = 'sent', errorMsg = null;
  try {
    await transporter.sendMail({
      from:    process.env.EMAIL_FROM || `Zane Salon <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
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
 * Send an SMS via Notify.lk. Logs result. Never throws.
 * @param {{ to, message, meta? }} opts
 */
async function sendSMS({ to, message, meta = {} }) {
  if (!to) return null;
  const creds = await getSMSCreds();
  if (!creds) {
    console.warn('[Notifications] SMS skipped — SMS credentials not configured.');
    return null;
  }
  if (!creds.senderId) {
    console.warn('[Notifications] SMS skipped — SMS Sender ID not configured.');
    return null;
  }
  const digits      = to.replace(/\D/g, '');
  const toFormatted = digits.startsWith('94') ? digits
                    : digits.startsWith('0')  ? '94' + digits.slice(1)
                    : '94' + digits;
  let status = 'sent', errorMsg = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let res;
    try {
      res = await fetch('https://app.notify.lk/api/v1/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        signal:  controller.signal,
        body:    JSON.stringify({
          user_id:    creds.userId,
          api_key:    creds.apiKey,
          service_id: creds.senderId,
          to:         toFormatted,
          message,
        }),
      });
    } finally {
      clearTimeout(timer);
    }
    const data = await res.json().catch(() => ({}));
    console.log(`[Notifications] SMS API response → ${toFormatted}:`, JSON.stringify(data));
    if (!res.ok || data.status === 'error') {
      const errMsg = (Array.isArray(data.errors) && data.errors[0]) || data.message || `HTTP ${res.status}`;
      throw new Error(errMsg);
    }
    console.log(`[Notifications] SMS sent → ${toFormatted}`);
  } catch (err) {
    status   = 'failed';
    errorMsg = err.name === 'AbortError' ? 'SMS gateway timeout (15s)' : err.message;
    console.error(`[Notifications] SMS failed → ${toFormatted}:`, errorMsg);
  }
  await writeLog({
    ...meta,
    channel:         'sms',
    phone:           to,
    message_preview: message.slice(0, 255),
    status,
    error_message:   errorMsg,
  });
  return { status, error: errorMsg };
}

/**
 * Send a WhatsApp message via Twilio. Logs result. Never throws.
 * @param {{ to, message, meta? }} opts
 */
async function sendWhatsApp({ to, message, meta = {} }) {
  if (!to) return;
  const client = getTwilio();
  if (!client) {
    console.warn('[Notifications] WhatsApp skipped — Twilio credentials not configured.');
    return;
  }
  const from        = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
  const toFormatted = formatWhatsApp(to);
  if (!toFormatted) return;
  let status = 'sent', errorMsg = null;
  try {
    await client.messages.create({ from, to: toFormatted, body: message });
    console.log(`[Notifications] WhatsApp sent → ${toFormatted}`);
  } catch (err) {
    status   = 'failed';
    errorMsg = err.message;
    console.error(`[Notifications] WhatsApp failed → ${toFormatted}:`, err.message);
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
function buildEmailWrapper(title, bodyHtml, branchName = 'Zane Salon', branchPhone = '') {
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
          <td style="background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);padding:32px 40px;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">✂️</div>
            <h1 style="margin:0;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:1px;">Zane Salon</h1>
            <p style="margin:6px 0 0;font-size:14px;color:#bfdbfe;">Premium Salon Management</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">${bodyHtml}</td>
        </tr>
        <tr>
          <td style="background:#f8faff;padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">
              <strong style="color:#1e3a8a;">${safeBranchName}</strong>
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
async function notifyAppointmentConfirmed(appointment, branch, service) {
  const flags = await getChannelFlags();
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
  };

  if (email && flags.appt_confirmed_email) {
    const body = `
      <h2 style="margin:0 0 8px;font-size:22px;color:#1e3a8a;">Appointment Confirmed! 🎉</h2>
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
      <div style="margin:28px 0;padding:16px 20px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;">
        <p style="margin:0;font-size:14px;color:#1e40af;">📌 Please arrive 5 minutes early. Contact us if you need to reschedule.</p>
      </div>
      <p style="margin:0;font-size:15px;color:#475569;">Thank you for choosing <strong>Zane Salon</strong>! See you soon. ✨</p>`;
    await sendEmail({
      to:      email,
      subject: 'Appointment Confirmed — Zane Salon',
      html:    buildEmailWrapper('Appointment Confirmed', body, brName, brPhone),
      meta,
    });
  }

  if (phone && flags.appt_confirmed_whatsapp) {
    const msg =
      `✂️ *Zane Salon — Appointment Confirmed!*\n\n` +
      `Hi ${appointment.customer_name}, your booking is confirmed:\n\n` +
      `📅 Date: ${date}\n⏰ Time: ${time}\n💇 Service: ${svcName}\n🏠 Branch: ${brName}\n💰 Amount: ${amount}\n\n` +
      `Please arrive 5 mins early. See you soon! 😊`;
    await sendWhatsApp({ to: phone, message: msg, meta });
  }
}

// ── 2. Payment Receipt ────────────────────────────────────────────────────────
async function notifyPaymentReceipt(payment, branch, service, customer) {
  const flags = await getChannelFlags();
  const phone = customer?.phone || null;
  const email = customer?.email || null;
  if (!phone && !email) return;

  const customerName = customer?.name || payment.customer_name || 'Valued Customer';
  const brName       = branch?.name   || '—';
  const brPhone      = branch?.phone  || '';
  const svcName      = service?.name  || '—';
  const total        = `Rs. ${parseFloat(payment.total_amount || 0).toFixed(2)}`;
  const discount     = parseFloat(payment.loyalty_discount || 0);
  const pointsEarned = payment.points_earned || 0;
  const date         = payment.date || new Date().toISOString().slice(0, 10);
  const splits       = payment.splits || [];
  const meta         = {
    customer_name: customerName,
    event_type:    'payment_receipt',
    branch_id:     branch?.id || payment.branch_id,
  };

  const splitRows = splits.length
    ? splits.map((s) => detailRow(`💳 ${s.method}`, `Rs. ${parseFloat(s.amount).toFixed(2)}`)).join('')
    : detailRow('💳 Payment', total);

  if (email && flags.payment_receipt_email) {
    const body = `
      <h2 style="margin:0 0 8px;font-size:22px;color:#1e3a8a;">Payment Receipt 🧾</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;">
        Hi <strong>${customerName}</strong>, thank you for your payment. Here's your receipt:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${detailRow('📅 Date',    date)}
        ${detailRow('💇 Service', svcName)}
        ${detailRow('🏠 Branch',  brName)}
        ${splitRows}
        ${discount > 0 ? detailRow('🎁 Loyalty Discount', `- Rs. ${discount.toFixed(2)}`) : ''}
        <tr>
          <td style="padding:14px 0 4px;font-size:16px;color:#1e293b;font-weight:700;border-top:2px solid #e2e8f0;" colspan="2">
            Total Paid: <span style="float:right;color:#1e3a8a;">Rs. ${parseFloat(payment.total_amount || 0).toFixed(2)}</span>
          </td>
        </tr>
      </table>
      ${pointsEarned > 0 ? `
      <div style="margin:24px 0;padding:16px 20px;background:#f0fdf4;border-left:4px solid #22c55e;border-radius:4px;">
        <p style="margin:0;font-size:14px;color:#166534;">🌟 You earned <strong>${pointsEarned} loyalty points</strong> on this visit!</p>
      </div>` : ''}
      <p style="margin:0;font-size:15px;color:#475569;">Thank you for visiting <strong>Zane Salon</strong>! 💜</p>`;
    await sendEmail({
      to:      email,
      subject: 'Payment Receipt — Zane Salon',
      html:    buildEmailWrapper('Payment Receipt', body, brName, brPhone),
      meta,
    });
  }

  if (phone && flags.payment_receipt_whatsapp) {
    let msg =
      `🧾 *Zane Salon — Payment Receipt*\n\n` +
      `Hi ${customerName}! Payment confirmed:\n\n` +
      `💇 Service: ${svcName}\n🏠 Branch: ${brName}\n📅 Date: ${date}\n💰 Total Paid: ${total}\n`;
    if (discount > 0)     msg += `🎁 Loyalty Discount: Rs. ${discount.toFixed(2)}\n`;
    if (pointsEarned > 0) msg += `\n🌟 You earned *${pointsEarned} loyalty points*!`;
    msg += `\n\nThank you for choosing Zane Salon! 💜`;
    await sendWhatsApp({ to: phone, message: msg, meta });
  }

  if (phone && flags.payment_receipt_sms) {
    let smsMsg =
      `Zane Salon - Payment Receipt\n` +
      `Hi ${customerName}! Payment confirmed.\n` +
      `Service: ${svcName} | Branch: ${brName}\n` +
      `Date: ${date} | Total: ${total}`;
    if (discount > 0)     smsMsg += `\nDiscount: Rs. ${discount.toFixed(2)}`;
    if (pointsEarned > 0) smsMsg += `\nEarned: +${pointsEarned} pts`;
    smsMsg += `\nThank you!`;
    await sendSMS({ to: phone, message: smsMsg, meta });
  }
}

// ── 3. Loyalty Points Update ──────────────────────────────────────────────────
async function notifyLoyaltyPoints(customer, pointsEarned, totalPoints, branch) {
  const flags = await getChannelFlags();
  const phone = customer?.phone;
  if (!phone || !flags.loyalty_points_whatsapp) return;

  const name   = customer.name || 'Valued Customer';
  const brName = branch?.name  || 'Zane Salon';
  const tier   = loyaltyTier(totalPoints);
  const meta   = {
    customer_name: name,
    event_type:    'loyalty_points',
    branch_id:     branch?.id,
  };
  const msg =
    `${tier.emoji} *Zane Salon — Loyalty Points Update*\n\n` +
    `Hey ${name}! 🎉\n\nYou just earned *+${pointsEarned} points* at *${brName}*!\n\n` +
    `📊 Your Points Balance:\n  • Earned this visit: +${pointsEarned}\n  • Total balance: *${totalPoints} pts*\n  • Tier status: ${tier.name}\n\n` +
    `💡 Tip: Every 10 pts = Rs. 1 discount on your next visit!\n\nKeep visiting Zane Salon to unlock more rewards. 🛍️`;

  await sendWhatsApp({ to: phone, message: msg, meta });
}

// ── 4. Review Request ─────────────────────────────────────────────────────────
async function notifyReviewRequest(payment, customer, service, branch, token) {
  const phone = customer?.phone || null;
  const email = customer?.email || null;
  if (!phone && !email) return;

  const customerName = customer?.name || payment.customer_name || 'Valued Customer';
  const svcName      = service?.name  || 'your recent service';
  const brName       = branch?.name   || 'Zane Salon';
  const brPhone      = branch?.phone  || '';
  const base         = process.env.FRONTEND_URL || 'http://localhost';
  const reviewUrl    = `${base}/review/${token}`;
  const meta         = {
    customer_name: customerName,
    event_type:    'review_request',
    branch_id:     branch?.id || payment.branch_id,
  };

  if (email) {
    const body = `
      <h2 style="margin:0 0 8px;font-size:22px;color:#1e3a8a;">How was your experience? ⭐</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;">
        Hi <strong>${customerName}</strong>, thank you for visiting <strong>${brName}</strong>!
        We'd love to hear your feedback on <strong>${svcName}</strong>.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${reviewUrl}"
           style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#1e3a8a,#3b82f6);color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.5px;">
          ✍️ Leave a Review
        </a>
      </div>
      <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">
        This link is unique to your visit and can only be used once.
      </p>`;
    await sendEmail({
      to:      email,
      subject: `How was your visit at ${brName}? — Share your feedback`,
      html:    buildEmailWrapper('Share Your Review', body, brName, brPhone),
      meta,
    });
  }

  if (phone) {
    const msg =
      `⭐ *Zane Salon — Share Your Feedback!*\n\n` +
      `Hi ${customerName}! 😊 Thank you for visiting *${brName}*.\n\n` +
      `How was your *${svcName}* experience? We'd love your feedback!\n\n` +
      `👉 Leave a review (takes 30 seconds):\n${reviewUrl}\n\n` +
      `_This link is unique and can only be used once._`;
    await sendWhatsApp({ to: phone, message: msg, meta });
  }
}

module.exports = {
  sendEmail,
  sendWhatsApp,
  sendSMS,
  notifyAppointmentConfirmed,
  notifyPaymentReceipt,
  notifyLoyaltyPoints,
  notifyReviewRequest,
};

