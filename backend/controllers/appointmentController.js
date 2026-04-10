const { Op } = require('sequelize');
const { Appointment, Branch, Customer, Staff, Service } = require('../models');
const AppointmentService = require('../models/AppointmentService');
const { sequelize } = require('../config/database');
const { notifyAppointmentConfirmed, notifyAppointmentCompleted } = require('../services/notificationService');
const { createNextRecurring } = require('../services/recurringService');
const { notifyBranch, notifyStaffUser } = require('../services/fcmService');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');

let appointmentServicesTableReadyPromise = null;

const ensureAppointmentServicesTable = async () => {
  if (!appointmentServicesTableReadyPromise) {
    appointmentServicesTableReadyPromise = sequelize.query(`
      CREATE TABLE IF NOT EXISTS appointment_services (
        id INT AUTO_INCREMENT PRIMARY KEY,
        appointment_id INT NOT NULL,
        service_id INT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_appt_service (appointment_id, service_id),
        KEY idx_appointment_id (appointment_id),
        KEY idx_service_id (service_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `).catch((err) => {
      appointmentServicesTableReadyPromise = null;
      throw err;
    });
  }
  await appointmentServicesTableReadyPromise;
};

const normalizeServiceIds = (serviceIds, fallbackServiceId = null) => {
  const ids = [];
  const raw = Array.isArray(serviceIds)
    ? serviceIds
    : (serviceIds !== undefined && serviceIds !== null ? [serviceIds] : []);
  for (const value of raw) {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0) ids.push(id);
  }

  const fallback = Number(fallbackServiceId);
  if (!ids.length && Number.isInteger(fallback) && fallback > 0) {
    ids.push(fallback);
  }

  return Array.from(new Set(ids));
};

const resolveValidServiceIds = async (req, serviceIds, fallbackServiceId = null) => {
  const requested = normalizeServiceIds(serviceIds, fallbackServiceId);
  if (!requested.length) return [];

  const rows = await Service.findAll({
    where: { id: requested, ...tenantWhere(req) },
    attributes: ['id'],
    raw: true,
  });

  const valid = new Set(rows.map((r) => Number(r.id)));
  return requested.filter((id) => valid.has(id));
};

const replaceAppointmentServiceMappings = async (appointmentId, serviceIds = []) => {
  await ensureAppointmentServicesTable();

  await AppointmentService.destroy({ where: { appointment_id: appointmentId } });
  if (!serviceIds.length) return;

  await AppointmentService.bulkCreate(
    serviceIds.map((sid, idx) => ({
      appointment_id: appointmentId,
      service_id: sid,
      sort_order: idx,
    })),
    { ignoreDuplicates: true },
  );
};

