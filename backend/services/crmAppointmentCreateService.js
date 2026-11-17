/**
 * CRM appointment create — transactional multi-service persist.
 * Extracted for real MySQL integration tests (RC9a Phase 2.1).
 * Does not send WhatsApp / Gemini; caller owns notify policy.
 */
'use strict';

const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const Branch = require('../models/Branch');
const Service = require('../models/Service');
const Staff = require('../models/Staff');
const Customer = require('../models/Customer');
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
  normalizeServiceIdList,
  buildSequentialServiceLines,
  computeTotalDuration,
  computeTotalAmount,
  validateFullVisitWindow,
  resolveLineStaffIds,
  validatePerLineAvailability,
  filterStartsForPerLineStaff,
} = require('./crmMultiServiceBooking');

function normalizePhoneDigits(phone = '') {
  return String(phone).replace(/\D/g, '');
}

function buildPhoneVariants(phone = '') {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return [];
  const set = new Set([digits]);
  if (digits.startsWith('0') && digits.length >= 9) set.add(`94${digits.slice(1)}`);
  if (digits.startsWith('94') && digits.length >= 11) {
    set.add(`0${digits.slice(2)}`);
    set.add(digits.slice(2));
  }
  return Array.from(set);
}

async function findCustomerByPhone(tenantId, phone, transaction) {
  const variants = buildPhoneVariants(phone);
  if (!variants.length) return null;
  return Customer.findOne({
    where: {
      tenant_id: tenantId,
      phone: { [Op.or]: variants },
    },
    transaction,
  });
}

async function resolveIdempotentAppointment(tenantId, idempotencyKey) {
  if (!idempotencyKey) return null;
  const marker = `[idem:${idempotencyKey}]`;
  return Appointment.findOne({
    where: {
      tenant_id: tenantId,
      notes: { [Op.like]: `%${marker}%` },
      status: { [Op.ne]: 'cancelled' },
    },
    order: [['id', 'DESC']],
  });
}

/**
 * Create confirmed CRM appointment + appointment_services in one transaction.
 *
 * @param {object} params
 * @param {number} params.tenantId
 * @param {object} params.body — CRM POST body
 * @param {{ forceLinkFailure?: boolean }} [params.testHooks] — MySQL rollback harness only
 */
