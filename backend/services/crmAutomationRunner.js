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
  sendWhatsApp,
  sendEmail,
} = require('./notificationService');
const { sendCloudText, getWabaByTenant } = require('./whatsappCloudService');

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
}) {
  const ch = String(channel || 'whatsapp').toLowerCase();
  if (ch === 'sms') {
    return sendSMS({ to: phone, message, tenantId, meta });
  }
  if (ch === 'email') {
    if (!email) return { skipped: true, reason: 'no_email' };
    return sendEmail({ to: email, subject: subject || 'Message from salon', html: `<p>${message}</p>`, text: message });
  }
  // Prefer Cloud WABA when available; fall back to Twilio-style WA
  const waba = await getWabaByTenant(tenantId);
  if (waba && waba.enabled) {
    try {
      return await sendCloudText({ tenantId, to: phone, body: message, wabaRow: waba });
    } catch (err) {
      console.warn('[automation] cloud WA failed, trying Twilio WA', err.message);
    }
  }
  return sendWhatsApp({ to: phone, message, tenantId, meta });
}

async function runAppointmentReminder(automation, tenantId) {
  const settings = automation.settings_json || {};
  const mode = automation.delay || settings.reminder_time || '1_day';
  if (mode === '2_hours') {
    return runTwoHourReminders(tenantId, automation);
  }
  // Reuse existing day-before CRM reminder job
  return runDayBeforeReminders({ tenantId });
}

async function runTwoHourReminders(tenantId, automation) {
  const now = new Date();
  const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const dateStr = now.toISOString().slice(0, 10);
  const startT = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const endT = `${String(inTwoHours.getHours()).padStart(2, '0')}:${String(inTwoHours.getMinutes()).padStart(2, '0')}`;

  const appts = await Appointment.findAll({
    where: {
      tenant_id: tenantId,
      date: dateStr,
      status: { [Op.in]: ['pending', 'confirmed'] },
      time: { [Op.between]: [startT, endT] },
      phone: { [Op.ne]: null },
    },
    limit: 100,
  });

  const settings = automation.settings_json || {};
  const template = settings.template
    || 'Reminder: Hi {{name}}, you have {{service}} today at {{time}}. See you soon!';
  let sent = 0;
  for (const appt of appts) {
    const already = await CrmFollowUpJob.findOne({
      where: {
        tenant_id: tenantId,
        appointment_id: appt.id,
        job_type: 'appointment_reminder',
        status: 'sent',
        createdAt: { [Op.gte]: new Date(Date.now() - 12 * 60 * 60 * 1000) },
      },
    });
    if (already) continue;
    const svc = appt.service_id
      ? await Service.findByPk(appt.service_id, { attributes: ['name'] }).catch(() => null)
      : null;
    const msg = interpolate(template, {
      name: appt.customer_name || 'there',
      service: svc?.name || 'appointment',
      date: appt.date,
      time: String(appt.time || '').slice(0, 5),
      staff: '',
      salon: '',
    });
    try {
      await sendViaChannel({
        tenantId,
        channel: automation.channel,
        phone: appt.phone,
        message: msg,
        meta: { event_type: 'automation_appointment_reminder', appointment_id: appt.id },
      });
      await CrmFollowUpJob.create({
        tenant_id: tenantId,
        job_type: 'appointment_reminder',
        status: 'sent',
        appointment_id: appt.id,
        phone: appt.phone,
        sent_at: new Date(),
        meta: { via: 'automation', delay: '2_hours' },
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
  return { sent, scanned: appts.length, mode: '2_hours' };
}

async function runAbandoned(automation, tenantId) {
  // Existing runner is the source of truth (2h+ stuck leads). Delay setting is documented in UI.
  return runAbandonedBookingNudges({ tenantId });
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
  const today = new Date();
  const todays = customers.filter((c) => {
    if (!c.dob) return false;
    const b = new Date(c.dob);
    return b.getMonth() === today.getMonth() && b.getDate() === today.getDate();
  });

  let sent = 0;
  for (const c of todays) {
    if (!c.phone) continue;
    const already = await CrmFollowUpJob.findOne({
      where: {
        tenant_id: tenantId,
        job_type: 'birthday',
        phone: c.phone,
        status: 'sent',
        createdAt: { [Op.gte]: startOfToday() },
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

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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
  let sent = 0;
  for (const c of customers) {
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

  const customers = await Customer.findAll({
    where,
    attributes: ['id', 'name', 'phone', 'email', 'loyalty_points'],
    limit: 200,
    order: [['id', 'DESC']],
  });

  let sent = 0;
  for (const c of customers) {
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
  return { sent, scanned: customers.length, segment };
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
  const tenants = await Tenant.findAll({ attributes: ['id'], limit: 500 });
  const summary = { birthday: 0, review: 0, rebook: 0 };
  const hour = new Date().getHours();
  const minute = new Date().getMinutes();

  for (const t of tenants) {
    const tid = t.id;
    // Birthday around 09:00
    if (hour === 9 && minute < 20) {
      const auto = await getEnabledByType(tid, 'birthday_wishes');
      if (auto) {
        await executeAutomation({ tenantId: tid, automationId: auto.id });
        summary.birthday += 1;
      }
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
  runAbandoned,
  delayToMs,
};