const attachServiceIdsToAppointments = async (appointments) => {
  const list = Array.isArray(appointments) ? appointments.filter(Boolean) : (appointments ? [appointments] : []);
  if (!list.length) return;

  await ensureAppointmentServicesTable();

  const apptIds = list.map((a) => Number(a.id)).filter(Boolean);
  if (!apptIds.length) return;

  const rows = await AppointmentService.findAll({
    where: { appointment_id: { [Op.in]: apptIds } },
    attributes: ['appointment_id', 'service_id', 'sort_order', 'id'],
    order: [['appointment_id', 'ASC'], ['sort_order', 'ASC'], ['id', 'ASC']],
    raw: true,
  });

  const map = new Map();
  for (const row of rows) {
    const key = Number(row.appointment_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(Number(row.service_id));
  }

  for (const appt of list) {
    const ids = map.get(Number(appt.id)) || [];
    const fallbackPrimary = Number(appt.service_id || 0);
    const finalIds = ids.length
      ? Array.from(new Set(ids))
      : (fallbackPrimary ? [fallbackPrimary] : []);

    if (typeof appt.setDataValue === 'function') {
      appt.setDataValue('service_ids', finalIds);
    } else {
      appt.service_ids = finalIds;
    }
  }
};

const getBranchWhere = (req) => {
  const where = tenantWhere(req);
  if (req.userBranchId) {
    where.branch_id = req.userBranchId;
  } else if (req.query.branchId) {
    where.branch_id = req.query.branchId;
  }
  return where;
};

const list = async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const where = getBranchWhere(req);
    if (req.query.status)  where.status   = req.query.status;
    if (req.query.staffId) where.staff_id = req.query.staffId;
    if (req.query.date)    where.date     = req.query.date;

    const { count, rows } = await Appointment.findAndCountAll({
      where,
      limit,
      offset,
      order: [['date', 'DESC'], ['time', 'DESC']],
      include: [
        { model: Branch,   as: 'branch',   attributes: ['id', 'name', 'color'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'] },
        { model: Staff,    as: 'staff',    attributes: ['id', 'name'] },
        { model: Service,  as: 'service',  attributes: ['id', 'name', 'price', 'duration_minutes'] },
      ],
    });

    await attachServiceIdsToAppointments(rows);

    return res.json({ total: count, page, limit, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const calendar = async (req, res) => {
  try {
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
    const pad   = (n) => String(n).padStart(2, '0');
    const start = `${year}-${pad(month)}-01`;
    const last  = new Date(year, month, 0).getDate();
    const end   = `${year}-${pad(month)}-${pad(last)}`;

    const where = { ...tenantWhere(req), date: { [Op.between]: [start, end] } };
    if (req.userBranchId) {
      where.branch_id = req.userBranchId;
    } else if (req.query.branchId) {
      where.branch_id = req.query.branchId;
    }

    const appts = await Appointment.findAll({
      where,
      order: [['date', 'ASC'], ['time', 'ASC']],
      include: [
        { model: Staff,   as: 'staff',   attributes: ['id', 'name'] },
        { model: Service, as: 'service', attributes: ['id', 'name'] },
        { model: Branch,  as: 'branch',  attributes: ['id', 'name', 'color'] },
      ],
    });

    await attachServiceIdsToAppointments(appts);

    // Group by date
    const grouped = {};
    for (const a of appts) {
      if (!grouped[a.date]) grouped[a.date] = [];
      grouped[a.date].push(a);
    }

    return res.json(grouped);
  } catch (err) {
    console.error('[appointments][calendar]', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const getOne = async (req, res) => {
  try {
    const appt = await Appointment.findOne({
      where: byIdWhere(req, req.params.id),
      include: [
        { model: Branch,   as: 'branch'   },
        { model: Customer, as: 'customer' },
        { model: Staff,    as: 'staff'    },
        { model: Service,  as: 'service'  },
      ],
    });
    if (!appt) return res.status(404).json({ message: 'Appointment not found.' });

    await attachServiceIdsToAppointments(appt);
    return res.json(appt);
  } catch (err) {
    console.error('[appointments][getOne]', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const { branch_id, customer_id, staff_id, service_id, service_ids, customer_name, phone, date, time, amount, notes, is_recurring, recurrence_frequency } = req.body;

    const requestedServiceIds = normalizeServiceIds(service_ids, service_id);
    const validServiceIds = await resolveValidServiceIds(req, requestedServiceIds);
    if (requestedServiceIds.length && validServiceIds.length !== requestedServiceIds.length) {
      return res.status(400).json({ message: 'One or more selected services are invalid.' });
    }
    const primaryServiceId = validServiceIds[0] || null;

    if (!branch_id || !primaryServiceId || !customer_name || !date || !time) {
      return res.status(400).json({ message: 'branch_id, service_id, customer_name, date and time are required.' });
    }

    // Auto-fetch service price if amount not provided
    let finalAmount = amount;
    if (!finalAmount) {
      const services = await Service.findAll({
        where: { id: validServiceIds, ...tenantWhere(req) },
        attributes: ['price'],
        raw: true,
      });
      finalAmount = services.reduce((sum, svc) => sum + Number(svc.price || 0), 0);
    }

    const appt = await Appointment.create({
      branch_id, customer_id, staff_id, service_id: primaryServiceId, customer_name, phone, date, time, amount: finalAmount, notes,
      is_recurring: is_recurring || false,
      recurrence_frequency: is_recurring ? (recurrence_frequency || 'weekly') : null,
      tenant_id: resolveTenantId(req),
    });

    await replaceAppointmentServiceMappings(appt.id, validServiceIds);

    // Fire-and-forget notification — use request phone or fall back to customer record
    const notifyPhone = phone || (customer_id
      ? await (async () => {
          const { Customer: CustModel } = require('../models');
          const c = await CustModel.findOne({ where: byIdWhere(req, customer_id), attributes: ['phone'] });
          return c?.phone || null;
        })()
      : null);
    if (notifyPhone) {
      const [branch, service] = await Promise.all([
        Branch.findOne({ where: byIdWhere(req, branch_id), attributes: ['id', 'name', 'phone'] }),
        Service.findOne({ where: byIdWhere(req, primaryServiceId), attributes: ['id', 'name'] }),
      ]);
      notifyAppointmentConfirmed({ ...appt.toJSON(), phone: notifyPhone }, branch, service);
    }

    const timeLabel = appt.time ? appt.time.slice(0, 5) : '';
    if (staff_id) {
      // Assigned to a specific staff — notify only them
      notifyStaffUser(staff_id, '📅 New Appointment', `${appt.customer_name} — ${timeLabel}`, {
        type: 'appointment_assigned',
        appointment_id: String(appt.id),
        branch_id: String(branch_id),
      });
    } else {
      // No staff assigned yet — notify the whole branch
      notifyBranch(branch_id, '📅 New Appointment', `${appt.customer_name} — ${timeLabel}`, {
        type: 'new_appointment',
        appointment_id: String(appt.id),
        branch_id: String(branch_id),
      });
    }

    return res.status(201).json({ ...appt.toJSON(), service_ids: validServiceIds });
  } catch (err) {
    console.error('[appointments][create]', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const appt = await Appointment.findOne({ where: byIdWhere(req, req.params.id) });
    if (!appt) return res.status(404).json({ message: 'Appointment not found.' });

    // Enforce branch ownership for branch-scoped users
    if (req.userBranchId && appt.branch_id !== req.userBranchId) {
      return res.status(403).json({ message: 'Access denied. Appointment belongs to a different branch.' });
    }

    if (req.body.status !== undefined) {
      return res.status(400).json({ message: 'Use PATCH /appointments/:id/status to update appointment status.' });
    }

    const allowed = ['staff_id', 'service_id', 'customer_name', 'phone', 'date', 'time', 'amount', 'notes'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    let nextServiceIds = null;
    if (req.body.service_ids !== undefined || req.body.service_id !== undefined) {
      const requestedServiceIds = normalizeServiceIds(req.body.service_ids, req.body.service_id || appt.service_id);
      nextServiceIds = await resolveValidServiceIds(req, requestedServiceIds);
      if (requestedServiceIds.length && nextServiceIds.length !== requestedServiceIds.length) {
        return res.status(400).json({ message: 'One or more selected services are invalid.' });
      }
      if (!nextServiceIds.length) {
        return res.status(400).json({ message: 'At least one valid service is required.' });
      }
      updates.service_id = nextServiceIds[0];

      // Recalculate amount from selected services when amount is not explicitly supplied
      if (req.body.amount === undefined) {
        const selected = await Service.findAll({
          where: { id: nextServiceIds, ...tenantWhere(req) },
          attributes: ['price'],
          raw: true,
        });
        updates.amount = selected.reduce((sum, svc) => sum + Number(svc.price || 0), 0);
      }
    }

    // Auto-update amount from service price when service changes
    if (updates.service_id && req.body.amount === undefined && !nextServiceIds) {
      const svc = await Service.findOne({ where: byIdWhere(req, updates.service_id), attributes: ['price'] });
      if (svc) updates.amount = svc.price;
    }

    const prevStaffId = appt.staff_id;
    await appt.update(updates);

    if (nextServiceIds) {
      await replaceAppointmentServiceMappings(appt.id, nextServiceIds);
    }

    await attachServiceIdsToAppointments(appt);

    // If staff was newly assigned or changed, notify that staff member
    if (updates.staff_id && updates.staff_id !== prevStaffId) {
      const timeLabel = appt.time ? appt.time.slice(0, 5) : '';
      notifyStaffUser(updates.staff_id, '📅 Assigned to You', `${appt.customer_name} — ${timeLabel}`, {
        type: 'appointment_assigned',
        appointment_id: String(appt.id),
        branch_id: String(appt.branch_id),
      });
    }

    return res.json(appt);
  } catch (err) {
    console.error('[appointments][update]', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const changeStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'confirmed', 'in_service', 'completed', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${allowed.join(', ')}.` });
    }

    const appt = await Appointment.findOne({ where: byIdWhere(req, req.params.id) });
    if (!appt) return res.status(404).json({ message: 'Appointment not found.' });

    // Enforce branch ownership for branch-scoped users
    if (req.userBranchId && appt.branch_id !== req.userBranchId) {
      return res.status(403).json({ message: 'Access denied. Appointment belongs to a different branch.' });
    }

    await appt.update({ status });

    // Send confirmation notification when status changes to 'confirmed'
    if (status === 'confirmed' && appt.phone) {
      const [branch, service] = await Promise.all([
        Branch.findOne({ where: byIdWhere(req, appt.branch_id), attributes: ['id', 'name', 'phone'] }),
        Service.findOne({ where: byIdWhere(req, appt.service_id), attributes: ['id', 'name'] }),
      ]);
      notifyAppointmentConfirmed(appt, branch, service);
    }

    // Send SMS when appointment is completed
    if (status === 'completed' && appt.phone) {
      const [branch, service] = await Promise.all([
        Branch.findOne({ where: byIdWhere(req, appt.branch_id), attributes: ['id', 'name', 'phone'] }),
        Service.findOne({ where: byIdWhere(req, appt.service_id), attributes: ['id', 'name'] }),
      ]);
      notifyAppointmentCompleted(appt, branch, service);
    }

    // Push notification for cancellation
    if (status === 'cancelled') {
      notifyBranch(appt.branch_id, '❌ Appointment Cancelled', appt.customer_name, {
        type: 'appointment_cancelled',
        appointment_id: String(appt.id),
        branch_id: String(appt.branch_id),
      });
    }

    // Auto-create next recurring appointment when completed
    if (status === 'completed' && appt.is_recurring) {
      setImmediate(() => createNextRecurring(appt));
    }

    return res.json(appt);
  } catch (err) {
    console.error('[appointments][changeStatus]', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const appt = await Appointment.findOne({ where: byIdWhere(req, req.params.id) });
    if (!appt) return res.status(404).json({ message: 'Appointment not found.' });

    // Enforce branch ownership for branch-scoped users
    if (req.userBranchId && appt.branch_id !== req.userBranchId) {
      return res.status(403).json({ message: 'Access denied. Appointment belongs to a different branch.' });
    }

    await appt.destroy();
    return res.json({ message: 'Appointment deleted.' });
  } catch (err) {
    console.error('[appointments][remove]', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Recurring Appointments ────────────────────────────────────────────────────

const listRecurring = async (req, res) => {
  try {
    const where = { ...getBranchWhere(req) };
    // Get root recurring appointments (parents — those with no recurrence_parent_id)
    where.is_recurring = true;
    where.recurrence_parent_id = null;

    const parents = await Appointment.findAll({
      where,
      order: [['date', 'DESC']],
      include: [
        { model: Branch,   as: 'branch',   attributes: ['id', 'name'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'] },
        { model: Staff,    as: 'staff',    attributes: ['id', 'name'] },
        { model: Service,  as: 'service',  attributes: ['id', 'name', 'price'] },
      ],
    });

    // For each parent, fetch all children + find the next scheduled
    const chains = await Promise.all(parents.map(async (parent) => {
      const children = await Appointment.findAll({
        where: { recurrence_parent_id: parent.id, ...tenantWhere(req) },
        order: [['date', 'ASC']],
        attributes: ['id', 'date', 'time', 'status', 'is_recurring'],
      });

      const allInChain = [parent, ...children];
      const nextScheduled = allInChain.find((a) => ['pending', 'confirmed'].includes(a.status));
      const completedCount = allInChain.filter((a) => a.status === 'completed').length;

      return {
        parent: parent.toJSON(),
        children,
        totalBookings: allInChain.length,
        completedCount,
        nextScheduled: nextScheduled ? { id: nextScheduled.id, date: nextScheduled.date, time: nextScheduled.time } : null,
        isActive: parent.is_recurring,
      };
    }));

    return res.json(chains);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const stopRecurring = async (req, res) => {
  try {
    const appt = await Appointment.findOne({ where: byIdWhere(req, req.params.id) });
    if (!appt) return res.status(404).json({ message: 'Appointment not found.' });

    // Enforce branch ownership for branch-scoped users
    if (req.userBranchId && appt.branch_id !== req.userBranchId) {
      return res.status(403).json({ message: 'Access denied. Appointment belongs to a different branch.' });
    }

    await appt.update({ is_recurring: false });

    // Cancel the next scheduled appointment if it exists and is still upcoming
    if (appt.next_appointment_id) {
      const nextAppt = await Appointment.findOne({ where: byIdWhere(req, appt.next_appointment_id) });
      if (nextAppt && ['pending', 'confirmed'].includes(nextAppt.status)) {
        await nextAppt.update({ status: 'cancelled', is_recurring: false });
      }
    }

    // Also stop all future children in the chain
    const parentId = appt.recurrence_parent_id || appt.id;
    await Appointment.update(
      { is_recurring: false },
      { where: { recurrence_parent_id: parentId, status: { [Op.in]: ['pending', 'confirmed'] }, ...tenantWhere(req) } }
    );

    return res.json({ message: 'Recurring series stopped.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, calendar, getOne, create, update, changeStatus, remove, listRecurring, stopRecurring };