async function createCrmAppointmentTransactional({ tenantId, body = {}, testHooks = {} }) {
  const {
    branch_id,
    service_id,
    staff_id,
    date,
    time,
    customer_name,
    phone,
    email,
    notes,
    idempotency_key,
  } = body;

  const serviceIdList = normalizeServiceIdList(body);
  if ((!service_id && !serviceIdList.length) || !staff_id || !date || !time || !customer_name || !phone) {
    const err = new Error(
      'service_id (or service_ids), staff_id, date, time, customer_name, and phone are required',
    );
    err.code = 'BAD_REQUEST';
    throw err;
  }

  if (idempotency_key) {
    const existing = await resolveIdempotentAppointment(tenantId, idempotency_key);
    if (existing) {
      const existingLinks = await AppointmentService.findAll({
        where: { appointment_id: existing.id },
        order: [['sort_order', 'ASC'], ['id', 'ASC']],
      }).catch(() => []);
      return {
        appointment: existing,
        service_links: existingLinks,
        customer: null,
        total_duration_minutes: null,
        total_amount: existing.amount != null ? Number(existing.amount) : null,
        idempotent: true,
      };
    }
  }

  const dateKey = String(date).slice(0, 10);
  const timeKey = String(time).substring(0, 5);
  const orderedIds = serviceIdList.length
    ? serviceIdList
    : [Number(service_id)].filter((n) => Number.isInteger(n) && n > 0);

  const result = await sequelize.transaction(async (t) => {
    const clash = await Appointment.findOne({
      where: {
        tenant_id: tenantId,
        staff_id: Number(staff_id),
        date: dateKey,
        time: timeKey,
        status: { [Op.in]: ['pending', 'confirmed', 'in_service'] },
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (clash) {
      const err = new Error('Selected time is already booked');
      err.code = 'SLOT_CONFLICT';
      err.appointment = clash;
      throw err;
    }

    const [serviceRows, staffRow] = await Promise.all([
      Service.findAll({
        where: {
          id: { [Op.in]: orderedIds },
          tenant_id: tenantId,
          is_active: true,
        },
        transaction: t,
      }),
      Staff.findOne({
        where: { id: staff_id, tenant_id: tenantId, is_active: true },
        transaction: t,
      }),
    ]);
    if (!staffRow) {
      const err = new Error('Staff not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const byId = new Map(serviceRows.map((s) => [Number(s.id), s]));
    const orderedServices = [];
    for (const sid of orderedIds) {
      const row = byId.get(Number(sid));
      if (!row) {
        const err = new Error(`Service not found: ${sid}`);
        err.code = 'NOT_FOUND';
        throw err;
      }
      orderedServices.push(row);
    }
    if (!orderedServices.length) {
      const err = new Error('Service not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const primaryService = orderedServices[0];

    let branchId = branch_id ? Number(branch_id) : (staffRow.branch_id || null);
    if (!branchId) {
      const first = await Branch.findOne({
        where: { tenant_id: tenantId, status: 'active' },
        attributes: ['id'],
        transaction: t,
      });
      branchId = first?.id || null;
    }
    if (!branchId) {
      const err = new Error('No active branch for this tenant');
      err.code = 'BAD_REQUEST';
      throw err;
    }

    const branch = await Branch.findOne({
      where: { id: branchId, tenant_id: tenantId, status: 'active' },
      transaction: t,
    });
    if (!branch) {
      const err = new Error('Invalid branch');
      err.code = 'BAD_REQUEST';
      throw err;
    }

    const off = await StaffOffDay.findOne({
      where: { staff_id, date: dateKey },
      transaction: t,
    });
    if (off) {
      const err = new Error('Staff is marked off on this date');
      err.code = 'BAD_REQUEST';
      throw err;
    }

    const leave = await Attendance.findOne({
      where: {
        staff_id,
        date: dateKey,
        status: { [Op.in]: BLOCKING_ATTENDANCE_STATUSES },
      },
      transaction: t,
    });
    if (leave) {
      const err = new Error(`Staff is on ${leave.status}`);
      err.code = 'BAD_REQUEST';
      throw err;
    }

    const lineStaffIds = resolveLineStaffIds(orderedIds, body, Number(staff_id));
    const lines = buildSequentialServiceLines(
      orderedServices.map((s) => (s.toJSON ? s.toJSON() : s)),
      {
        date: dateKey,
        time: timeKey,
        staffId: Number(staff_id),
        lineStaffIds,
      },
    );
    const totalDuration = computeTotalDuration(lines);
    const totalAmount = computeTotalAmount(lines);

    const dayWindow = resolveStaffDayWindow(staffRow.working_hours, dateKey);
    if (dayWindow.closed) {
      const err = new Error('Staff is not working on this date');
      err.code = 'BAD_REQUEST';
      throw err;
    }
    const windowCheck = validateFullVisitWindow({
      startTime: timeKey,
      totalDurationMinutes: totalDuration,
      windowStartMin: dayWindow.startMin,
      windowEndMin: dayWindow.endMin,
    });
    if (!windowCheck.ok) {
      const err = new Error(
        windowCheck.reason === 'past_closing'
          ? `Selected time is outside working hours (visit ends ${windowCheck.end}, closes ${windowCheck.window_end})`
          : 'Selected time is outside working hours',
      );
      err.code = 'BAD_REQUEST';
      err.details = windowCheck;
      throw err;
    }

    // Per-line availability: each assigned stylist must be free for their segment
    const uniqueLineStaff = [...new Set(
      lines.map((l) => Number(l.staff_id)).filter((n) => Number.isInteger(n) && n > 0),
    )];
    const staffWindows = new Map();
    const blockedByStaff = new Map();
    for (const sid of uniqueLineStaff) {
      const row = sid === Number(staff_id)
        ? staffRow
        : await Staff.findOne({
          where: { id: sid, tenant_id: tenantId, is_active: true },
          transaction: t,
        });
      if (!row) {
        const err = new Error(`Staff not found: ${sid}`);
        err.code = 'NOT_FOUND';
        throw err;
      }
      const offLine = await StaffOffDay.findOne({
        where: { staff_id: sid, date: dateKey },
        transaction: t,
      });
      if (offLine) {
        const err = new Error(`Staff ${sid} is marked off on this date`);
        err.code = 'BAD_REQUEST';
        throw err;
      }
      const leaveLine = await Attendance.findOne({
        where: {
          staff_id: sid,
          date: dateKey,
          status: { [Op.in]: BLOCKING_ATTENDANCE_STATUSES },
        },
        transaction: t,
      });
      if (leaveLine) {
        const err = new Error(`Staff ${sid} is on ${leaveLine.status}`);
        err.code = 'BAD_REQUEST';
        throw err;
      }
      const win = resolveStaffDayWindow(row.working_hours, dateKey);
      staffWindows.set(sid, win);
      const blocked = await loadBlockedRanges({
        Appointment,
        Service,
        staffId: sid,
        date: dateKey,
        transaction: t,
      });
      blockedByStaff.set(sid, blocked);
    }

    const perLine = validatePerLineAvailability(lines, staffWindows, blockedByStaff);

    const slotResult = await listAvailableSlots({
      Staff,
      StaffOffDay,
      Attendance,
      Appointment,
      Service,
      staffId: Number(staff_id),
      date: dateKey,
      durationMinutes: totalDuration,
      tenantId,
      requireOnline: false,
      scopeBranchConflicts: false,
    });
    const headerSlots = Array.isArray(slotResult?.slots) ? slotResult.slots : [];
    const servicePlan = lines.map((l) => ({
      duration_minutes: l.duration_minutes,
      staff_id: l.staff_id,
    }));
    const slots = uniqueLineStaff.length > 1
      ? filterStartsForPerLineStaff(headerSlots, servicePlan, staffWindows, blockedByStaff)
      : headerSlots;

    if (!perLine.ok || !slots.includes(timeKey)) {
      const err = new Error('Selected time is not available');
      err.code = 'SLOT_CONFLICT';
      err.available_slots = slots.slice(0, 24);
      err.requested = timeKey;
      err.total_duration_minutes = totalDuration;
      err.conflicts = perLine.conflicts;
      throw err;
    }

    let customer = await findCustomerByPhone(tenantId, phone, t);
    if (!customer) {
      customer = await Customer.create({
        name: customer_name,
        phone: String(phone).trim(),
        email: email || null,
        branch_id: branchId,
        tenant_id: tenantId,
      }, { transaction: t });
    }

    const noteParts = [];
    if (notes) noteParts.push(String(notes));
    noteParts.push('[source:whatsapp_ai_crm]');
    if (lines.length > 1) {
      noteParts.push(
        `[multi_service:${lines.map((l) => l.service_id).join('+')}|${totalDuration}min|${timeKey}→${windowCheck.end}]`,
      );
    }
    if (idempotency_key) noteParts.push(`[idem:${idempotency_key}]`);

    const appointment = await Appointment.create({
      tenant_id: tenantId,
      branch_id: branchId,
      customer_id: customer.id,
      service_id: primaryService.id,
      staff_id: Number(staff_id),
      customer_name,
      phone: String(phone).trim(),
      date: dateKey,
      time: timeKey,
      amount: totalAmount,
      status: 'confirmed',
      notes: noteParts.join(' '),
    }, { transaction: t });

    if (testHooks.forceLinkFailure) {
      const err = new Error('Forced appointment_services failure (RC9a Phase 2.1 rollback harness)');
      err.code = 'FORCE_LINK_FAILURE';
      throw err;
    }

    await AppointmentService.bulkCreate(
      lines.map((l) => ({
        appointment_id: appointment.id,
        service_id: l.service_id,
        staff_id: l.staff_id != null ? Number(l.staff_id) : (Number(staff_id) || null),
        date: l.date || dateKey,
        time: l.time || timeKey,
        sort_order: l.sort_order ?? 0,
      })),
      { transaction: t },
    );

    return {
      appointment,
      customer,
      service_links: lines,
      total_duration_minutes: totalDuration,
      total_amount: totalAmount,
      idempotent: false,
    };
  });

  return result;
}

module.exports = {
  createCrmAppointmentTransactional,
  resolveIdempotentAppointment,
  findCustomerByPhone,
  normalizePhoneDigits,
};
