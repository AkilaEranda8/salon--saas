/**
 * WhatsApp Cloud confirmations + day-before reminders for AI CRM tenants.
 */
'use strict';

const { Op } = require('sequelize');
const {
  Appointment,
  Service,
  Staff,
  Tenant,
  WhatsAppBusinessAccount,
  CrmFollowUpJob,
  CrmLead,
} = require('../models');
const { hasTenantFeature } = require('../utils/tenantFeatures');
const {
  getWabaByTenant,
  sendCloudText,
  sendCloudTemplate,
} = require('./whatsappCloudService');

function tomorrowDateOnly() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function bodyParams(values) {
  return [{
    type: 'body',
    parameters: values.map((text) => ({ type: 'text', text: String(text ?? '').slice(0, 60) || '-' })),
  }];
}

async function sendConfirmOrReminder({
  tenantId,
  phone,
  kind, // confirm | reminder
  customerName,
  serviceName,
  staffName,
  date,
  time,
  appointmentId,
  conversationId,
  leadId,
}) {
  const waba = await getWabaByTenant(tenantId);
  if (!waba || !waba.enabled) {
    return { skipped: true, reason: 'waba_disabled' };
  }

  const templateName = kind === 'confirm' ? waba.template_confirm : waba.template_reminder;
  const timeShort = String(time || '').slice(0, 5);
  const textFallback = kind === 'confirm'
    ? `Hi ${customerName || 'there'}! Your appointment is confirmed:\n${serviceName} with ${staffName}\n${date} at ${timeShort}\nSee you soon!`
    : `Reminder: Hi ${customerName || 'there'}, you have ${serviceName} tomorrow (${date}) at ${timeShort} with ${staffName}. Reply if you need to reschedule.`;

  let result;
  let channel = 'text';
  try {
    if (templateName) {
      channel = 'template';
      result = await sendCloudTemplate({
        tenantId,
        to: phone,
        templateName,
        languageCode: 'en',
        components: bodyParams([customerName || 'Customer', serviceName || 'Service', `${date} ${timeShort}`]),
        wabaRow: waba,
      });
    } else {
      result = await sendCloudText({
        tenantId,
        to: phone,
        body: textFallback,
        wabaRow: waba,
      });
    }
  } catch (err) {
    // Template fail → try session text once
    if (channel === 'template') {
      try {
        channel = 'text_fallback';
        result = await sendCloudText({
          tenantId,
          to: phone,
          body: textFallback,
          wabaRow: waba,
        });
      } catch (err2) {
        await CrmFollowUpJob.create({
          tenant_id: tenantId,
          job_type: kind === 'confirm' ? 'booking_confirm' : 'appointment_reminder',
          status: 'failed',
          appointment_id: appointmentId || null,
          conversation_id: conversationId || null,
          lead_id: leadId || null,
          phone,
          error_message: err2.message || err.message,
          meta: { template: templateName, first_error: err.message },
        });
        throw err2;
      }
    } else {
      await CrmFollowUpJob.create({
        tenant_id: tenantId,
        job_type: kind === 'confirm' ? 'booking_confirm' : 'appointment_reminder',
        status: 'failed',
        appointment_id: appointmentId || null,
        phone,
        error_message: err.message,
      });
      throw err;
    }
  }

  await CrmFollowUpJob.create({
    tenant_id: tenantId,
    job_type: kind === 'confirm' ? 'booking_confirm' : 'appointment_reminder',
    status: 'sent',
    appointment_id: appointmentId || null,
    conversation_id: conversationId || null,
    lead_id: leadId || null,
    phone,
    sent_at: new Date(),
    meta: { channel, waMessageId: result?.waMessageId, template: templateName || null },
  });

  return { skipped: false, ...result, channel };
}

/**
 * Called after AI CRM creates a confirmed appointment.
 */
async function sendBookingConfirmation({
  tenantId,
  appointment,
  phone,
  conversationId,
  leadId,
}) {
  if (!appointment?.id || !phone) return { skipped: true, reason: 'missing_data' };

  const existing = await CrmFollowUpJob.findOne({
    where: {
      tenant_id: tenantId,
      appointment_id: appointment.id,
      job_type: 'booking_confirm',
      status: 'sent',
    },
  });
  if (existing) return { skipped: true, reason: 'already_sent' };

  const [service, staff] = await Promise.all([
    appointment.service_id ? Service.findByPk(appointment.service_id) : null,
    appointment.staff_id ? Staff.findByPk(appointment.staff_id) : null,
  ]);

  return sendConfirmOrReminder({
    tenantId,
    phone,
    kind: 'confirm',
    customerName: appointment.customer_name,
    serviceName: service?.name || 'Appointment',
    staffName: staff?.name || 'our team',
    date: appointment.date,
    time: appointment.time,
    appointmentId: appointment.id,
    conversationId,
    leadId,
  });
}

