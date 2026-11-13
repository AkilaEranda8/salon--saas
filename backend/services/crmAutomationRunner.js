'use strict';

/**
 * Executes a CRM automation — wraps existing reminder/nudge runners where available.
 */
const { Op } = require('sequelize');
const {
  CrmAutomation,
  CrmAutomationExecution,
  CrmFollowUpJob,
  Customer,
  Appointment,
  Service,
  Staff,
  Tenant,
} = require('../models');
const { interpolate } = require('./crmAutomationCatalog');
const { getEnabledByType } = require('./crmAutomationService');
const {
  runDayBeforeReminders,
  runAbandonedBookingNudges,
} = require('./crmReminderService');
const {
  sendSMS,
  sendEmail,
} = require('./notificationService');
const { sendAndLog } = require('./crmOutboundSendService');
const { getOptOutPhoneSet, isPhoneOptedOut } = require('./crmConversationService');
const { isTenantCrmEligible } = require('../utils/tenantFeatures');
const {
  slNow,
  slNowParts,
  slToday,
  slDatePlusDays,
  slDateString,
  SL_OFFSET_MS,
} = require('../utils/dateUtils');

const DAY_MS = 24 * 60 * 60 * 1000;
/** automation-tick runs hourly — near-time reminder window never shrinks below this. */
const TICK_INTERVAL_MS = 60 * 60 * 1000;

const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;

/** Midnight (start of today) in Asia/Colombo, as a real instant. */
function startOfSlToday() {
  return new Date(Date.parse(`${slToday()}T00:00:00.000Z`) - SL_OFFSET_MS);
}

function delayToMs(delay) {
  const map = {
    '30_minutes': 30 * 60 * 1000,
    '2_hours': 2 * 60 * 60 * 1000,
    '6_hours': 6 * 60 * 60 * 1000,
    '24_hours': 24 * 60 * 60 * 1000,
    '1_day': 24 * 60 * 60 * 1000,
    '30_days': 30 * 86400000,
    '60_days': 60 * 86400000,
    '90_days': 90 * 86400000,
  };
  return map[delay] || null;
}

function daysFromDelay(delay) {
  const map = { '30_days': 30, '60_days': 60, '90_days': 90 };
  return map[delay] || 60;
}

async function markExecution(exec, status, patch = {}) {
  if (!exec) return;
  await exec.update({
    status,
    executed_at: new Date(),
    ...patch,
  });
}

async function sendViaChannel({
  tenantId,
  channel,
  phone,
  email,
  message,
  subject,
  meta,
  templateName = null,
  templateParams = null,
  name = null,
}) {
  const ch = String(channel || 'whatsapp').toLowerCase();
  if (ch === 'sms') {
    return sendSMS({ to: phone, message, tenantId, meta });
  }
  if (ch === 'email') {
    if (!email) return { skipped: true, reason: 'no_email' };
    return sendEmail({ to: email, subject: subject || 'Message from salon', html: `<p>${message}</p>`, text: message });
  }
  // WhatsApp: log a CrmMessage (Inbox/AI context) and send via WA_OUTBOUND
  // (Cloud with 24h-window handling, else QR; direct send only if no queue).
  return sendAndLog({
    tenantId,
    phone,
    text: message,
    senderType: 'automation',
    name,
    templateName: templateName || meta?.template_name || null,
    templateParams: templateParams || meta?.template_params || null,
    meta: { ...(meta || {}), channel: 'whatsapp' },
  });
}

/**
 * Lead time (ms) for near-time reminders (e.g. '2_hours', '6_hours', '30_minutes').
 * null → day-before style ('1_day' / unset) handled by the legacy CRM job.
 */
function reminderLeadMs(automation) {
  const settings = automation.settings_json || {};
  const mode = automation.delay || settings.reminder_time || '1_day';
  const ms = delayToMs(mode);
  if (ms && ms < DAY_MS) return ms;
  return null;
}

