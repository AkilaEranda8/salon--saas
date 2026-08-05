'use strict';

const cron = require('node-cron');
const { Op } = require('sequelize');
const { slToday, slTimeString } = require('../utils/dateUtils');

let _models = null;
function getModels() {
  if (!_models) _models = require('../models');
  return _models;
}

/**
 * Claim an appointment for recurring reminder send (atomic — prevents double SMS).
 * Returns true if this worker claimed it.
 */
async function claimRecurringSms(appointmentId) {
  const { Appointment } = getModels();
  const [affected] = await Appointment.update(
    { recurring_sms_sent_at: new Date() },
    { where: { id: appointmentId, recurring_sms_sent_at: null } }
  );
  return Number(affected) > 0;
}

function reminderClock(appt) {
  const raw = appt.recurring_sms_time || appt.time || '08:00';
  return String(raw).slice(0, 5);
}

/**
 * Send recurring visit reminders (SMS / WhatsApp) on the selected date
 * at/after the preferred time (Asia/Colombo) — not at midnight.
 * Idempotent via appointments.recurring_sms_sent_at.
 */
async function runRecurringDaySms(dateOverride) {
  const { Appointment, Branch, Service, Customer } = getModels();
  const {
    sendSMS, sendWhatsApp, getChannelFlags, getTemplate, resolveChosenTemplate, interpolate,
  } = require('./notificationService');
  const today = dateOverride || slToday();
  const nowHm = slTimeString().slice(0, 5);

  const rows = await Appointment.findAll({
    where: {
      is_recurring: true,
      recurring_sms_sent_at: null,
      recurring_next_date: today,
    },
    include: [
      { model: Branch, as: 'branch', attributes: ['id', 'name', 'phone'], required: false },
      { model: Service, as: 'service', attributes: ['id', 'name'], required: false },
      { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'], required: false },
    ],
    limit: 500,
  });

  // Legacy: auto-booked next visits still sitting as pending/confirmed for today
  // (created before reminder-only mode). Remind at their slot time, not midnight.
  const legacyRows = await Appointment.findAll({
    where: {
      date: today,
      status: { [Op.in]: ['pending', 'confirmed'] },
      recurring_sms_sent_at: null,
      recurring_next_date: null,
      [Op.or]: [
        { is_recurring: true },
        { recurrence_parent_id: { [Op.ne]: null } },
      ],
    },
    include: [
      { model: Branch, as: 'branch', attributes: ['id', 'name', 'phone'], required: false },
      { model: Service, as: 'service', attributes: ['id', 'name'], required: false },
      { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'], required: false },
    ],
    limit: 500,
  });

  const byId = new Map();
  for (const row of [...rows, ...legacyRows]) byId.set(row.id, row);
  const candidates = [...byId.values()].filter((appt) => reminderClock(appt) <= nowHm);

  let sent = 0;
  for (const appt of candidates) {
    const phone = appt.phone || appt.customer?.phone;
    if (!phone) continue;

    const claimed = await claimRecurringSms(appt.id);
    if (!claimed) continue;

    const tid = appt.tenant_id || null;
    let flags;
    try {
      flags = await getChannelFlags(tid);
    } catch {
      flags = { recurring_reminder_sms: true, recurring_reminder_whatsapp: true };
    }

    const smsOn = flags?.recurring_reminder_sms !== false;
    const waOn = flags?.recurring_reminder_whatsapp !== false;
    if (!smsOn && !waOn) continue;

    const date = appt.recurring_next_date || appt.date || today;
    const time = reminderClock(appt);
    const svcName = appt.service?.name || '-';
    const brName = appt.branch?.name || '-';
    const customerName = appt.customer_name || appt.customer?.name || 'Customer';
    const vars = {
      customer_name: customerName,
      date,
      time,
      service_name: svcName,
      branch_name: brName,
      amount: appt.amount != null ? `Rs. ${parseFloat(appt.amount).toFixed(2)}` : '-',
    };
    const meta = {
      customer_name: customerName,
      event_type: 'recurring_reminder',
      branch_id: appt.branch_id,
      tenant_id: tid,
    };

    let anyOk = false;

    const selectedIds = Array.isArray(appt.recurring_message_template_ids)
      ? [...new Set(appt.recurring_message_template_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
      : [];

    if (selectedIds.length) {
      const sentChannels = new Set();
      for (const templateId of selectedIds) {
        const chosen = await resolveChosenTemplate(templateId, 'recurring_reminder', tid);
        if (!chosen || sentChannels.has(chosen.channel)) continue;

        const msg = interpolate(chosen.body, vars);
        try {
          if (chosen.channel === 'sms' && smsOn) {
            const result = await sendSMS({ to: phone, message: msg, meta, tenantId: tid });
            if (result?.status === 'sent') {
              sentChannels.add(chosen.channel);
              anyOk = true;
            }
          } else if (chosen.channel === 'whatsapp' && waOn) {
            await sendWhatsApp({ to: phone, message: msg, meta, tenantId: tid });
            sentChannels.add(chosen.channel);
            anyOk = true;
          }
        } catch (err) {
          console.error('[recurringSmsCron] selected template failed', appt.id, templateId, err.message);
        }
      }

      if (anyOk) sent += 1;
      continue;
    }

    const chosen = await resolveChosenTemplate(
      appt.recurring_message_template_id,
      'recurring_reminder',
      tid
    );
    if (chosen) {
      const msg = interpolate(chosen.body, vars);
      try {
        if (chosen.channel === 'sms' && smsOn) {
          const result = await sendSMS({ to: phone, message: msg, meta, tenantId: tid });
          if (result?.status === 'sent') anyOk = true;
        } else if (chosen.channel === 'whatsapp' && waOn) {
          await sendWhatsApp({ to: phone, message: msg, meta, tenantId: tid });
          anyOk = true;
        }
      } catch (err) {
        console.error('[recurringSmsCron] chosen template failed', appt.id, err.message);
      }

      if (anyOk) sent += 1;
      continue;
    }

    if (smsOn) {
      let smsMsg;
      try {
        const tpl = await getTemplate('recurring_reminder', 'sms', tid);
        smsMsg = tpl
          ? interpolate(tpl.body, vars)
          : `${brName}: Hi ${customerName}, reminder for ${date} at ${time} (${svcName}). See you!`;
      } catch {
        smsMsg = `${brName}: Hi ${customerName}, reminder for ${date} at ${time} (${svcName}). See you!`;
      }
      try {
        const result = await sendSMS({ to: phone, message: smsMsg, meta, tenantId: tid });
        if (result?.status === 'sent') anyOk = true;
      } catch (err) {
        console.error('[recurringSmsCron] SMS failed', appt.id, err.message);
      }
    }

    if (waOn) {
      let waMsg;
      try {
        const tpl = await getTemplate('recurring_reminder', 'whatsapp', tid);
        waMsg = tpl
          ? interpolate(tpl.body, vars)
          : `*${brName} — Visit Reminder*\n\nHi ${customerName}! Reminder for your visit:\n\nDate: ${date}\nTime: ${time}\nService: ${svcName}\nBranch: ${brName}\n\nSee you soon!`;
      } catch {
        waMsg = `*${brName} — Visit Reminder*\n\nHi ${customerName}! Reminder for your visit:\n\nDate: ${date}\nTime: ${time}\nService: ${svcName}\nBranch: ${brName}\n\nSee you soon!`;
      }
      try {
        await sendWhatsApp({ to: phone, message: waMsg, meta, tenantId: tid });
        anyOk = true;
      } catch (err) {
        console.error('[recurringSmsCron] WhatsApp failed', appt.id, err.message);
      }
    }

    if (anyOk) sent += 1;
  }

  if (sent > 0) {
    console.log(`[recurringSmsCron] reminded ${sent} customers for ${today} (at/after local time)`);
  }
  return { date: today, candidates: candidates.length, sent };
}

function startRecurringSmsCron() {
  cron.schedule('*/15 * * * *', () => {
    runRecurringDaySms().catch((e) => console.error('[recurringSmsCron]', e.message));
  });
}

module.exports = { startRecurringSmsCron, runRecurringDaySms };
