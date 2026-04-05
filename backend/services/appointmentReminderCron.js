'use strict';

const cron = require('node-cron');
const { Op } = require('sequelize');
const { sendToTokens } = require('./fcmService');

let _models = null;
function getModels() {
  if (!_models) _models = require('../models');
  return _models;
}

/**
 * Resolves the FCM tokens to notify for an appointment.
 *
 * - If the appointment has an assigned staff member, notify ONLY that staff
 *   member's linked user token.
 * - If no staff is assigned, fall back to all tokens for the branch.
 */
async function _resolveTokens(appt, StaffFcmToken, User) {
  if (appt.staff_id) {
    // Find the User whose staff_id links to this Staff row
    const user = await User.findOne({
      where: { staff_id: appt.staff_id },
      attributes: ['id'],
    });

    if (user) {
      const row = await StaffFcmToken.findOne({
        where: { user_id: user.id },
        attributes: ['fcm_token'],
      });
      if (row) return [row.fcm_token];
    }
    // Staff assigned but no token registered for them — no notification
    return [];
  }

  // No staff assigned → notify everyone registered for this branch
  const rows = await StaffFcmToken.findAll({
    where: {
      [Op.or]: [
        { branch_id: appt.branch_id },
        { branch_id: null },
      ],
    },
    attributes: ['fcm_token'],
  });
  return rows.map((r) => r.fcm_token);
}

/**
 * Runs every minute. Finds appointments starting in ~15 minutes
 * (window: 14–16 min from now) with status pending/confirmed,
 * then sends FCM push notifications to the assigned staff member only
 * (or all branch staff if no one is assigned).
 */
function startAppointmentReminderCron() {
  cron.schedule('* * * * *', async () => {
    try {
      const { Appointment, Service, StaffFcmToken, User } = getModels();

      const now = new Date();

      const windowStart = new Date(now.getTime() + 14 * 60 * 1000);
      const windowEnd   = new Date(now.getTime() + 16 * 60 * 1000);

      const pad = (n) => String(n).padStart(2, '0');
      const todayStr  = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const toTimeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

      const appointments = await Appointment.findAll({
        where: {
          date:   todayStr,
          time:   { [Op.between]: [toTimeStr(windowStart), toTimeStr(windowEnd)] },
          status: { [Op.in]: ['pending', 'confirmed'] },
        },
        include: [
          { model: Service, as: 'service', attributes: ['name'] },
        ],
      });

      if (appointments.length === 0) return;

      for (const appt of appointments) {
        const timeLabel = appt.time ? String(appt.time).slice(0, 5) : '';
        const svcName   = appt.service?.name || 'Appointment';

        const tokens = await _resolveTokens(appt, StaffFcmToken, User);
        if (tokens.length === 0) continue;

        const title = `⏰ Upcoming Appointment in 15 min`;
        const body  = `${appt.customer_name} — ${svcName} at ${timeLabel}`;

        await sendToTokens(tokens, title, body, {
          type:           'appointment_reminder',
          appointment_id: String(appt.id),
          branch_id:      String(appt.branch_id),
          customer_name:  appt.customer_name,
          service:        svcName,
          time:           timeLabel,
          date:           appt.date,
        });

        const target = appt.staff_id ? `staff #${appt.staff_id}` : `branch #${appt.branch_id} (all)`;
        console.log(`[ReminderCron] Sent reminder for appointment #${appt.id} → ${target} (${tokens.length} device(s))`);
      }
    } catch (err) {
      console.error('[ReminderCron] Error:', err.message);
    }
  });

  console.log('✓ Appointment reminder cron started (runs every minute).');
}

module.exports = { startAppointmentReminderCron };