async function runAppointmentReminder(automation, tenantId) {
  const leadMs = reminderLeadMs(automation);
  if (leadMs) {
    return runNearTimeReminders(tenantId, automation, leadMs);
  }
  const channel = String(automation.channel || 'whatsapp').toLowerCase();
  if (channel === 'sms' || channel === 'email') {
    // Legacy day-before job is WhatsApp-only; honor the configured channel/template
    return runNearTimeReminders(tenantId, automation, null);
  }
  // Reuse existing day-before CRM reminder job (WABA templates)
  return runDayBeforeReminders({ tenantId });
}

/** 2-hour appointment reminders (default lead for delay '2_hours'). */
async function runTwoHourReminders(tenantId, automation) {
  return runNearTimeReminders(tenantId, automation, 2 * 60 * 60 * 1000);
}

/**
 * Appointment reminders using the automation's channel/template.
 * @param {number|null} leadMs — near-time window [now, now+lead] in Asia/Colombo wall clock;
 *   null → all appointments tomorrow (SL) for non-WhatsApp day-before.
 */
async function runNearTimeReminders(tenantId, automation, leadMs) {
  const settings = automation.settings_json || {};
  const channel = String(automation.channel || 'whatsapp').toLowerCase();
  const modeLabel = leadMs ? (automation.delay || settings.reminder_time || '2_hours') : '1_day';

  const where = {
    tenant_id: tenantId,
    status: { [Op.in]: ['pending', 'confirmed'] },
  };
  if (channel !== 'email') where.phone = { [Op.ne]: null };

  if (leadMs) {
    // Appointment date/time are salon wall-clock (Asia/Colombo), not server UTC.
    // Window is never shorter than the hourly tick so nothing slips between runs.
    const windowMs = Math.max(leadMs, TICK_INTERVAL_MS);
    const start = slNow();
    const end = new Date(start.getTime() + windowMs);
    const startDate = slDateString(start);
    const endDate = slDateString(end);
    const startT = hhmm(start);
    const endT = hhmm(end);
    if (startDate === endDate) {
      where.date = startDate;
      where.time = { [Op.between]: [startT, endT] };
    } else {
      // Window crosses midnight: rest of today OR early hours of the next day
      where[Op.or] = [
        { date: startDate, time: { [Op.gte]: startT } },
        { date: endDate, time: { [Op.lte]: endT } },
      ];
    }
  } else {
    where.date = slDatePlusDays(1);
  }

  const appts = await Appointment.findAll({ where, limit: 200, order: [['date', 'ASC'], ['time', 'ASC']] });

  const tenant = await Tenant.findByPk(tenantId);
  const salon = tenant?.brand_name || tenant?.name || 'our salon';
  const template = settings.template
    || (leadMs
      ? 'Reminder: Hi {{name}}, you have {{service}} today at {{time}}. See you soon!'
      : 'Reminder: Hi {{name}}, you have {{service}} on {{date}} at {{time}} with {{staff}}. Reply if you need to reschedule.');
  const dedupeSince = new Date(Date.now() - (leadMs ? 12 * 60 * 60 * 1000 : DAY_MS));
  const optedOut = await getOptOutPhoneSet(tenantId);

  let sent = 0;
  for (const appt of appts) {
    if (appt.phone && isPhoneOptedOut(optedOut, appt.phone)) continue;
    const already = await CrmFollowUpJob.findOne({
      where: {
        tenant_id: tenantId,
        appointment_id: appt.id,
        job_type: 'appointment_reminder',
        status: 'sent',
        createdAt: { [Op.gte]: dedupeSince },
      },
    });
    if (already) continue;
    const [svc, staff, customer] = await Promise.all([
      appt.service_id
        ? Service.findByPk(appt.service_id, { attributes: ['name'] }).catch(() => null)
        : null,
      appt.staff_id
        ? Staff.findByPk(appt.staff_id, { attributes: ['name'] }).catch(() => null)
        : null,
      channel === 'email' && appt.customer_id
        ? Customer.findOne({ where: { id: appt.customer_id, tenant_id: tenantId }, attributes: ['email'] }).catch(() => null)
        : null,
    ]);
    const msg = interpolate(template, {
      name: appt.customer_name || 'there',
      service: svc?.name || 'appointment',
      date: appt.date,
      time: String(appt.time || '').slice(0, 5),
      staff: staff?.name || 'our team',
      salon,
    });
    try {
      const out = await sendViaChannel({
        tenantId,
        channel,
        phone: appt.phone,
        email: customer?.email || null,
        message: msg,
        subject: 'Appointment reminder',
        name: appt.customer_name || null,
        templateName: settings.template_name || null,
        meta: { event_type: 'automation_appointment_reminder', appointment_id: appt.id },
      });
      if (out?.skipped) continue; // e.g. no_email — not a real send
      await CrmFollowUpJob.create({
        tenant_id: tenantId,
        job_type: 'appointment_reminder',
        status: 'sent',
        appointment_id: appt.id,
        phone: appt.phone,
        sent_at: new Date(),
        meta: { via: 'automation', delay: modeLabel, channel },
      });
      sent += 1;
    } catch (err) {
      await CrmFollowUpJob.create({
        tenant_id: tenantId,
        job_type: 'appointment_reminder',
        status: 'failed',
        appointment_id: appt.id,
        phone: appt.phone,
        error_message: err.message,
      }).catch(() => {});
    }
  }
  return { sent, scanned: appts.length, mode: modeLabel, channel };
}

