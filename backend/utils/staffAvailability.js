const { Op } = require('sequelize');
const { resolveStaffDayWindow, toHHMM } = require('./staffSchedule');

/** Grid step for candidate start times (minutes). Duration still controls how long a booking occupies. */
const SLOT_INTERVAL_MIN = 15;

/** Attendance statuses that mean staff cannot take online bookings that day. */
const BLOCKING_ATTENDANCE_STATUSES = ['leave', 'absent'];

/** Salon wall-clock timezone (Sri Lanka). */
const SALON_TZ = 'Asia/Colombo';

function parseDurationMinutes(raw, fallback = 30) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm || '00:00').substring(0, 5).split(':').map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

/**
 * Current salon date/time (Asia/Colombo).
 * @returns {{ date: string, time: string, minutes: number }}
 */
function getSalonNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SALON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  let hour = get('hour');
  if (hour === '24') hour = '00'; // en-GB midnight quirk
  const time = `${hour}:${get('minute')}`;
  return { date, time, minutes: timeToMinutes(time) };
}

/** True when date+time is strictly before salon "now". */
function isDateTimeInPast(dateStr, timeStr) {
  const dateKey = String(dateStr || '').slice(0, 10);
  const t = String(timeStr || '').trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !t) return false;
  const now = getSalonNow();
  if (dateKey < now.date) return true;
  if (dateKey > now.date) return false;
  return timeToMinutes(t) < now.minutes;
}

function pastBookingMessage() {
  return 'Cannot book a past date or time. Choose a current or future slot.';
}

/** Drop slots that already started (today). Past calendar days → empty. */
function filterFutureSlots(slots, dateStr) {
  const dateKey = String(dateStr || '').slice(0, 10);
  const list = Array.isArray(slots) ? slots : [];
  if (!dateKey || !list.length) return list;
  const now = getSalonNow();
  if (dateKey < now.date) return [];
  if (dateKey > now.date) return list;
  return list.filter((s) => timeToMinutes(s) >= now.minutes);
}

/** Total blocked minutes for an appointment (sum linked services, else primary). */
function appointmentBlockDuration(appt) {
  const linked = appt?.services;
  if (Array.isArray(linked) && linked.length > 0) {
    const sum = linked.reduce((acc, s) => acc + (Number(s.duration_minutes) || 0), 0);
    if (sum > 0) return sum;
  }
  const primary = Number(appt?.service?.duration_minutes) || 0;
  return primary > 0 ? primary : 30;
}

function buildConflictWhere({ staffId, date, branchId = null }) {
  const where = {
    staff_id: Number(staffId),
    date: String(date).slice(0, 10),
    status: { [Op.in]: ['pending', 'confirmed', 'in_service'] },
  };
  // Optional branch scope. Default: whole staff calendar (prevents cross-branch double book).
  if (branchId != null && branchId !== '') {
    where.branch_id = Number(branchId);
  }
  return where;
}

/**
 * Load [startMin, endMin] ranges for existing appointments on a staff/date.
 * Staff calendar is shared across branches unless branchId is passed.
 */
async function loadBlockedRanges({
  Appointment,
  Service,
  staffId,
  date,
  branchId = null,
  transaction = null,
}) {
  const rows = await Appointment.findAll({
    where: buildConflictWhere({ staffId, date, branchId }),
    attributes: ['time'],
    include: [
      { model: Service, as: 'service', attributes: ['duration_minutes'], required: false },
      {
        model: Service,
        as: 'services',
        attributes: ['duration_minutes'],
        through: { attributes: [] },
        required: false,
      },
    ],
    ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}),
  });

  return rows.map((a) => {
    const start = timeToMinutes(a.time);
    const dur = appointmentBlockDuration(a);
    return [start, start + dur];
  });
}

function generateAvailableSlots({
  dayWindow,
  durationMinutes,
  blockedRanges = [],
  slotInterval = SLOT_INTERVAL_MIN,
}) {
  if (!dayWindow || dayWindow.closed) return [];
  const duration = parseDurationMinutes(durationMinutes, 30);
  const interval = Math.max(5, parseDurationMinutes(slotInterval, SLOT_INTERVAL_MIN));
  const out = [];
  for (let min = dayWindow.startMin; min + duration <= dayWindow.endMin; min += interval) {
    const end = min + duration;
    const overlaps = blockedRanges.some(([bStart, bEnd]) => min < bEnd && end > bStart);
    if (!overlaps) out.push(toHHMM(min));
  }
  return out;
}

/**
 * Why staff cannot work on a date: off day, weekly closed, or attendance leave/absent.
 * Returns null if available, else a short reason code.
 */
