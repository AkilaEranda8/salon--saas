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
 * Send SMS for recurring appointments scheduled today (selected visit day).
 * Idempotent via appointments.recurring_sms_sent_at.
 */
async function runRecurringDaySms(dateOverride) {
  const { Appointment, Branch, Service, Customer } = getModels();
  const { sendSMS, getChannelFlags, getTemplate, interpolate } = require('./notificationService');
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
      flags = { recurring_reminder_sms: true };
    }
    // Controlled from Notifications → Recurring Visit Reminder → SMS
    if (flags && flags.recurring_reminder_sms === false) continue;

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
      await sendSMS({
        to: phone,
        message: smsMsg,
        meta: {
          customer_name: customerName,
          event_type: 'recurring_reminder',
          branch_id: appt.branch_id,
          tenant_id: tid,
        },
      });
      await appt.update({ recurring_sms_sent_at: new Date() });
      sent += 1;
    } catch (err) {
      console.error('[recurringSmsCron] send failed', appt.id, err.message);
    }
  }

  if (sent > 0) {
    console.log(`[recurringSmsCron] sent ${sent} SMS for ${today}`);
  }
  return { date: today, candidates: rows.length, sent };
}

function startRecurringSmsCron() {
  // Every 15 minutes — catch same-day appointments; idempotent
  cron.schedule('*/15 * * * *', () => {
    runRecurringDaySms().catch((e) => console.error('[recurringSmsCron]', e.message));
  });
  // Also once at 08:00 Asia/Colombo-ish (server may be UTC — 02:30 UTC ≈ 08:00 SL)
  cron.schedule('30 2 * * *', () => {
    runRecurringDaySms().catch((e) => console.error('[recurringSmsCron]', e.message));
  });
  console.log('[recurringSmsCron] scheduled');
}

module.exports = { startRecurringSmsCron, runRecurringDaySms };
