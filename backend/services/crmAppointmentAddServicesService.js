/**
 * CRM add-services — append catalogue services to an existing appointment.
 * Contract: docs/RC9A_PHASE21_ADD_SERVICES_API_CONTRACT.md
 * Never creates a new appointment header. Never auto-moves start time.
 */
'use strict';

const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const Service = require('../models/Service');
const Staff = require('../models/Staff');
const Appointment = require('../models/Appointment');
const AppointmentService = require('../models/AppointmentService');
const StaffOffDay = require('../models/StaffOffDay');
const Attendance = require('../models/Attendance');
const {
  listAvailableSlots,
  loadBlockedRanges,
  BLOCKING_ATTENDANCE_STATUSES,
} = require('../utils/staffAvailability');
const { resolveStaffDayWindow } = require('../utils/staffSchedule');
const {
  buildSequentialServiceLines,
  computeTotalDuration,
  computeTotalAmount,
  resolveLineStaffIds,
  validatePerLineAvailability,
  toMinutes,
  toHHMM,
} = require('./crmMultiServiceBooking');

const ALLOWED_STATUS = new Set(['confirmed', 'pending']);

function normalizeAddServiceIds(body = {}) {
  const out = [];
  const push = (raw) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) return;
    if (!out.includes(n)) out.push(n);
  };
  if (Array.isArray(body.add_service_ids)) body.add_service_ids.forEach(push);
  if (Array.isArray(body.service_ids)) body.service_ids.forEach(push);
  if (Array.isArray(body.extra_service_ids)) body.extra_service_ids.forEach(push);
  return out;
}

async function loadStaffWindowAndBlocks({
  staffId,
  dateKey,
  tenantId,
  excludeAppointmentId,
  transaction,
}) {
  const staffRow = await Staff.findOne({
    where: { id: staffId, tenant_id: tenantId, is_active: true },
    transaction,
  });
  if (!staffRow) {
    return { window: { closed: true, startMin: 0, endMin: 0 }, blocked: [], staffRow: null };
  }
  const off = await StaffOffDay.findOne({
    where: { staff_id: staffId, date: dateKey },
    transaction,
  });
  if (off) {
    return { window: { closed: true, startMin: 0, endMin: 0, reason: 'off_day' }, blocked: [], staffRow };
  }
  const leave = await Attendance.findOne({
    where: {
      staff_id: staffId,
      date: dateKey,
      status: { [Op.in]: BLOCKING_ATTENDANCE_STATUSES },
    },
    transaction,
  });
  if (leave) {
    return {
      window: { closed: true, startMin: 0, endMin: 0, reason: leave.status },
      blocked: [],
      staffRow,
    };
  }
  const dayWindow = resolveStaffDayWindow(staffRow.working_hours, dateKey);
  const blocked = await loadBlockedRanges({
    Appointment,
    Service,
    staffId: Number(staffId),
    date: dateKey,
    excludeAppointmentId,
    transaction,
  });
  return { window: dayWindow, blocked, staffRow };
}

/**
 * @param {object} params
 * @param {number} params.tenantId
 * @param {number} params.appointmentId
 * @param {object} params.body
 * @param {{ forceLinkFailure?: boolean }} [params.testHooks]
 */
