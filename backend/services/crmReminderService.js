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
const { isTenantCrmEligible } = require('../utils/tenantFeatures');
const { slToday, slDatePlusDays } = require('../utils/dateUtils');
const { getWabaByTenant } = require('./whatsappCloudService');

/** Tomorrow in Sri Lanka (server runs in UTC). */
function tomorrowDateOnly() {
  return slDatePlusDays(1);
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
  const { sendAndLog } = require('./crmOutboundSendService');
  const waba = await getWabaByTenant(tenantId);
  const templateName = waba?.enabled
    ? (kind === 'confirm' ? waba.template_confirm : waba.template_reminder)
    : null;
  const timeShort = String(time || '').slice(0, 5);
  const textFallback = kind === 'confirm'
    ? `Hi ${customerName || 'there'}! Your appointment is confirmed:\n${serviceName} with ${staffName}\n${date} at ${timeShort}\nSee you soon!`
    : `Reminder: Hi ${customerName || 'there'}, you have ${serviceName} tomorrow (${date}) at ${timeShort} with ${staffName}. Reply if you need to reschedule.`;

  try {
    const queued = await sendAndLog({
      tenantId,
      phone,
      text: textFallback,
      senderType: 'automation',
      conversationId: conversationId || null,
      name: customerName || null,
      templateName: templateName || null,
      templateParams: [
        customerName || 'Customer',
        serviceName || 'Service',
        `${date} ${timeShort}`,
      ],
      meta: {
        source: kind === 'confirm' ? 'booking_confirm' : 'appointment_reminder',
        appointment_id: appointmentId || null,
        lead_id: leadId || null,
      },
    });
    if (queued?.skipped) {
      throw new Error(`send_skipped:${queued.reason || 'unknown'}`);
    }

    await CrmFollowUpJob.create({
      tenant_id: tenantId,
      job_type: kind === 'confirm' ? 'booking_confirm' : 'appointment_reminder',
      status: 'sent',
      appointment_id: appointmentId || null,
      conversation_id: queued.conversationId || conversationId || null,
      lead_id: leadId || null,
      phone,
      sent_at: new Date(),
      meta: {
        channel: 'queued_wa_outbound',
        crm_message_id: queued.messageId || null,
        template: templateName || null,
      },
    });

    return { skipped: false, queued: true, ...queued, channel: 'queued_wa_outbound' };
  } catch (err) {
    await CrmFollowUpJob.create({
      tenant_id: tenantId,
      job_type: kind === 'confirm' ? 'booking_confirm' : 'appointment_reminder',
      status: 'failed',
      appointment_id: appointmentId || null,
      conversation_id: conversationId || null,
      lead_id: leadId || null,
      phone,
      error_message: err.message,
    });
    throw err;
  }
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
    if (!isTenantCrmEligible(tenant)) {
      skipped += 1;
      continue;
    }
    try {
      const { shouldRunLegacy } = require('./crmAutomationRunner');
      const ok = await shouldRunLegacy(waba.tenant_id, 'appointment_reminder');
      if (!ok) {
        skipped += 1;
        continue;
      }
    } catch { /* automations optional */ }

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
 * Sent through sendAndLog → WA_OUTBOUND (Cloud first, QR fallback in the worker).
 */
const DEFAULT_ABANDONED_DELAY_MS = 2 * 60 * 60 * 1000;
const MIN_ABANDONED_DELAY_MS = 30 * 60 * 1000;

const ABANDONED_DELAY_MAP = {
  '30_minutes': 30 * 60 * 1000,
  '2_hours': 2 * 60 * 60 * 1000,
  '6_hours': 6 * 60 * 60 * 1000,
  '24_hours': 24 * 60 * 60 * 1000,
  '1_day': 24 * 60 * 60 * 1000,
};

/** Delay from the tenant's abandoned_booking automation (settings / delay column), else 2h. */
async function getAbandonedDelayMs(tenantId) {
  try {
    const { CrmAutomation } = require('../models');
    const row = await CrmAutomation.findOne({
      where: { tenant_id: tenantId, type: 'abandoned_booking' },
      order: [['id', 'ASC']],
    });
    const settings = row?.settings_json || {};
    const raw = row?.delay || settings.delay || settings.delay_hours;
    if (typeof raw === 'number' || /^\d+(\.\d+)?$/.test(String(raw || ''))) {
      const hrs = Number(raw);
      if (hrs > 0) return Math.max(hrs * 3600 * 1000, MIN_ABANDONED_DELAY_MS);
    }
    return ABANDONED_DELAY_MAP[raw] || DEFAULT_ABANDONED_DELAY_MS;
  } catch {
    return DEFAULT_ABANDONED_DELAY_MS;
  }
}

/**
 * @param {object} opts
 * @param {number|null} [opts.tenantId]
 * @param {number|null} [opts.delayMs] — force delay for all leads (automation run); otherwise per-tenant setting
 */
async function runAbandonedBookingNudges({ tenantId = null, delayMs = null } = {}) {
  // Without an explicit delay, scan from the smallest supported delay and filter per tenant below.
  const scanDelay = delayMs || MIN_ABANDONED_DELAY_MS;
  const delayByTenant = new Map();
  const cutoff = new Date(Date.now() - scanDelay);
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
    if (!isTenantCrmEligible(tenant)) continue;
    try {
      const { shouldRunLegacy } = require('./crmAutomationRunner');
      const ok = await shouldRunLegacy(lead.tenant_id, 'abandoned_booking');
      if (!ok) continue;
    } catch { /* automations optional */ }

    // Honor per-tenant delay from automation settings (default 2h)
    let tenantDelay = delayMs;
    if (!tenantDelay) {
      if (!delayByTenant.has(lead.tenant_id)) {
        delayByTenant.set(lead.tenant_id, await getAbandonedDelayMs(lead.tenant_id));
      }
      tenantDelay = delayByTenant.get(lead.tenant_id);
    }
    if (lead.last_message_at && new Date(lead.last_message_at).getTime() > Date.now() - tenantDelay) {
      continue;
    }

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
        date: { [Op.gte]: slToday() },
      },
    });
    if (booked) continue;

    const text = `Hi${lead.name ? ` ${lead.name}` : ''}! Still want to book with us? Reply *book* and I’ll help you finish in a minute.`;
    let queued = null;
    let lastError = null;

    // Logs a CrmMessage and sends via WA_OUTBOUND (Cloud w/ 24h check, else QR)
    try {
      const { sendAndLog } = require('./crmOutboundSendService');
      queued = await sendAndLog({
        tenantId: lead.tenant_id,
        phone: lead.phone,
        text,
        senderType: 'automation',
        name: lead.name || null,
        meta: { source: 'abandoned_booking_nudge', event_type: 'abandoned_booking_nudge', lead_id: lead.id },
      });
      if (queued?.skipped) {
        lastError = queued.reason || 'send_skipped';
        queued = null;
      }
    } catch (err) {
      lastError = err.message;
    }

    if (queued) {
      await CrmFollowUpJob.create({
        tenant_id: lead.tenant_id,
        job_type: 'abandoned_booking',
        status: 'sent',
        lead_id: lead.id,
        conversation_id: queued.conversationId || null,
        phone: lead.phone,
        sent_at: new Date(),
        meta: { channel: 'queued_wa_outbound', crm_message_id: queued.messageId || null },
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
  await q.add(
    'automation-tick',
    { job: 'automation_tick' },
    {
      repeat: { pattern: '5 * * * *' },
      jobId: 'repeat:automation-tick',
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  );

  await q.add(
    'handoff-auto-release',
    { job: 'handoff_auto_release' },
    {
      repeat: { pattern: '*/15 * * * *' },
      jobId: 'repeat:handoff-auto-release',
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