async function runAbandoned(automation, tenantId) {
  // Delay from automation (column or settings); legacy runner falls back to 2h.
  const settings = automation.settings_json || {};
  const raw = automation.delay || settings.delay || settings.delay_hours;
  let delayMs = null;
  if (typeof raw === 'number' || /^\d+(\.\d+)?$/.test(String(raw || ''))) {
    const hrs = Number(raw);
    if (hrs > 0) delayMs = hrs * 60 * 60 * 1000;
  } else {
    delayMs = delayToMs(raw);
  }
  return runAbandonedBookingNudges({ tenantId, delayMs });
}

async function runBirthday(automation, tenantId) {
  const tenant = await Tenant.findByPk(tenantId);
  const settings = automation.settings_json || {};
  const template = settings.template
    || 'Happy Birthday {{name}}! 🎂 From all of us at {{salon}}.';
  const coupon = settings.coupon_code
    ? `Use code ${settings.coupon_code} for a special treat.`
    : '';

  const customers = await Customer.findAll({
    where: { tenant_id: tenantId, dob: { [Op.ne]: null } },
    attributes: ['id', 'name', 'phone', 'email', 'dob'],
    limit: 2000,
  });
  // "Today" is the Sri Lanka calendar day (server runs in UTC)
  const todayMd = slToday().slice(5); // MM-DD
  const [slYear] = slToday().split('-').map(Number);
  const isLeap = (slYear % 4 === 0 && slYear % 100 !== 0) || slYear % 400 === 0;
  const matchesToday = (md) => md === todayMd || (md === '02-29' && !isLeap && todayMd === '02-28');
  const todays = customers.filter((c) => {
    if (!c.dob) return false;
    let md;
    if (c.dob instanceof Date) {
      md = `${pad2(c.dob.getUTCMonth() + 1)}-${pad2(c.dob.getUTCDate())}`;
    } else {
      const m = String(c.dob).match(/^\d{4}-(\d{2}-\d{2})/);
      if (!m) return false;
      md = m[1];
    }
    return matchesToday(md);
  });

  const optedOut = await getOptOutPhoneSet(tenantId);
  let sent = 0;
  for (const c of todays) {
    if (!c.phone) continue;
    if (isPhoneOptedOut(optedOut, c.phone)) continue;
    const already = await CrmFollowUpJob.findOne({
      where: {
        tenant_id: tenantId,
        job_type: 'birthday',
        phone: c.phone,
        status: 'sent',
        createdAt: { [Op.gte]: startOfSlToday() },
      },
    });
    if (already) continue;
    const msg = interpolate(template, {
      name: c.name || 'there',
      salon: tenant?.brand_name || tenant?.name || 'our salon',
      coupon,
    });
    try {
      await sendViaChannel({
        tenantId,
        channel: automation.channel,
        phone: c.phone,
        email: c.email,
        message: msg,
        subject: 'Happy Birthday!',
        meta: { event_type: 'automation_birthday', customer_id: c.id },
      });
      await CrmFollowUpJob.create({
        tenant_id: tenantId,
        job_type: 'birthday',
        status: 'sent',
        phone: c.phone,
        sent_at: new Date(),
        meta: { customer_id: c.id, via: 'automation' },
      });
      sent += 1;
    } catch (err) {
      await CrmFollowUpJob.create({
        tenant_id: tenantId,
        job_type: 'birthday',
        status: 'failed',
        phone: c.phone,
        error_message: err.message,
        meta: { customer_id: c.id },
      }).catch(() => {});
    }
  }
  return { sent, matched: todays.length };
}

