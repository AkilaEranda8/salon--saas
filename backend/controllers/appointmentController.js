const { Op } = require('sequelize');
const { Appointment, Branch, Customer, Staff, Service } = require('../models');
const { notifyAppointmentConfirmed, notifyAppointmentCompleted } = require('../services/notificationService');
const { createNextRecurring } = require('../services/recurringService');
const { notifyBranch, notifyStaffUser } = require('../services/fcmService');
const { tenantWhere } = require('../utils/tenantScope');

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
    const { branch_id, customer_id, staff_id, service_id, customer_name, phone, date, time, amount, notes, is_recurring, recurrence_frequency } = req.body;

    if (!branch_id || !service_id || !customer_name || !date || !time) {
      return res.status(400).json({ message: 'branch_id, service_id, customer_name, date and time are required.' });
    }

    // Auto-fetch service price if amount not provided
    let finalAmount = amount;
    if (!finalAmount && service_id) {
      const svc = await Service.findByPk(service_id, { attributes: ['price'] });
      if (svc) finalAmount = svc.price;
    }

    const appt = await Appointment.create({
      branch_id, customer_id, staff_id, service_id, customer_name, phone, date, time, amount: finalAmount, notes,
      is_recurring: is_recurring || false,
      recurrence_frequency: is_recurring ? (recurrence_frequency || 'weekly') : null,
    });

    // Fire-and-forget notification — use request phone or fall back to customer record
    const notifyPhone = phone || (customer_id
      ? await (async () => {
          const { Customer: CustModel } = require('../models');
          const c = await CustModel.findByPk(customer_id, { attributes: ['phone'] });
          return c?.phone || null;
        })()
      : null);
    if (notifyPhone) {
      const [branch, service] = await Promise.all([
        Branch.findByPk(branch_id,   { attributes: ['id', 'name', 'phone'] }),
        Service.findByPk(service_id, { attributes: ['id', 'name'] }),
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

    return res.status(201).json(appt);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
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

    const allowed = ['staff_id', 'service_id', 'customer_name', 'phone', 'date', 'time', 'amount', 'notes', 'status'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    // Auto-update amount from service price when service changes
    if (updates.service_id) {
      const svc = await Service.findByPk(updates.service_id, { attributes: ['price'] });
      if (svc) updates.amount = svc.price;
    }

    const prevStaffId = appt.staff_id;
    await appt.update(updates);

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

    // Send SMS when appointment is completed
    if (status === 'completed' && appt.phone) {
      const [branch, service] = await Promise.all([
        Branch.findByPk(appt.branch_id,   { attributes: ['id', 'name', 'phone'] }),
        Service.findByPk(appt.service_id, { attributes: ['id', 'name'] }),
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