async function addServicesToCrmAppointment({ tenantId, appointmentId, body = {}, testHooks = {} }) {
  const addIds = normalizeAddServiceIds(body);
  if (!addIds.length) {
    const err = new Error('add_service_ids is required');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const idemKey = body.idempotency_key ? String(body.idempotency_key).slice(0, 160) : '';
  const idemMarker = idemKey ? `[addsvc-idem:${idemKey}]` : '';

  const appt = await Appointment.findOne({
    where: { id: Number(appointmentId), tenant_id: tenantId },
  });
  if (!appt) {
    const err = new Error('Appointment not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (idemMarker && String(appt.notes || '').includes(idemMarker)) {
    const links = await AppointmentService.findAll({
      where: { appointment_id: appt.id },
      order: [['sort_order', 'ASC'], ['id', 'ASC']],
    });
    return {
      appointment: appt,
      service_links: links,
      added_service_ids: addIds,
      total_duration_minutes: null,
      total_amount: appt.amount != null ? Number(appt.amount) : null,
      idempotent: true,
    };
  }

  if (!ALLOWED_STATUS.has(String(appt.status))) {
    const err = new Error(`Cannot add services to a ${appt.status} appointment`);
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const dateKey = String(appt.date).slice(0, 10);
  const timeKey = String(appt.time).substring(0, 5);

  const existingLinks = await AppointmentService.findAll({
    where: { appointment_id: appt.id },
    order: [['sort_order', 'ASC'], ['id', 'ASC']],
  });

  const existingServiceIds = existingLinks.length
    ? existingLinks.map((l) => Number(l.service_id))
    : [Number(appt.service_id)].filter((n) => Number.isInteger(n) && n > 0);

  const dupes = addIds.filter((id) => existingServiceIds.includes(id));
  if (dupes.length) {
    const err = new Error(`Duplicate service already on appointment: ${dupes.join(',')}`);
    err.code = 'DUPLICATE_SERVICE';
    err.duplicate_service_ids = dupes;
    throw err;
  }

  const mergedIds = [...existingServiceIds, ...addIds];
  const serviceRows = await Service.findAll({
    where: {
      id: { [Op.in]: mergedIds },
      tenant_id: tenantId,
      is_active: true,
    },
  });
  const byId = new Map(serviceRows.map((s) => [Number(s.id), s]));
  for (const sid of mergedIds) {
    if (!byId.has(Number(sid))) {
      const err = new Error(`Service not found: ${sid}`);
      err.code = 'NOT_FOUND';
      throw err;
    }
  }

  const existingStaffByService = new Map();
  for (const link of existingLinks) {
    if (link.staff_id != null) {
      existingStaffByService.set(Number(link.service_id), Number(link.staff_id));
    }
  }
  const headerStaff = appt.staff_id != null ? Number(appt.staff_id) : null;
  const resolvedNew = resolveLineStaffIds(addIds, body, headerStaff);
  const lineStaffIds = new Map();
  for (const sid of existingServiceIds) {
    lineStaffIds.set(
      Number(sid),
      existingStaffByService.get(Number(sid)) ?? headerStaff,
    );
  }
  for (const sid of addIds) {
    lineStaffIds.set(Number(sid), resolvedNew.get(Number(sid)) ?? headerStaff);
  }

  const orderedServices = mergedIds.map((id) => byId.get(Number(id)));
  const lines = buildSequentialServiceLines(
    orderedServices.map((s) => (s.toJSON ? s.toJSON() : s)),
    {
      date: dateKey,
      time: timeKey,
      staffId: headerStaff,
      lineStaffIds,
    },
  );
  const totalDuration = computeTotalDuration(lines);
  const totalAmount = computeTotalAmount(lines);

  const uniqueStaff = [...new Set(lines.map((l) => Number(l.staff_id)).filter((n) => n > 0))];
  const staffWindows = new Map();
  const blockedByStaff = new Map();

  for (const sid of uniqueStaff) {
    const { window, blocked } = await loadStaffWindowAndBlocks({
      staffId: sid,
      dateKey,
      tenantId,
      excludeAppointmentId: appt.id,
    });
    staffWindows.set(sid, window);
    blockedByStaff.set(sid, blocked);
  }

  const perLine = validatePerLineAvailability(lines, staffWindows, blockedByStaff);
  if (!perLine.ok) {
    // Surface alternatives for header staff full-visit duration — never auto-move
    let available_slots = [];
    if (headerStaff) {
      const slotResult = await listAvailableSlots({
        Staff,
        StaffOffDay,
        Attendance,
        Appointment,
        Service,
        staffId: headerStaff,
        date: dateKey,
        durationMinutes: totalDuration,
        tenantId,
        requireOnline: false,
        scopeBranchConflicts: false,
      });
      available_slots = Array.isArray(slotResult?.slots) ? slotResult.slots.slice(0, 24) : [];
    }
    const err = new Error('Selected time is not available for one or more assigned staff');
    err.code = 'SLOT_CONFLICT';
    err.available_slots = available_slots;
    err.requested = timeKey;
    err.total_duration_minutes = totalDuration;
    err.conflicts = perLine.conflicts;
    throw err;
  }

  const result = await sequelize.transaction(async (t) => {
    const locked = await Appointment.findOne({
      where: { id: appt.id, tenant_id: tenantId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!locked) {
      const err = new Error('Appointment not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    const noteParts = [String(locked.notes || '').trim()];
    if (body.notes) noteParts.push(String(body.notes));
    noteParts.push(`[add_services:${addIds.join('+')}|${totalDuration}min]`);
    if (idemMarker) noteParts.push(idemMarker);

    await locked.update({
      amount: totalAmount,
      notes: noteParts.filter(Boolean).join(' '),
      // keep primary service_id as original primary
    }, { transaction: t });

    if (testHooks.forceLinkFailure) {
      const err = new Error('Forced add-services link failure (RC9a Phase 2.2 harness)');
      err.code = 'FORCE_LINK_FAILURE';
      throw err;
    }

    await AppointmentService.destroy({
      where: { appointment_id: locked.id },
      transaction: t,
    });
    await AppointmentService.bulkCreate(
      lines.map((l) => ({
        appointment_id: locked.id,
        service_id: l.service_id,
        staff_id: l.staff_id != null ? Number(l.staff_id) : headerStaff,
        date: l.date || dateKey,
        time: l.time || timeKey,
        sort_order: l.sort_order ?? 0,
      })),
      { transaction: t },
    );

    await locked.reload({ transaction: t });
    const links = await AppointmentService.findAll({
      where: { appointment_id: locked.id },
      order: [['sort_order', 'ASC'], ['id', 'ASC']],
      transaction: t,
    });

    return {
      appointment: locked,
      service_links: links,
      added_service_ids: addIds,
      total_duration_minutes: totalDuration,
      total_amount: totalAmount,
      idempotent: false,
    };
  });

  return result;
}

module.exports = {
  addServicesToCrmAppointment,
  normalizeAddServiceIds,
  loadStaffWindowAndBlocks,
  ALLOWED_STATUS,
  toMinutes,
  toHHMM,
};