async function runRebooking(automation, tenantId) {
  const tenant = await Tenant.findByPk(tenantId);
  const settings = automation.settings_json || {};
  const days = daysFromDelay(automation.delay || settings.inactive_days || '60_days');
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const customers = await Customer.findAll({
    where: {
      tenant_id: tenantId,
      last_visit: { [Op.or]: [{ [Op.lt]: cutoff }, null] },
      phone: { [Op.ne]: null },
    },
    attributes: ['id', 'name', 'phone', 'email', 'last_visit'],
    limit: 150,
    order: [['last_visit', 'ASC']],
  });
  const template = settings.template
    || 'Hi {{name}}, we miss you at {{salon}}! Reply *book* to reserve your next visit.';
  const optedOut = await getOptOutPhoneSet(tenantId);
  let sent = 0;
  for (const c of customers) {
    if (isPhoneOptedOut(optedOut, c.phone)) continue;
    const already = await CrmFollowUpJob.findOne({
      where: {
        tenant_id: tenantId,
        job_type: 'rebook',
        phone: c.phone,
        status: 'sent',
        createdAt: { [Op.gte]: new Date(Date.now() - days * 86400000) },
      },
    });
    if (already) continue;
    const msg = interpolate(template, {
      name: c.name || 'there',
      salon: tenant?.brand_name || tenant?.name || 'our salon',
    });
    try {
      await sendViaChannel({
        tenantId,
        channel: automation.channel,
        phone: c.phone,
        email: c.email,
        message: msg,
        meta: { event_type: 'automation_rebook', customer_id: c.id },
      });
      await CrmFollowUpJob.create({
        tenant_id: tenantId,
        job_type: 'rebook',
        status: 'sent',
        phone: c.phone,
        sent_at: new Date(),
        meta: { customer_id: c.id, inactive_days: days },
      });
      sent += 1;
    } catch (err) {
      await CrmFollowUpJob.create({
        tenant_id: tenantId,
        job_type: 'rebook',
        status: 'failed',
        phone: c.phone,
        error_message: err.message,
      }).catch(() => {});
    }
  }
  return { sent, scanned: customers.length, inactive_days: days };
}

