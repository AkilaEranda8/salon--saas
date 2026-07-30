'use strict';
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { slToday, slDatePlusDays } = require('../utils/dateUtils');

function normalizeNextDate(nextDate) {
  if (!nextDate) return slDatePlusDays(7);
  const s = String(nextDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return slDatePlusDays(7);
  const today = slToday();
  if (s < today) return slDatePlusDays(7);
  return s;
}

function normalizeTime(time) {
  if (!time) {
    const { slTimeString } = require('../utils/dateUtils');
    return `${slTimeString().slice(0, 5)}:00`;
  }
  const t = String(time).trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  return '10:00:00';
}

/**
 * Create the next recurring appointment after one is completed.
 * @param {object} appointment
 * @param {{ nextDate?: string, skipNotify?: boolean }} [options]
 */
async function createNextRecurring(appointment, options = {}) {
  try {
    const { Appointment } = require('../models');
    // Default: skip immediate SMS — day-of cron sends on the selected date
    const skipNotify = options.skipNotify !== false;

    if (!appointment.is_recurring) return null;
    if (appointment.next_appointment_id) return null;

    let nextDate;
    if (options.nextDate) {
      nextDate = normalizeNextDate(options.nextDate);
    } else {
      const currentDate = new Date(`${String(appointment.date).slice(0, 10)}T00:00:00Z`);
      currentDate.setUTCDate(currentDate.getUTCDate() + 7);
      nextDate = currentDate.toISOString().slice(0, 10);
    }

    const parentId = appointment.recurrence_parent_id || appointment.id;

    const nextAppt = await sequelize.transaction(async (t) => {
      const fresh = await Appointment.findByPk(appointment.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!fresh || fresh.next_appointment_id) return null;

      if (appointment.staff_id) {
        const conflictWhere = {
          staff_id: appointment.staff_id,
          date: nextDate,
          time: appointment.time,
          status: { [Op.notIn]: ['cancelled'] },
        };
        if (appointment.tenant_id) conflictWhere.tenant_id = appointment.tenant_id;

        const conflict = await Appointment.findOne({ where: conflictWhere, transaction: t });
        if (conflict) {
          console.log(`Slot unavailable for recurring: staff ${appointment.staff_id} on ${nextDate}`);
          return null;
        }
      }

      const next = await Appointment.create({
        branch_id: appointment.branch_id,
        customer_id: appointment.customer_id,
        staff_id: appointment.staff_id,
        service_id: appointment.service_id,
        customer_name: appointment.customer_name,
        phone: appointment.phone,
        date: nextDate,
        time: appointment.time,
        amount: appointment.amount,
        notes: appointment.notes,
        status: 'confirmed',
        is_recurring: true,
        recurrence_frequency: 'weekly',
        recurrence_parent_id: parentId,
        recurring_message_template_id: appointment.recurring_message_template_id || null,
        recurring_message_template_ids: Array.isArray(appointment.recurring_message_template_ids)
          && appointment.recurring_message_template_ids.length
          ? appointment.recurring_message_template_ids
          : null,
        tenant_id: appointment.tenant_id || null,
      }, { transaction: t });

      await fresh.update({ next_appointment_id: next.id }, { transaction: t });
      return next;
    });

    if (!nextAppt) return null;

    try {
      const { AppointmentService } = require('../models');
      const links = await AppointmentService.findAll({
        where: { appointment_id: appointment.id },
        attributes: ['service_id'],
      });
      if (links.length) {
        await AppointmentService.bulkCreate(
          links.map((l) => ({ appointment_id: nextAppt.id, service_id: l.service_id })),
          { ignoreDuplicates: true }
        );
      }
    } catch (_) { /* optional */ }

    if (!skipNotify && appointment.phone) {
      const { Branch, Service } = require('../models');
      const { notifyAppointmentConfirmed } = require('./notificationService');
      const [branch, service] = await Promise.all([
        Branch.findByPk(appointment.branch_id, { attributes: ['id', 'name', 'phone'] }),
        Service.findByPk(appointment.service_id, { attributes: ['id', 'name'] }),
      ]);
      notifyAppointmentConfirmed(nextAppt, branch, service, appointment.tenant_id);
    }

    return nextAppt;
  } catch (err) {
    console.error('Error creating next recurring appointment:', err);
    return null;
  }
}

/**
 * Seed today's completed recurring appointment from Walk-In/Payment, then book next on nextDate.
 */
async function seedRecurringFromVisit({
  tenantId,
  branchId,
  customerId,
  staffId,
  serviceId,
  serviceIds,
  customerName,
  phone,
  amount,
  appointmentTime,
  nextDate,
  notes,
  messageTemplateId,
  messageTemplateIds,
  transaction,
} = {}) {
  const { Appointment, AppointmentService } = require('../models');
  const today = slToday();
  const time = normalizeTime(appointmentTime);
  const ids = Array.isArray(serviceIds) && serviceIds.length
    ? serviceIds.map(Number).filter(Boolean)
    : (serviceId ? [Number(serviceId)] : []);
  const primaryServiceId = ids[0] || serviceId || null;
  if (!branchId || !primaryServiceId || !customerName) {
    const err = new Error('branch_id, service, and customer_name are required for recurring.');
    err.status = 400;
    throw err;
  }
  const tplId = parseInt(messageTemplateId, 10);
  const recurringTemplateId = Number.isInteger(tplId) && tplId > 0 ? tplId : null;
  const recurringTemplateIds = Array.isArray(messageTemplateIds)
    ? [...new Set(messageTemplateIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : null;

  const run = async (t) => {
    const seed = await Appointment.create({
      branch_id: branchId,
      customer_id: customerId || null,
      staff_id: staffId || null,
      service_id: primaryServiceId,
      customer_name: customerName,
      phone: phone || null,
      date: today,
      time,
      amount: amount != null ? Number(amount) : 0,
      notes: notes || 'Seeded from payment/walk-in for recurring series',
      status: 'completed',
      is_recurring: true,
      recurrence_frequency: 'weekly',
      recurrence_parent_id: null,
      recurring_message_template_id: recurringTemplateId,
      recurring_message_template_ids: recurringTemplateIds?.length ? recurringTemplateIds : null,
      tenant_id: tenantId || null,
    }, { transaction: t });

    if (ids.length) {
      await AppointmentService.bulkCreate(
        ids.map((sid) => ({ appointment_id: seed.id, service_id: sid })),
        { transaction: t, ignoreDuplicates: true }
      );
    }
    return seed;
  };

  const seed = transaction ? await run(transaction) : await sequelize.transaction(run);

  const next = await createNextRecurring(seed, {
    nextDate: normalizeNextDate(nextDate),
    skipNotify: true,
  });

  return { seed, next };
}

module.exports = { createNextRecurring, seedRecurringFromVisit, normalizeNextDate };
