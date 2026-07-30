'use strict';

const cron = require('node-cron');
const { Op } = require('sequelize');
const { slToday } = require('../utils/dateUtils');

let _models = null;
function getModels() {
  if (!_models) _models = require('../models');
  return _models;
}

/**
 * Send day-of recurring visit reminders (SMS / WhatsApp) for appointments today.
 * Channel toggles: Notifications → Recurring Visit Reminder.
 * If recurring_message_template_ids is set, every selected channel template is sent.
 * The legacy recurring_message_template_id remains supported for older bookings.
 * Idempotent via appointments.recurring_sms_sent_at.
 */
async function runRecurringDaySms(dateOverride) {
  const { Appointment, Branch, Service, Customer } = getModels();
  const {
    sendSMS, sendWhatsApp, getChannelFlags, getTemplate, resolveChosenTemplate, interpolate,
  } = require('./notificationService');
  const today = dateOverride || slToday();

  const rows = await Appointment.findAll({
    where: {
      date: today,
      status: { [Op.in]: ['pending', 'confirmed'] },
      recurring_sms_sent_at: null,
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

  let sent = 0;
  for (const appt of rows) {
    const phone = appt.phone || appt.customer?.phone;
    if (!phone) continue;

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

    const date = appt.date || today;
    const time = appt.time ? String(appt.time).slice(0, 5) : '—';
    const svcName = appt.service?.name || '—';
    const brName = appt.branch?.name || '—';
    const customerName = appt.customer_name || appt.customer?.name || 'Customer';
    const vars = {
      customer_name: customerName,
      date,
      time,
      service_name: svcName,
      branch_name: brName,
      amount: appt.amount != null ? `Rs. ${parseFloat(appt.amount).toFixed(2)}` : '—',
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

    // Staff picked recurring templates at booking time — send each selected channel.
    if (selectedIds.length) {
      const sentChannels = new Set();
      for (const templateId of selectedIds) {
        const chosen = await resolveChosenTemplate(templateId, 'recurring_reminder', tid);
        if (!chosen || sentChannels.has(chosen.channel)) continue;

        const msg = interpolate(chosen.body, vars);
        try {
          if (chosen.channel === 'sms' && smsOn) {
            await sendSMS({ to: phone, message: msg, meta, tenantId: tid });
            sentChannels.add(chosen.channel);
            anyOk = true;
          } else if (chosen.channel === 'whatsapp' && waOn) {
            await sendWhatsApp({ to: phone, message: msg, meta, tenantId: tid });
            sentChannels.add(chosen.channel);
            anyOk = true;
          }
        } catch (err) {
          console.error('[recurringSmsCron] selected template failed', appt.id, templateId, err.message);
        }
      }

      if (anyOk) {
        await appt.update({ recurring_sms_sent_at: new Date() });
        sent += 1;
      }
      continue;
    }

    // Backward compatibility for appointments saved before multi-channel selection.
    const chosen = await resolveChosenTemplate(
      appt.recurring_message_template_id,
      'recurring_reminder',
      tid
    );
    if (chosen) {
      const msg = interpolate(chosen.body, vars);
      try {
        if (chosen.channel === 'sms' && smsOn) {
          await sendSMS({ to: phone, message: msg, meta, tenantId: tid });
          anyOk = true;
        } else if (chosen.channel === 'whatsapp' && waOn) {
          await sendWhatsApp({ to: phone, message: msg, meta, tenantId: tid });
          anyOk = true;
        }
      } catch (err) {
        console.error('[recurringSmsCron] chosen template failed', appt.id, err.message);
      }

      if (anyOk) {
        await appt.update({ recurring_sms_sent_at: new Date() });
        sent += 1;
      }
      continue;
    }

    if (smsOn) {
      let smsMsg;
      try {
        const tpl = await getTemplate('recurring_reminder', 'sms', tid);
        smsMsg = tpl
          ? interpolate(tpl.body, vars)
          : `${brName}\nHi ${customerName}! Reminder for your recurring visit today.\nService: ${svcName}\nDate: ${date} | ${time}\nBranch: ${brName}\nSee you soon!`;
      } catch {
        smsMsg = `${brName}\nHi ${customerName}! Reminder for your recurring visit today.\nService: ${svcName}\nDate: ${date} | ${time}\nBranch: ${brName}\nSee you soon!`;
      }
      try {
        await sendSMS({ to: phone, message: smsMsg, meta, tenantId: tid });
        anyOk = true;
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
          : `✂️ *${brName} — Recurring Visit Reminder*\n\nHi ${customerName}! Reminder for your visit today:\n\n📅 Date: ${date}\n⏰ Time: ${time}\n💇 Service: ${svcName}\n🏠 Branch: ${brName}\n\nSee you soon! 😊`;
      } catch {
        waMsg = `✂️ *${brName} — Recurring Visit Reminder*\n\nHi ${customerName}! Reminder for your visit today:\n\n📅 Date: ${date}\n⏰ Time: ${time}\n💇 Service: ${svcName}\n🏠 Branch: ${brName}\n\nSee you soon! 😊`;
      }
      try {
        await sendWhatsApp({ to: phone, message: waMsg, meta, tenantId: tid });
        anyOk = true;
      } catch (err) {
        console.error('[recurringSmsCron] WhatsApp failed', appt.id, err.message);
      }
    }

    if (anyOk) {
      await appt.update({ recurring_sms_sent_at: new Date() });
      sent += 1;
    }
  }

  if (sent > 0) {
    console.log(`[recurringSmsCron] reminded ${sent} customers for ${today}`);
  }
  return { date: today, candidates: rows.length, sent };
}

function startRecurringSmsCron() {
  cron.schedule('*/15 * * * *', () => {
    runRecurringDaySms().catch((e) => console.error('[recurringSmsCron]', e.message));
  });
  cron.schedule('30 2 * * *', () => {
    runRecurringDaySms().catch((e) => console.error('[recurringSmsCron]', e.message));
  });
  console.log('[recurringSmsCron] scheduled');
}

module.exports = { startRecurringSmsCron, runRecurringDaySms };