async function runReviewRequest(automation, tenantId) {
  const tenant = await Tenant.findByPk(tenantId);
  const settings = automation.settings_json || {};
  const delayMs = delayToMs(automation.delay || '2_hours') || 2 * 60 * 60 * 1000;
  const windowStart = new Date(Date.now() - delayMs - 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() - delayMs);

  const appts = await Appointment.findAll({
    where: {
      tenant_id: tenantId,
      status: 'completed',
      updatedAt: { [Op.between]: [windowStart, windowEnd] },
      phone: { [Op.ne]: null },
    },
    limit: 80,
  });

  const template = settings.template
    || 'Hi {{name}}, thanks for visiting {{salon}}! How was your experience?';
  let sent = 0;
  for (const appt of appts) {
    const already = await CrmFollowUpJob.findOne({
      where: {
        tenant_id: tenantId,
        appointment_id: appt.id,
        job_type: 'review',
        status: 'sent',
      },
    });
    if (already) continue;
    const svc = appt.service_id
      ? await Service.findByPk(appt.service_id, { attributes: ['name'] }).catch(() => null)
      : null;
    const msg = interpolate(template, {
      name: appt.customer_name || 'there',
      salon: tenant?.brand_name || tenant?.name || 'our salon',
      service: svc?.name || 'visit',
      review_link: settings.review_link || '',
    });
    try {
      await sendViaChannel({
        tenantId,
        channel: automation.channel,
        phone: appt.phone,
        message: msg,
        meta: { event_type: 'automation_review', appointment_id: appt.id },
      });
      await CrmFollowUpJob.create({
        tenant_id: tenantId,
        job_type: 'review',
        status: 'sent',
        appointment_id: appt.id,
        phone: appt.phone,
        sent_at: new Date(),
        meta: { via: 'automation' },
      });
      sent += 1;
    } catch (err) {
      await CrmFollowUpJob.create({
        tenant_id: tenantId,
        job_type: 'review',
        status: 'failed',
        appointment_id: appt.id,
        phone: appt.phone,
        error_message: err.message,
      }).catch(() => {});
    }
  }
  return { sent, scanned: appts.length };
}

async function runWelcome(automation, tenantId, customerId = null) {
  const tenant = await Tenant.findByPk(tenantId);
  const settings = automation.settings_json || {};
  const template = settings.template
    || 'Welcome to {{salon}}, {{name}}! Reply *book* to schedule your first visit.';

  let customers;
  if (customerId) {
    const c = await Customer.findOne({ where: { id: customerId, tenant_id: tenantId } });
    customers = c ? [c] : [];
  } else {
    // Manual run: welcome customers created in last 24h without prior welcome job
    customers = await Customer.findAll({
      where: {
        tenant_id: tenantId,
        createdAt: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        phone: { [Op.ne]: null },
      },
      limit: 50,
    });
  }

  let sent = 0;
  for (const c of customers) {
    if (!c.phone) continue;
    const already = await CrmFollowUpJob.findOne({
      where: {
        tenant_id: tenantId,
        job_type: 'welcome',
        phone: c.phone,
        status: 'sent',
      },
    });
    if (already) continue;
    const msg = interpolate(template, {
      name: c.name || 'there',
      salon: tenant?.brand_name || tenant?.name || 'our salon',
    });
    try {
      await sendViaChannel({
        tenantId,
        channel: automation.channel,
        phone: c.phone,
        email: c.email,
        message: msg,
        subject: `Welcome to ${tenant?.brand_name || 'our salon'}`,
        meta: { event_type: 'automation_welcome', customer_id: c.id },
      });
      await CrmFollowUpJob.create({
        tenant_id: tenantId,
        job_type: 'welcome',
        status: 'sent',
        phone: c.phone,
        sent_at: new Date(),
        meta: { customer_id: c.id },
      });
      sent += 1;
    } catch (err) {
      await CrmFollowUpJob.create({
        tenant_id: tenantId,
        job_type: 'welcome',
        status: 'failed',
        phone: c.phone,
        error_message: err.message,
      }).catch(() => {});
    }
  }
  return { sent, scanned: customers.length };
}

