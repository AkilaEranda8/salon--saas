'use strict';

const { StaffOffDay } = require('../models');
const {
  resolveStaffDayWindow,
  parseHHMM,
  toHHMM,
  normalizeWorkingHours,
} = require('./staffSchedule');

/** Minutes after scheduled start before check-in is treated as late. */
const LATE_GRACE_MINUTES = 15;

/**
 * Expected shift for a staff member on a date (weekly hours + off-day calendar).
 * @returns {{ closed: boolean, start: string|null, end: string|null, startMin: number, endMin: number, standardMinutes: number, reason?: string }}
 */
function buildScheduleWindow(workingHours, dateStr, offDay = null) {
  if (offDay) {
    return {
      closed: true,
      start: null,
      end: null,
      startMin: 0,
      endMin: 0,
      standardMinutes: 0,
      reason: offDay.reason || 'Staff off day',
    };
  }
  const win = resolveStaffDayWindow(workingHours, dateStr);
  if (win.closed) {
    return {
      closed: true,
      start: null,
      end: null,
      startMin: 0,
      endMin: 0,
      standardMinutes: 0,
      reason: win.reason || 'Staff day off (weekly)',
    };
  }
  return {
    closed: false,
    start: toHHMM(win.startMin),
    end: toHHMM(win.endMin),
    startMin: win.startMin,
    endMin: win.endMin,
    standardMinutes: win.endMin - win.startMin,
    reason: undefined,
  };
}

async function loadOffDay(staffId, dateStr, tenantId) {
  const where = { staff_id: staffId, date: dateStr };
  if (tenantId != null) where.tenant_id = tenantId;
  return StaffOffDay.findOne({ where, attributes: ['id', 'date', 'reason'] });
}

async function resolveAttendanceSchedule(staff, dateStr, tenantId) {
  const offDay = await loadOffDay(staff.id, dateStr, tenantId);
  return buildScheduleWindow(staff.working_hours, dateStr, offDay);
}

/**
 * Normalize TIME / "HH:MM" / "HH:MM:SS" to minutes from midnight.
 */
function checkInToMinutes(checkIn) {
  if (checkIn == null || checkIn === '') return null;
  const s = String(checkIn).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!m) return parseHHMM(s.slice(0, 5));
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Apply staff working hours to attendance status.
 * - present + check-in after start + grace → late
 * - does not override absent / leave
 * - does not downgrade an explicit late
 */
function applyScheduleStatus({ status, check_in, schedule, graceMinutes = LATE_GRACE_MINUTES }) {
  const next = { status, schedule };
  if (!status || status === 'absent' || status === 'leave') return next;
  if (!schedule || schedule.closed) return next;

  const inMin = checkInToMinutes(check_in);
  if (inMin == null) return next;

  const lateAfter = schedule.startMin + graceMinutes;
  if (inMin > lateAfter) {
    next.status = 'late';
  } else if (status === 'late' && inMin <= lateAfter) {
    // Checked in on time — treat as present unless manager forced late without time
    next.status = 'present';
  }
  return next;
}

function scheduleLabel(schedule) {
  if (!schedule) return '';
  if (schedule.closed) return schedule.reason || 'Off';
  return `${schedule.start}–${schedule.end}`;
}

module.exports = {
  LATE_GRACE_MINUTES,
  buildScheduleWindow,
  resolveAttendanceSchedule,
  applyScheduleStatus,
  checkInToMinutes,
  scheduleLabel,
  normalizeWorkingHours,
};
