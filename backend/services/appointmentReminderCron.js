'use strict';

const cron = require('node-cron');
const { Op } = require('sequelize');
const { sendToTokens } = require('./fcmService');
const { slNow, slDateString } = require('../utils/dateUtils');

const REMINDER_BEFORE_START_MIN = 15;
const REMINDER_BEFORE_END_MIN = 15;
const WINDOW_MS = 60 * 1000; // ±1 minute

let _models = null;
function getModels() {
  if (!_models) _models = require('../models');
  return _models;
}

function slLocalMs(dateStr, timeStr) {
  const d = String(dateStr).slice(0, 10);
  const t = String(timeStr || '00:00:00').slice(0, 8);
  const [y, mo, day] = d.split('-').map(Number);
  const parts = t.split(':').map(Number);
  const hh = parts[0] || 0;
  const mm = parts[1] || 0;
  const ss = parts[2] || 0;
  return Date.UTC(y, mo - 1, day, hh, mm, ss);
}

function slNowMs() {
  const n = slNow();
  return Date.UTC(
    n.getUTCFullYear(),
    n.getUTCMonth(),
    n.getUTCDate(),
    n.getUTCHours(),
    n.getUTCMinutes(),
    n.getUTCSeconds(),
  );
}

function formatSlClock(ms) {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function totalDurationMinutes(entry) {
  const linked = entry.services;
  if (Array.isArray(linked) && linked.length > 0) {
    const sum = linked.reduce((acc, s) => acc + (Number(s.duration_minutes) || 0), 0);
    if (sum > 0) return sum;
  }
  const primary = Number(entry.service?.duration_minutes) || 0;
  return primary > 0 ? primary : 30;
}

function serviceLabel(entry, fallback = 'Appointment') {
  if (entry.services?.length) {
    return entry.services.map((s) => s.name).filter(Boolean).join(', ');
  }
  return entry.service?.name || fallback;
}

function inWindow(nowMs, targetMs) {
  return nowMs >= targetMs - WINDOW_MS && nowMs <= targetMs + WINDOW_MS;
}

async function _resolveTokens(entry, StaffFcmToken, Staff) {
  if (entry.staff_id) {
    const staff = await Staff.findByPk(entry.staff_id, { attributes: ['id', 'user_id'] });
    if (staff?.user_id) {
      const row = await StaffFcmToken.findOne({
        where: { user_id: staff.user_id },
        attributes: ['fcm_token'],
      });
      if (row?.fcm_token) return [row.fcm_token];
    }
    return [];
  }

  const rows = await StaffFcmToken.findAll({
    where: { branch_id: entry.branch_id },
    attributes: ['fcm_token'],
  });
  return rows.map((r) => r.fcm_token).filter(Boolean);
}

async function _sendReminder(entry, tokens, { title, body, data, field, logLabel, kind }) {
  await sendToTokens(tokens, title, body, data);
  await entry.update({ [field]: new Date() });
  const target = entry.staff_id ? `staff #${entry.staff_id}` : `branch #${entry.branch_id} (all)`;
  console.log(`[ReminderCron] ${logLabel} ${kind} #${entry.id} → ${target} (${tokens.length} device(s))`);
}

async function _processAppointmentReminders(nowMs, todayStr) {
  const { Appointment, Service, StaffFcmToken, Staff } = getModels();

  const appointments = await Appointment.findAll({
    where: {
      date: todayStr,
      status: { [Op.in]: ['pending', 'confirmed', 'in_service'] },
      [Op.or]: [
        { reminder_before_start_sent_at: null },
        { reminder_15_sent_at: null },
        { reminder_at_end_sent_at: null },
      ],
    },
    include: [
      { model: Service, as: 'service', attributes: ['name', 'duration_minutes'] },
      {
        model: Service,
        as: 'services',
        attributes: ['name', 'duration_minutes'],
        through: { attributes: ['sort_order'] },
      },
    ],
  });

  for (const appt of appointments) {
    const duration = totalDurationMinutes(appt);
    const startMs = slLocalMs(appt.date, appt.time);
    const endMs = startMs + duration * 60 * 1000;
    const beforeStartMs = startMs - REMINDER_BEFORE_START_MIN * 60 * 1000;
    const beforeEndMs = startMs + Math.max(0, duration - REMINDER_BEFORE_END_MIN) * 60 * 1000;

    const timeLabel = appt.time ? String(appt.time).slice(0, 5) : '';
    const endLabel = formatSlClock(endMs);
    const svcName = serviceLabel(appt);

    const tokens = await _resolveTokens(appt, StaffFcmToken, Staff);
    if (tokens.length === 0) continue;

    const baseData = {
      appointment_id: String(appt.id),
      branch_id:      String(appt.branch_id),
      customer_name:  appt.customer_name,
      service:        svcName,
      duration_min:   String(duration),
      time:           timeLabel,
      end_time:       endLabel,
      date:           appt.date,
    };

    if (!appt.reminder_before_start_sent_at && inWindow(nowMs, beforeStartMs)) {
      await _sendReminder(appt, tokens, {
        title: '⏰ Appointment in 15 min',
        body:  `${appt.customer_name} — ${svcName} (${duration} min) at ${timeLabel}`,
        data:  { ...baseData, type: 'appointment_reminder_start' },
        field: 'reminder_before_start_sent_at',
        logLabel: 'Before-start reminder for',
        kind: 'appointment',
      });
    }

    if (!appt.reminder_15_sent_at && inWindow(nowMs, beforeEndMs)) {
      await _sendReminder(appt, tokens, {
        title: '⏰ 15 min left — service ending soon',
        body:  `${appt.customer_name} — ${svcName} (${duration} min) ends ~${endLabel}`,
        data:  { ...baseData, type: 'appointment_reminder_before_end' },
        field: 'reminder_15_sent_at',
        logLabel: 'Before-end reminder for',
        kind: 'appointment',
      });
    }

    if (!appt.reminder_at_end_sent_at && inWindow(nowMs, endMs)) {
      await _sendReminder(appt, tokens, {
        title: '✅ Service time completed',
        body:  `${appt.customer_name} — ${svcName} (${duration} min) finished at ${endLabel}. Mark complete or extend if needed.`,
        data:  { ...baseData, type: 'appointment_reminder_end' },
        field: 'reminder_at_end_sent_at',
        logLabel: 'End-time reminder for',
        kind: 'appointment',
      });
    }
  }
}

async function _processWalkInReminders(nowMs, todayStr) {
  const { WalkIn, Service, StaffFcmToken, Staff } = getModels();

  const walkIns = await WalkIn.findAll({
    where: {
      check_in_date: todayStr,
      status: { [Op.in]: ['waiting', 'serving'] },
      [Op.or]: [
        { reminder_before_start_sent_at: null },
        { reminder_15_sent_at: null },
        { reminder_at_end_sent_at: null },
      ],
    },
    include: [
      { model: Service, as: 'service', attributes: ['name', 'duration_minutes'] },
      {
        model: Service,
        as: 'services',
        attributes: ['name', 'duration_minutes'],
        through: { attributes: ['sort_order'] },
      },
    ],
  });

  for (const w of walkIns) {
    const duration = totalDurationMinutes(w);
    const svcName = serviceLabel(w, 'Walk-in');
    const tokenLabel = w.token ? `Token ${w.token}` : 'Walk-in';

    const tokens = await _resolveTokens(w, StaffFcmToken, Staff);
    if (tokens.length === 0) continue;

    const baseData = {
      walkin_id:     String(w.id),
      branch_id:     String(w.branch_id),
      customer_name: w.customer_name,
      service:       svcName,
      duration_min:  String(duration),
      token:         w.token || '',
      date:          w.check_in_date,
    };

    if (w.status === 'waiting') {
      const waitMin = Number(w.estimated_wait) || 0;
      const checkInMs = slLocalMs(w.check_in_date, w.check_in_time);
      const estimatedStartMs = checkInMs + waitMin * 60 * 1000;
      const beforeStartMs = estimatedStartMs - REMINDER_BEFORE_START_MIN * 60 * 1000;
      const startLabel = formatSlClock(estimatedStartMs);

      if (!w.reminder_before_start_sent_at && inWindow(nowMs, beforeStartMs)) {
        await _sendReminder(w, tokens, {
          title: '🚶 Walk-in in 15 min',
          body:  `${w.customer_name} — ${svcName} (${duration} min) · ${tokenLabel} · ~${startLabel}`,
          data:  { ...baseData, type: 'walkin_reminder_start', time: startLabel },
          field: 'reminder_before_start_sent_at',
          logLabel: 'Before-start reminder for',
          kind: 'walk-in',
        });
      }
      continue;
    }

    const startTime = w.serve_start_time || w.check_in_time;
    const startMs = slLocalMs(w.check_in_date, startTime);
    const endMs = startMs + duration * 60 * 1000;
    const beforeEndMs = startMs + Math.max(0, duration - REMINDER_BEFORE_END_MIN) * 60 * 1000;
    const startLabel = startTime ? String(startTime).slice(0, 5) : '';
    const endLabel = formatSlClock(endMs);

    const servingData = {
      ...baseData,
      time: startLabel,
      end_time: endLabel,
    };

    if (!w.reminder_15_sent_at && inWindow(nowMs, beforeEndMs)) {
      await _sendReminder(w, tokens, {
        title: '🚶 Walk-in — 15 min left',
        body:  `${w.customer_name} — ${svcName} (${duration} min) · ${tokenLabel} · ends ~${endLabel}`,
        data:  { ...servingData, type: 'walkin_reminder_before_end' },
        field: 'reminder_15_sent_at',
        logLabel: 'Before-end reminder for',
        kind: 'walk-in',
      });
    }

    if (!w.reminder_at_end_sent_at && inWindow(nowMs, endMs)) {
      await _sendReminder(w, tokens, {
        title: '✅ Walk-in service time completed',
        body:  `${w.customer_name} — ${svcName} (${duration} min) · ${tokenLabel} · finished at ${endLabel}. Mark complete or collect payment.`,
        data:  { ...servingData, type: 'walkin_reminder_end' },
        field: 'reminder_at_end_sent_at',
        logLabel: 'End-time reminder for',
        kind: 'walk-in',
      });
    }
  }
}

/**
 * Every minute, up to three pushes per appointment (Asia/Colombo):
 *  1. 15 min before start  (kalin — upcoming)
 *  2. 15 min before end    (kalin — wrap up; e.g. 45 min service → 30 min after start)
 *  3. At scheduled end     (pasuwa — service time complete)
 */
function startAppointmentReminderCron() {
  cron.schedule('* * * * *', async () => {
    try {
      const todayStr = slDateString(slNow());
      const nowMs = slNowMs();
      await _processAppointmentReminders(nowMs, todayStr);
      await _processWalkInReminders(nowMs, todayStr);
    } catch (err) {
      console.error('[ReminderCron] Error:', err.message);
    }
  });

  console.log(
    '✓ Appointment & walk-in reminder cron started (before start, before end, at end — Asia/Colombo).',
  );
}

function startReminderDueCron() {
  cron.schedule('0 9 * * *', async () => {
    try {
      const { Reminder, StaffFcmToken } = getModels();

      const today = slDateString(slNow());

      const reminders = await Reminder.findAll({
        where: { due_date: today, is_done: false },
        attributes: ['id', 'branch_id', 'title', 'type', 'priority'],
      });

      if (reminders.length === 0) return;

      const byBranch = {};
      for (const r of reminders) {
        if (!byBranch[r.branch_id]) byBranch[r.branch_id] = [];
        byBranch[r.branch_id].push(r);
      }

      const typeEmoji = { general: '📝', inventory: '📦', staff: '👤', customer: '👥' };

      for (const [branchId, items] of Object.entries(byBranch)) {
        const rows = await StaffFcmToken.findAll({
          where: { branch_id: branchId },
          attributes: ['fcm_token'],
        });
        const tokens = rows.map((r) => r.fcm_token).filter(Boolean);
        if (tokens.length === 0) continue;

        if (items.length === 1) {
          const r     = items[0];
          const emoji = typeEmoji[r.type] || '📝';
          await sendToTokens(tokens, `${emoji} Reminder Due Today`, r.title, {
            type:        'reminder_due',
            reminder_id: String(r.id),
            branch_id:   String(branchId),
          });
        } else {
          const titles = items.slice(0, 3).map((r) => `• ${r.title}`).join('\n');
          const extra  = items.length > 3 ? `\n+${items.length - 3} more` : '';
          await sendToTokens(tokens, `📋 ${items.length} Reminders Due Today`, `${titles}${extra}`, {
            type:      'reminder_due',
            branch_id: String(branchId),
          });
        }

        console.log(`[ReminderDueCron] Sent ${items.length} due reminder(s) to branch #${branchId} (${tokens.length} device(s))`);
      }
    } catch (err) {
      console.error('[ReminderDueCron] Error:', err.message);
    }
  });

  console.log('✓ Reminder due-today cron started (runs daily at 09:00 Colombo).');
}

module.exports = { startAppointmentReminderCron, startReminderDueCron };
