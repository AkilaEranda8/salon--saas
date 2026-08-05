'use strict';
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
  if (!time) return '08:00:00';
  const t = String(time).trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{1,2}:\d{2}$/.test(t)) {
    const [h, m] = t.split(':');
    return `${String(h).padStart(2, '0')}:${m}:00`;
  }
  return '08:00:00';
}

/**
 * Cancel any auto-booked next appointment linked from a visit (reminder-only mode).
 */
async function cancelLinkedNextAppointment(appointment, { transaction } = {}) {
  const { Appointment } = require('../models');
  const nextId = appointment?.next_appointment_id;
  if (!nextId) return;

  const next = await Appointment.findByPk(nextId, { transaction });
  if (next && ['pending', 'confirmed'].includes(next.status)) {
    await next.update(
      { status: 'cancelled', is_recurring: false },
      { transaction },
    );
  }
  await appointment.update({ next_appointment_id: null }, { transaction });
}

/**
 * @deprecated Reminder-only mode — no longer auto-books the next appointment.
 * Kept for callers that may still import it; returns null.
 */
async function createNextRecurring() {
  return null;
}

/**
 * Seed today's completed visit and schedule a recurring reminder SMS
 * (date + time) — does NOT create a future appointment.
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
  const smsTime = normalizeTime(appointmentTime);
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
      time: smsTime,
      amount: amount != null ? Number(amount) : 0,
      notes: notes || 'Seeded from payment/walk-in for recurring reminder',
      status: 'completed',
      is_recurring: true,
      recurrence_frequency: 'weekly',
      recurrence_parent_id: null,
      recurring_next_date: normalizeNextDate(nextDate),
      recurring_sms_time: smsTime,
      recurring_sms_sent_at: null,
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
  return { seed, next: null };
}

module.exports = {
  createNextRecurring,
  seedRecurringFromVisit,
  normalizeNextDate,
  normalizeTime,
  cancelLinkedNextAppointment,
};