async function getStaffDateBlockReason({
  StaffOffDay,
  Attendance,
  staffId,
  date,
  workingHours = null,
}) {
  const staffIdNum = Number(staffId);
  const dateKey = String(date || '').slice(0, 10);
  if (!Number.isInteger(staffIdNum) || staffIdNum <= 0 || !dateKey) return 'invalid';

  if (StaffOffDay) {
    const offDay = await StaffOffDay.findOne({
      where: { staff_id: staffIdNum, date: dateKey },
      attributes: ['id'],
    });
    if (offDay) return 'off_day';
  }

  if (workingHours != null) {
    const dayWindow = resolveStaffDayWindow(workingHours, dateKey);
    if (dayWindow.closed) return 'weekly_off';
  }

  if (Attendance) {
    const row = await Attendance.findOne({
      where: {
        staff_id: staffIdNum,
        date: dateKey,
        status: { [Op.in]: BLOCKING_ATTENDANCE_STATUSES },
      },
      attributes: ['id', 'status'],
    });
    if (row) return row.status === 'absent' ? 'absent' : 'leave';
  }

  return null;
}

/**
 * Staff IDs that are unavailable on `date` (off day, weekly closed, leave/absent).
 * Pass staff rows with id + working_hours for weekly-off checks.
 */
async function findUnavailableStaffIdsOnDate({
  StaffOffDay,
  Attendance,
  staffRows = [],
  date,
}) {
  const dateKey = String(date || '').slice(0, 10);
  if (!dateKey || !staffRows.length) return new Set();

  const ids = staffRows.map((s) => Number(s.id)).filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return new Set();

  const unavailable = new Set();

  staffRows.forEach((s) => {
    const dayWindow = resolveStaffDayWindow(s.working_hours, dateKey);
    if (dayWindow.closed) unavailable.add(Number(s.id));
  });

  const [offRows, leaveRows] = await Promise.all([
    StaffOffDay
      ? StaffOffDay.findAll({
        where: { staff_id: ids, date: dateKey },
        attributes: ['staff_id'],
        raw: true,
      })
      : Promise.resolve([]),
    Attendance
      ? Attendance.findAll({
        where: {
          staff_id: ids,
          date: dateKey,
          status: { [Op.in]: BLOCKING_ATTENDANCE_STATUSES },
        },
        attributes: ['staff_id'],
        raw: true,
      })
      : Promise.resolve([]),
  ]);

  offRows.forEach((r) => unavailable.add(Number(r.staff_id)));
  leaveRows.forEach((r) => unavailable.add(Number(r.staff_id)));

  return unavailable;
}

/**
 * Full availability for a staff member on a date for a booking of `durationMinutes`.
 */
async function listAvailableSlots({
  Staff,
  StaffOffDay,
  Attendance,
  Appointment,
  Service,
  staffId,
  date,
  durationMinutes,
  tenantId = null,
  requireOnline = false,
  branchId = null,
  scopeBranchConflicts = false,
}) {
  const empty = (window = null) => ({ slots: [], window: window || { closed: true, start: null, end: null } });

  const staffIdNum = Number(staffId);
  const dateKey = String(date || '').slice(0, 10);
  if (!Number.isInteger(staffIdNum) || staffIdNum <= 0 || !dateKey) return empty();

  const staffWhere = { id: staffIdNum, is_active: true };
  if (requireOnline) staffWhere.available_online = true;
  if (tenantId) staffWhere.tenant_id = Number(tenantId);

  const staff = await Staff.findOne({
    where: staffWhere,
    attributes: ['id', 'working_hours', 'tenant_id'],
  });
  if (!staff) return empty();

  const blockReason = await getStaffDateBlockReason({
    StaffOffDay,
    Attendance,
    staffId: staffIdNum,
    date: dateKey,
    workingHours: staff.working_hours,
  });
  if (blockReason) {
    return empty({
      closed: true,
      start: null,
      end: null,
      reason: blockReason,
    });
  }

  const dayWindow = resolveStaffDayWindow(staff.working_hours, dateKey);
  if (dayWindow.closed) {
    return empty({ closed: true, start: null, end: null, reason: 'weekly_off' });
  }

  const blockedRanges = await loadBlockedRanges({
    Appointment,
    Service,
    staffId: staffIdNum,
    date: dateKey,
    branchId: scopeBranchConflicts ? branchId : null,
  });

  const slots = filterFutureSlots(
    generateAvailableSlots({
      dayWindow,
      durationMinutes,
      blockedRanges,
    }),
    dateKey,
  );

  return {
    slots,
    window: {
      closed: false,
      start: toHHMM(dayWindow.startMin),
      end: toHHMM(dayWindow.endMin),
    },
  };
}

module.exports = {
  SLOT_INTERVAL_MIN,
  BLOCKING_ATTENDANCE_STATUSES,
  SALON_TZ,
  parseDurationMinutes,
  timeToMinutes,
  getSalonNow,
  isDateTimeInPast,
  pastBookingMessage,
  filterFutureSlots,
  appointmentBlockDuration,
  buildConflictWhere,
  loadBlockedRanges,
  generateAvailableSlots,
  getStaffDateBlockReason,
  findUnavailableStaffIdsOnDate,
  listAvailableSlots,
};
