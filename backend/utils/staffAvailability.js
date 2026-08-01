const { Op } = require('sequelize');
const { resolveStaffDayWindow, toHHMM } = require('./staffSchedule');

/** Grid step for candidate start times (minutes). Duration still controls how long a booking occupies. */
const SLOT_INTERVAL_MIN = 15;

function parseDurationMinutes(raw, fallback = 30) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm || '00:00').substring(0, 5).split(':').map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
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
 * Full availability for a staff member on a date for a booking of `durationMinutes`.
 * @param {object} opts
 * @param {boolean} [opts.requireOnline=false] — public booking only shows available_online staff
 * @param {number|null} [opts.branchId] — only used if opts.scopeBranchConflicts is true
 * @param {boolean} [opts.scopeBranchConflicts=false]
 */
async function listAvailableSlots({
  Staff,
  StaffOffDay,
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
  const staffIdNum = Number(staffId);
  const dateKey = String(date || '').slice(0, 10);
  if (!Number.isInteger(staffIdNum) || staffIdNum <= 0 || !dateKey) return [];

  const staffWhere = { id: staffIdNum, is_active: true };
  if (requireOnline) staffWhere.available_online = true;
  if (tenantId) staffWhere.tenant_id = Number(tenantId);

  const staff = await Staff.findOne({
    where: staffWhere,
    attributes: ['id', 'working_hours', 'tenant_id'],
  });
  if (!staff) return [];

  const offDay = await StaffOffDay.findOne({
    where: { staff_id: staffIdNum, date: dateKey },
    attributes: ['id'],
  });
  if (offDay) return [];

  const dayWindow = resolveStaffDayWindow(staff.working_hours, dateKey);
  if (dayWindow.closed) return [];

  const blockedRanges = await loadBlockedRanges({
    Appointment,
    Service,
    staffId: staffIdNum,
    date: dateKey,
    branchId: scopeBranchConflicts ? branchId : null,
  });

  return generateAvailableSlots({
    dayWindow,
    durationMinutes,
    blockedRanges,
  });
}

module.exports = {
  SLOT_INTERVAL_MIN,
  parseDurationMinutes,
  timeToMinutes,
  appointmentBlockDuration,
  buildConflictWhere,
  loadBlockedRanges,
  generateAvailableSlots,
  listAvailableSlots,
};