async function runDayBeforeReminders({ tenantId = null } = {}) {
  const date = tomorrowDateOnly();
  const where = { enabled: true };
  if (tenantId) where.tenant_id = Number(tenantId);

  const accounts = await WhatsAppBusinessAccount.findAll({ where });
  let sent = 0;
  let skipped = 0;

  for (const waba of accounts) {
    const tenant = await Tenant.findByPk(waba.tenant_id);
    if (!tenant || !hasTenantFeature(tenant, 'whatsapp_ai_crm')) {
      skipped += 1;
      continue;
    }

    const appts = await Appointment.findAll({
      where: {
        tenant_id: waba.tenant_id,
        date,
        status: { [Op.in]: ['pending', 'confirmed'] },
        phone: { [Op.ne]: null },
      },
      limit: 500,
    });

    for (const appt of appts) {
      if (!appt.phone) continue;
      const already = await CrmFollowUpJob.findOne({
        where: {
          tenant_id: waba.tenant_id,
          appointment_id: appt.id,
          job_type: 'appointment_reminder',
          status: 'sent',
        },
      });
      if (already) {
        skipped += 1;
        continue;
      }

      try {
        const [service, staff] = await Promise.all([
          Service.findByPk(appt.service_id),
          Staff.findByPk(appt.staff_id),
        ]);
        await sendConfirmOrReminder({
          tenantId: waba.tenant_id,
          phone: appt.phone,
          kind: 'reminder',
          customerName: appt.customer_name,
          serviceName: service?.name || 'Appointment',
          staffName: staff?.name || 'our team',
          date: appt.date,
          time: appt.time,
          appointmentId: appt.id,
        });
        sent += 1;
      } catch (err) {
        console.warn('[crmReminders] reminder failed', appt.id, err.message);
      }
    }
  }

  console.log(`[crmReminders] day-before done sent=${sent} skipped=${skipped} date=${date} tenant=${tenantId || 'all'}`);
  return { sent, skipped, date, tenantId: tenantId || null };
}

/**
 * Nudge leads stuck in interested / booking_requested with no confirmed booking (2h+).
 * Cloud WABA first; on miss/failure fall back to QR via API process.
 */
