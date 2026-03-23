const { Op } = require('sequelize');
const { Appointment, Branch, Customer, Staff, Service } = require('../models');
const { notifyAppointmentConfirmed } = require('../services/notificationService');
const { createNextRecurring } = require('../services/recurringService');

const getBranchWhere = (req) => {
  const where = {};
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
      order: [['id', 'DESC']],
      include: [
        { model: Branch,   as: 'branch',   attributes: ['id', 'name', 'color'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'] },
        { model: Staff,    as: 'staff',    attributes: ['id', 'name'] },
        { model: Service,  as: 'service',  attributes: ['id', 'name', 'price', 'duration_minutes'] },
      ],
    });

    // Attach additional service details
    const data = await Promise.all(rows.map(async (r) => {
      const plain = r.toJSON();
      const extraIds = plain.additional_service_ids || [];
      if (extraIds.length) {
        const svcs = await Service.findAll({ where: { id: extraIds }, attributes: ['id','name','price','duration_minutes'] });
        plain.additional_services = svcs;
      } else {
        plain.additional_services = [];
      }
      return plain;
    }));

    return res.json({ total: count, page, limit, data });
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

    const where = { date: { [Op.between]: [start, end] } };
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

    // Group by date
    const grouped = {};
    for (const a of appts) {
      if (!grouped[a.date]) grouped[a.date] = [];
      grouped[a.date].push(a);
    }

    return res.json(grouped);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const getOne = async (req, res) => {
  try {
    const appt = await Appointment.findByPk(req.params.id, {
      include: [
        { model: Branch,   as: 'branch'   },
        { model: Customer, as: 'customer' },
        { model: Staff,    as: 'staff'    },
        { model: Service,  as: 'service'  },
      ],
    });
    if (!appt) return res.status(404).json({ message: 'Appointment not found.' });
    return res.json(appt);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const { branch_id, customer_id, staff_id, service_id, customer_name, phone, date, time, amount, notes, is_recurring, recurrence_frequency, additional_service_ids } = req.body;

    if (!branch_id || !service_id || !customer_name || !date || !time) {
      return res.status(400).json({ message: 'branch_id, service_id, customer_name, date and time are required.' });
    }

    // Sanitize FK fields — empty string → null to avoid DB type errors
    const safeCustomerId = customer_id ? Number(customer_id) : null;
    const safeStaffId    = staff_id    ? Number(staff_id)    : null;
    const safeBranchId   = Number(branch_id);
    const safeServiceId  = Number(service_id);

    // Auto-fetch service price if amount not provided
    let finalAmount = (amount !== undefined && amount !== '') ? Number(amount) : null;
    if (finalAmount === null && safeServiceId) {
      const svc = await Service.findByPk(safeServiceId, { attributes: ['price'] });
      if (svc) finalAmount = Number(svc.price);
    }

    const extraSvcIds = Array.isArray(additional_service_ids) ? additional_service_ids.map(Number).filter(Boolean) : [];
    const appt = await Appointment.create({
      branch_id:   safeBranchId,
      customer_id: safeCustomerId,
      staff_id:    safeStaffId,
      service_id:  safeServiceId,
      customer_name, phone: phone || null, date, time,
      amount: finalAmount, notes: notes || null,
      is_recurring: is_recurring || false,
      recurrence_frequency: is_recurring ? (recurrence_frequency || 'weekly') : null,
      additional_service_ids: extraSvcIds,
    });

    // Fire-and-forget notification (only if phone provided)
    if (phone) {
      const [branch, service] = await Promise.all([
        Branch.findByPk(safeBranchId,  { attributes: ['id', 'name', 'phone'] }),
        Service.findByPk(safeServiceId, { attributes: ['id', 'name'] }),
      ]);
      notifyAppointmentConfirmed(appt, branch, service);
    }

    return res.status(201).json(appt);
  } catch (err) {
    console.error('[Appointment.create] Error:', err.message, err.stack);
    return res.status(500).json({ message: 'Server error.', detail: err.message });
  }
};

const update = async (req, res) => {
  try {
    const appt = await Appointment.findByPk(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found.' });

    // Enforce branch ownership for branch-scoped users
    if (req.userBranchId && appt.branch_id !== req.userBranchId) {
      return res.status(403).json({ message: 'Access denied. Appointment belongs to a different branch.' });
    }

    const allowed = ['service_id', 'customer_name', 'phone', 'date', 'time', 'amount', 'notes', 'status'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field] === '' ? null : req.body[field];
    }
    // Sanitize FK integer fields
    if (req.body.staff_id !== undefined)   updates.staff_id   = req.body.staff_id   ? Number(req.body.staff_id)   : null;
    if (req.body.service_id !== undefined) updates.service_id = req.body.service_id ? Number(req.body.service_id) : null;
    if (req.body.customer_id !== undefined) updates.customer_id = req.body.customer_id ? Number(req.body.customer_id) : null;

    // Handle additional services
    if (req.body.additional_service_ids !== undefined) {
      updates.additional_service_ids = Array.isArray(req.body.additional_service_ids)
        ? req.body.additional_service_ids.map(Number).filter(Boolean)
        : [];
    }

    // Auto-update amount from all service prices when services change
    if (updates.service_id || updates.additional_service_ids !== undefined) {
      const primaryId  = updates.service_id || appt.service_id;
      const extraIds   = updates.additional_service_ids ?? (appt.additional_service_ids || []);
      const allIds     = [primaryId, ...extraIds].filter(Boolean);
      const svcs       = await Service.findAll({ where: { id: allIds }, attributes: ['id','price'] });
      updates.amount   = svcs.reduce((sum, s) => sum + Number(s.price || 0), 0);
    }

    await appt.update(updates);
    return res.json(appt);
  } catch (err) {
    console.error('[Appointment.update] Error:', err.message, err.stack);
    return res.status(500).json({ message: 'Server error.', detail: err.message });
  }
};

const changeStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'confirmed', 'in_service', 'completed', 'cancelled', 'no_show'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${allowed.join(', ')}.` });
    }

    const appt = await Appointment.findByPk(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found.' });

    // Enforce branch ownership for branch-scoped users
    if (req.userBranchId && appt.branch_id !== req.userBranchId) {
      return res.status(403).json({ message: 'Access denied. Appointment belongs to a different branch.' });
    }

    await appt.update({ status });

    // Send confirmation notification when status changes to 'confirmed'
    if (status === 'confirmed' && appt.phone) {
      const [branch, service] = await Promise.all([
        Branch.findByPk(appt.branch_id,   { attributes: ['id', 'name', 'phone'] }),
        Service.findByPk(appt.service_id, { attributes: ['id', 'name'] }),
      ]);
      notifyAppointmentConfirmed(appt, branch, service);
    }

    // Auto-create next recurring appointment when completed
    if (status === 'completed' && appt.is_recurring) {
      setImmediate(() => createNextRecurring(appt));
    }

    return res.json(appt);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const appt = await Appointment.findByPk(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found.' });

    // Enforce branch ownership for branch-scoped users
    if (req.userBranchId && appt.branch_id !== req.userBranchId) {
      return res.status(403).json({ message: 'Access denied. Appointment belongs to a different branch.' });
    }

    await appt.destroy();
    return res.json({ message: 'Appointment deleted.' });
  } catch (err) {
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
        where: { recurrence_parent_id: parent.id },
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
    const appt = await Appointment.findByPk(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found.' });

    await appt.update({ is_recurring: false });

    // Cancel the next scheduled appointment if it exists and is still upcoming
    if (appt.next_appointment_id) {
      const nextAppt = await Appointment.findByPk(appt.next_appointment_id);
      if (nextAppt && ['pending', 'confirmed'].includes(nextAppt.status)) {
        await nextAppt.update({ status: 'cancelled', is_recurring: false });
      }
    }

    // Also stop all future children in the chain
    const parentId = appt.recurrence_parent_id || appt.id;
    await Appointment.update(
      { is_recurring: false },
      { where: { recurrence_parent_id: parentId, status: { [Op.in]: ['pending', 'confirmed'] } } }
    );

    return res.json({ message: 'Recurring series stopped.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, calendar, getOne, create, update, changeStatus, remove, listRecurring, stopRecurring };