async function runPromo(automation, tenantId) {
  const tenant = await Tenant.findByPk(tenantId);
  const settings = automation.settings_json || {};
  const segment = settings.segment || 'all';
  const template = settings.template
    || 'Hi {{name}}! Special offer from {{salon}}: {{offer}}. Reply *book* to claim it.';
  const offer = settings.offer_text || 'Ask us about today’s specials';

  const where = { tenant_id: tenantId, phone: { [Op.ne]: null } };
  if (segment === 'vip' || segment === 'loyalty') {
    where.loyalty_points = { [Op.gt]: 0 };
  }
  if (segment === 'inactive') {
    const cutoff = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    where.last_visit = { [Op.or]: [{ [Op.lt]: cutoff }, null] };
  }

  if (segment === 'by_service') {
    const serviceId = Number(settings.service_id);
    if (!serviceId) {
      return { sent: 0, scanned: 0, segment, skipped: true, reason: 'no_service_id' };
    }
    const svc = await Service.findOne({ where: { id: serviceId, tenant_id: tenantId }, attributes: ['id'] });
    if (!svc) {
      return { sent: 0, scanned: 0, segment, skipped: true, reason: 'service_not_found' };
    }
    // Customers who previously booked this service (non-cancelled), by id or phone
    const past = await Appointment.findAll({
      where: {
        tenant_id: tenantId,
        service_id: serviceId,
        status: { [Op.ne]: 'cancelled' },
      },
      attributes: ['customer_id', 'phone'],
      group: ['customer_id', 'phone'],
      limit: 1000,
      raw: true,
    });
    const ids = [...new Set(past.map((a) => a.customer_id).filter(Boolean))];
    const phones = [...new Set(past.map((a) => a.phone).filter(Boolean))];
    if (!ids.length && !phones.length) {
      return { sent: 0, scanned: 0, segment, service_id: serviceId, reason: 'no_matching_customers' };
    }
    const or = [];
    if (ids.length) or.push({ id: { [Op.in]: ids } });
    if (phones.length) or.push({ phone: { [Op.in]: phones } });
    where[Op.and] = [{ [Op.or]: or }];
  }

  const customers = await Customer.findAll({
    where,
    attributes: ['id', 'name', 'phone', 'email', 'loyalty_points'],
    limit: 200,
    order: [['id', 'DESC']],
  });

  const optedOut = await getOptOutPhoneSet(tenantId);
  let sent = 0;
  for (const c of customers) {
    if (isPhoneOptedOut(optedOut, c.phone)) continue;
    const msg = interpolate(template, {
      name: c.name || 'there',
      salon: tenant?.brand_name || tenant?.name || 'our salon',
      offer,
    });
    try {
      await sendViaChannel({
        tenantId,
        channel: automation.channel,
        phone: c.phone,
        email: c.email,
        message: msg,
        subject: 'Special offer',
        meta: { event_type: 'automation_promo', customer_id: c.id, segment },
      });
      sent += 1;
    } catch {
      // continue batch
    }
  }
  return {
    sent,
    scanned: customers.length,
    segment,
    ...(segment === 'by_service' ? { service_id: Number(settings.service_id) } : {}),
  };
}

/**
 * Execute one automation (by id or row) and update execution log.
 */
async function executeAutomation({
  tenantId,
  automationId,
  executionId = null,
  customerId = null,
}) {
  const automation = await CrmAutomation.findOne({
    where: { id: automationId, tenant_id: tenantId },
  });
  if (!automation) {
    return { skipped: true, reason: 'not_found' };
  }
  if (!automation.enabled && !executionId) {
    return { skipped: true, reason: 'disabled' };
  }

  // Re-check gating at run time (plan/feature changed, suspended, cancelled)
  const gateTenant = await Tenant.findByPk(tenantId);
  if (!isTenantCrmEligible(gateTenant)) {
    const reason = !gateTenant
      ? 'tenant_not_found'
      : (['suspended', 'cancelled'].includes(gateTenant.status) ? `tenant_${gateTenant.status}` : 'feature_disabled');
    if (executionId) {
      const queued = await CrmAutomationExecution.findOne({
        where: { id: executionId, tenant_id: tenantId, automation_id: automationId },
      });
      await markExecution(queued, 'skipped', { error: reason });
    }
    return { skipped: true, reason };
  }

  let exec = null;
  if (executionId) {
    exec = await CrmAutomationExecution.findOne({
      where: { id: executionId, tenant_id: tenantId, automation_id: automationId },
    });
  }
  if (!exec) {
    exec = await CrmAutomationExecution.create({
      automation_id: automation.id,
      tenant_id: tenantId,
      customer_id: customerId || null,
      status: 'running',
      executed_at: new Date(),
    });
  } else {
    await exec.update({ status: 'running', executed_at: new Date() });
  }

  const started = Date.now();
  try {
    let result;
    switch (automation.type) {
      case 'appointment_reminder':
        result = await runAppointmentReminder(automation, tenantId);
        break;
      case 'abandoned_booking':
        result = await runAbandoned(automation, tenantId);
        break;
      case 'birthday_wishes':
        result = await runBirthday(automation, tenantId);
        break;
      case 'rebooking_reminder':
        result = await runRebooking(automation, tenantId);
        break;
      case 'review_request':
        result = await runReviewRequest(automation, tenantId);
        break;
      case 'welcome_message':
        result = await runWelcome(automation, tenantId, customerId);
        break;
      case 'promotional_campaign':
        result = await runPromo(automation, tenantId);
        break;
      default:
        throw new Error(`Unsupported automation type: ${automation.type}`);
    }
    const duration = Date.now() - started;
    await markExecution(exec, 'success', {
      duration,
      meta: { ...(exec.meta || {}), result },
      customer_id: customerId || exec.customer_id,
    });
    return { ok: true, result, executionId: exec.id, duration };
  } catch (err) {
    const duration = Date.now() - started;
    await markExecution(exec, 'failed', {
      duration,
      error: String(err.message || err).slice(0, 2000),
    });
    return { ok: false, error: err.message, executionId: exec.id };
  }
}