async function sendAbandonedViaQrHttp(tenantId, phone, message) {
  const secret = process.env.AI_ENGINE_SERVICE_SECRET || process.env.CRM_SERVICE_SECRET || '';
  const backendUrl = (process.env.BACKEND_INTERNAL_URL || 'http://backend:5000').replace(/\/$/, '');
  if (!secret) return { ok: false, reason: 'no_service_secret' };
  try {
    const r = await fetch(`${backendUrl}/api/crm/internal/whatsapp-qr-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': secret,
        'X-Tenant-Id': String(tenantId),
      },
      body: JSON.stringify({
        tenantId,
        phone,
        message,
        event_type: 'abandoned_booking_nudge',
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.ok) {
      return { ok: false, reason: body.reason || `http_${r.status}`, body };
    }
    return { ok: true, channel: 'qr', ...body };
  } catch (err) {
    return { ok: false, reason: 'qr_api_error', error: err.message };
  }
}

async function runAbandonedBookingNudges({ tenantId = null } = {}) {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const recentFloor = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const leadWhere = {
    stage: { [Op.in]: ['interested', 'booking_requested'] },
    last_message_at: { [Op.between]: [recentFloor, cutoff] },
  };
  if (tenantId) leadWhere.tenant_id = Number(tenantId);

  const leads = await CrmLead.findAll({ where: leadWhere, limit: 200, order: [['last_message_at', 'ASC']] });
  let sent = 0;

  for (const lead of leads) {
    const tenant = await Tenant.findByPk(lead.tenant_id);
    if (!tenant || !hasTenantFeature(tenant, 'whatsapp_ai_crm')) continue;

    const already = await CrmFollowUpJob.findOne({
      where: {
        tenant_id: lead.tenant_id,
        lead_id: lead.id,
        job_type: 'abandoned_booking',
        status: 'sent',
        createdAt: { [Op.gte]: recentFloor },
      },
    });
    if (already) continue;

    const booked = await Appointment.findOne({
      where: {
        tenant_id: lead.tenant_id,
        phone: lead.phone,
        status: { [Op.in]: ['pending', 'confirmed'] },
        date: { [Op.gte]: new Date().toISOString().slice(0, 10) },
      },
    });
    if (booked) continue;

    const text = `Hi${lead.name ? ` ${lead.name}` : ''}! Still want to book with us? Reply *book* and I’ll help you finish in a minute.`;
    let channel = null;
    let lastError = null;

    const waba = await getWabaByTenant(lead.tenant_id);
    if (waba && waba.enabled) {
      try {
        await sendCloudText({
          tenantId: lead.tenant_id,
          to: lead.phone,
          body: text,
          wabaRow: waba,
        });
        channel = 'cloud';
      } catch (err) {
        lastError = err.message;
      }
    }

    if (!channel) {
      const qr = await sendAbandonedViaQrHttp(lead.tenant_id, lead.phone, text);
      if (qr.ok) {
        channel = 'qr';
      } else {
        lastError = qr.reason || qr.error || lastError || 'send_failed';
      }
    }

    if (channel) {
      await CrmFollowUpJob.create({
        tenant_id: lead.tenant_id,
        job_type: 'abandoned_booking',
        status: 'sent',
        lead_id: lead.id,
        phone: lead.phone,
        sent_at: new Date(),
        meta: { channel },
      });
      await lead.update({ follow_up_status: 'nudged' }).catch(() => {});
      sent += 1;
    } else {
      await CrmFollowUpJob.create({
        tenant_id: lead.tenant_id,
        job_type: 'abandoned_booking',
        status: 'failed',
        lead_id: lead.id,
        phone: lead.phone,
        error_message: String(lastError || 'send_failed').slice(0, 500),
      }).catch(() => {});
    }
  }

  console.log(`[crmReminders] abandoned nudges sent=${sent} tenant=${tenantId || 'all'}`);
  return { sent, tenantId: tenantId || null };
}

/**
 * Redis distributed lock — only one worker runs reminders (C11).
 */
async function withReminderLock(lockName, ttlSec, fn) {
  const { getRedis } = require('../utils/redis');
  const redis = getRedis();
  if (!redis) {
    // Without Redis, skip scheduled global runs (avoid multi-replica fan-out)
    console.warn(`[crmReminders] skip ${lockName} — Redis required for locked cron`);
    return { skipped: true, reason: 'redis_unavailable' };
  }
  const key = `lock:crm:${lockName}`;
  const token = `${process.pid}:${Date.now()}`;
  const ok = await redis.set(key, token, 'EX', ttlSec, 'NX');
  if (!ok) {
    return { skipped: true, reason: 'lock_held' };
  }
  try {
    return await fn();
  } finally {
    try {
      const cur = await redis.get(key);
      if (cur === token) await redis.del(key);
    } catch { /* ignore */ }
  }
}

/**
 * Register BullMQ repeatable jobs (preferred) — call from worker process only.
 */
async function scheduleReminderRepeatableJobs() {
  const { getQueue, QUEUE_NAMES, enqueue } = require('./queue');
  const q = getQueue(QUEUE_NAMES.FOLLOWUP);
  if (!q) {
    console.warn('[crmReminders] FOLLOWUP queue unavailable');
    return false;
  }

  await q.add(
    'day-before-reminders',
    { job: 'day_before_reminders' },
    {
      repeat: { pattern: '5 9 * * *' },
      jobId: 'repeat:day-before-reminders',
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  );
  await q.add(
    'abandoned-nudges',
    { job: 'abandoned_nudges' },
    {
      repeat: { pattern: '20 * * * *' },
      jobId: 'repeat:abandoned-nudges',
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  );

  // Warm-up enqueue unused to keep lint happy in some bundlers
  void enqueue;
  console.log('[crmReminders] BullMQ repeatable jobs registered');
  return true;
}

/** @deprecated Prefer BullMQ worker repeatable jobs — no-op on API servers (C11). */
function startCrmReminderCron() {
  console.log('[crmReminders] API server does not start reminder cron (worker-only)');
}

module.exports = {
  sendBookingConfirmation,
  runDayBeforeReminders,
  runAbandonedBookingNudges,
  startCrmReminderCron,
  scheduleReminderRepeatableJobs,
  withReminderLock,
};