/**
 * Tick schedulers for enabled automations (called from FOLLOWUP worker).
 */
async function tickScheduledAutomations() {
  const tenants = await Tenant.findAll({
    where: { status: { [Op.notIn]: ['suspended', 'cancelled'] } },
    limit: 500,
  });
  const summary = {
    birthday: 0,
    review: 0,
    rebook: 0,
    appointment_reminder: 0,
    skipped_gated: 0,
    errors: 0,
  };
  // Birthday hour is Sri Lanka wall-clock (server runs in UTC).
  const slHour = Math.floor(slNowParts().minutes / 60);
  // Cadence slot uses server clock minute (tick fires at :05 UTC); SL minute is offset by 30.
  const minute = new Date().getUTCMinutes();

  for (const t of tenants) {
    const tid = t.id;
    if (!isTenantCrmEligible(t)) {
      summary.skipped_gated += 1;
      continue;
    }
    try {
      // Birthday at the configured SL hour (default 09:xx). Per-day dedupe lives in runBirthday.
      const birthday = await getEnabledByType(tid, 'birthday_wishes');
      if (birthday) {
        const m = String(birthday.schedule || '09:00').match(/^(\d{1,2})/);
        const birthdayHour = m ? Math.min(Number(m[1]), 23) : 9;
        if (slHour === birthdayHour) {
          await executeAutomation({ tenantId: tid, automationId: birthday.id });
          summary.birthday += 1;
        }
      }

      // Near-time appointment reminders (e.g. 2 hours before) — every tick.
      // Day-before reminders keep their own 09:05 repeatable job.
      const reminder = await getEnabledByType(tid, 'appointment_reminder');
      if (reminder && reminderLeadMs(reminder)) {
        await executeAutomation({ tenantId: tid, automationId: reminder.id });
        summary.appointment_reminder += 1;
      }

      // Review + rebook hourly
      if (minute < 15) {
        const review = await getEnabledByType(tid, 'review_request');
        if (review) {
          await executeAutomation({ tenantId: tid, automationId: review.id });
          summary.review += 1;
        }
        const rebook = await getEnabledByType(tid, 'rebooking_reminder');
        if (rebook) {
          await executeAutomation({ tenantId: tid, automationId: rebook.id });
          summary.rebook += 1;
        }
      }
    } catch (err) {
      summary.errors += 1;
      console.warn('[automation-tick] tenant failed', tid, err.message);
    }
  }
  return summary;
}

/**
 * Gate for legacy day-before / abandoned runners — skip tenant if automation disabled.
 */
async function shouldRunLegacy(tenantId, type) {
  const { isTypeEnabled } = require('./crmAutomationService');
  return isTypeEnabled(tenantId, type);
}

module.exports = {
  executeAutomation,
  tickScheduledAutomations,
  shouldRunLegacy,
  runAppointmentReminder,
  runTwoHourReminders,
  runAbandoned,
  delayToMs,
};
