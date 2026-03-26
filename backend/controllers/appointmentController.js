const { Op } = require('sequelize');
const { Appointment, AppointmentService, Branch, Customer, Staff, Service } = require('../models');
const { notifyAppointmentConfirmed } = require('../services/notificationService');
const { createNextRecurring } = require('../services/recurringService');

const normalizeStatusForDb = (status) => {
  if (status === 'in_service') return 'confirmed';
  if (status === 'no_show') return 'cancelled';
  return status;
};
const APPT_EXTRA_SERVICES_PREFIX = 'Additional services:';

const getBranchWhere = (req) => {
  const where = {};
  if (req.userBranchId) {
    where.branch_id = req.userBranchId;
  } else if (req.query.branchId) {
    where.branch_id = req.query.branchId;
  }
  return where;
};

const parseAdditionalServiceNames = (notes = '') => {
  const line = String(notes).split('\n').find((l) => /^\s*additional\s+services?\s*[:\-]?\s*/i.test(l));
  if (!line) return [];
  return line
    .replace(/^\s*additional\s+services?\s*[:\-]?\s*/i, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};
const getSelectedServiceIdsForAppointment = async (apptLike) => {
  const appointmentId = Number(apptLike?.id || 0);
  if (appointmentId) {
    const rows = await AppointmentService.findAll({
      where: { appointment_id: appointmentId },
      attributes: ['service_id', 'sort_order'],
      order: [['sort_order', 'ASC'], ['id', 'ASC']],
    });
    if (rows.length) {
      return rows
        .map((r) => Number(r.service_id))
        .filter((id) => Number.isInteger(id) && id > 0);
    }
  }
  const primaryId = Number(apptLike?.service_id || 0);
  const extraNames = parseAdditionalServiceNames(apptLike?.notes || '');
  if (!extraNames.length) return primaryId ? [primaryId] : [];
  const extras = await Service.findAll({
    where: { name: { [Op.in]: extraNames } },
    attributes: ['id'],
  });
  const extraIds = extras.map((s) => Number(s.id)).filter(Boolean);
  return Array.from(new Set([...(primaryId ? [primaryId] : []), ...extraIds]));
};
const syncAppointmentServices = async (appointmentId, serviceIds, transaction = null) => {
  const normalized = normalizeServiceIds(serviceIds);
  await AppointmentService.destroy({ where: { appointment_id: appointmentId }, transaction });
  if (!normalized.length) return;
  await AppointmentService.bulkCreate(
    normalized.map((serviceId, idx) => ({
      appointment_id: appointmentId,
      service_id: serviceId,
      sort_order: idx,
    })),
    { transaction },
  );
};

const stripAdditionalServicesLine = (notes = '') =>
  String(notes)
    .split('\n')
    .filter((line) => !/^\s*additional\s+services?\s*[:\-]?\s*/i.test(line))
    .join('\n')
    .trim();

const normalizeServiceIds = (serviceIds = []) => {
  if (!Array.isArray(serviceIds)) return [];
  return Array.from(new Set(
    serviceIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0),
  ));
};
const ensureServicesExist = (selectedServiceIds, serviceById) =>
  selectedServiceIds.filter((id) => !serviceById.has(Number(id)));

const buildNotificationPayload = async (apptLike) => {
  const primaryService = apptLike.service_id
    ? await Service.findByPk(apptLike.service_id, { attributes: ['id', 'name', 'price'] })
    : null;
  const extraServiceNames = parseAdditionalServiceNames(apptLike.notes || '');
  const extraServices = extraServiceNames.length
    ? await Service.findAll({
      where: { name: { [Op.in]: extraServiceNames } },
      attributes: ['id', 'name', 'price'],
    })
    : [];

  const seen = new Set();
  const allServices = [];
  if (primaryService) {
    allServices.push(primaryService);
    seen.add(primaryService.id);
  }
  for (const svc of extraServices) {
    if (!seen.has(svc.id)) {
      allServices.push(svc);
      seen.add(svc.id);
    }
  }

  const computedAmount = allServices.reduce((sum, svc) => sum + Number(svc.price || 0), 0);
  const serviceNameForMsg = allServices.map((svc) => svc.name).filter(Boolean).join(', ') || '—';
  const amountForMsg = Number(apptLike.amount || 0) > 0 ? apptLike.amount : computedAmount;

  return {
    appointmentForNotify: { ...apptLike, amount: amountForMsg },
    serviceForNotify: { id: primaryService?.id || null, name: serviceNameForMsg },
  };
};

const list = async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const where = getBranchWhere(req);
    if (req.query.status)  where.status   = normalizeStatusForDb(req.query.status);
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

    const dataWithServiceIds = await Promise.all(
      rows.map(async (row) => {
        const plain = row.get({ plain: true });
        plain.service_ids = await getSelectedServiceIdsForAppointment(plain);
        return plain;
      }),
    );

    return res.json({ total: count, page, limit, data: dataWithServiceIds });
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
    const plain = appt.get({ plain: true });
    plain.service_ids = await getSelectedServiceIdsForAppointment(plain);
    return res.json(plain);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const {
      branch_id, customer_id, staff_id, service_id, service_ids, customer_name, phone,
      date, time, amount, notes, is_recurring, recurrence_frequency,
    } = req.body;

    const normalizedServiceIds = normalizeServiceIds(service_ids);
    const effectiveServiceId = Number(service_id) || normalizedServiceIds[0];

    if (!branch_id || !effectiveServiceId || !customer_name || !date || !time) {
      return res.status(400).json({ message: 'branch_id, service_id, customer_name, date and time are required.' });
    }

    // Build service selection in order: primary first, then extras.
    const selectedServiceIds = normalizedServiceIds.length
      ? [effectiveServiceId, ...normalizedServiceIds.filter((id) => id !== effectiveServiceId)]
      : [effectiveServiceId];
    const selectedServices = await Service.findAll({
      where: { id: { [Op.in]: selectedServiceIds } },
      attributes: ['id', 'name', 'price'],
    });
    const serviceById = new Map(selectedServices.map((s) => [Number(s.id), s]));
    const missingServiceIds = ensureServicesExist(selectedServiceIds, serviceById);
    if (missingServiceIds.length) {
      return res.status(400).json({ message: `Invalid service_ids: ${missingServiceIds.join(', ')}` });
    }

    // Auto-fetch service price if amount not provided
    let finalAmount = amount;
    if (finalAmount === undefined || finalAmount === null || finalAmount === '') {
      const computed = selectedServiceIds.reduce((sum, id) => sum + Number(serviceById.get(id)?.price || 0), 0);
      if (computed > 0) finalAmount = computed;
    }

    const baseNote = stripAdditionalServicesLine(notes || '');
    const extraNames = selectedServiceIds
      .slice(1)
      .map((id) => serviceById.get(id)?.name)
      .filter(Boolean);
    const fullNotes = [baseNote, extraNames.length ? `${APPT_EXTRA_SERVICES_PREFIX} ${extraNames.join(', ')}` : '']
      .filter(Boolean)
      .join('\n');

    const appt = await Appointment.create({
      branch_id,
      customer_id,
      staff_id,
      service_id: effectiveServiceId,
      customer_name,
      phone,
      date,
      time,
      amount: finalAmount,
      notes: fullNotes || null,
      is_recurring: is_recurring || false,
      recurrence_frequency: is_recurring ? (recurrence_frequency || 'weekly') : null,
    });
    await syncAppointmentServices(appt.id, selectedServiceIds);

    // Send notification using all selected services captured in notes.
    if (phone) {
      const [branch, notifyPayload] = await Promise.all([
        Branch.findByPk(branch_id, { attributes: ['id', 'name', 'phone'] }),
        buildNotificationPayload(appt.get({ plain: true })),
      ]);
      await notifyAppointmentConfirmed(
        notifyPayload.appointmentForNotify,
        branch,
        notifyPayload.serviceForNotify,
      );
    }

    return res.status(201).json(appt);
  } catch (err) {
    console.error('appointment.create error:', err);
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
    if (updates.status) updates.status = normalizeStatusForDb(updates.status);

    const normalizedServiceIds = normalizeServiceIds(req.body.service_ids);
    if (normalizedServiceIds.length) {
      const primary = Number(updates.service_id || appt.service_id || normalizedServiceIds[0]);
      updates.service_id = primary;
      const selectedServiceIds = [primary, ...normalizedServiceIds.filter((id) => id !== primary)];
      const selectedServices = await Service.findAll({
        where: { id: { [Op.in]: selectedServiceIds } },
        attributes: ['id', 'name', 'price'],
      });
      const serviceById = new Map(selectedServices.map((s) => [Number(s.id), s]));
      const missingServiceIds = ensureServicesExist(selectedServiceIds, serviceById);
      if (missingServiceIds.length) {
        return res.status(400).json({ message: `Invalid service_ids: ${missingServiceIds.join(', ')}` });
      }
      if (req.body.amount === undefined || req.body.amount === null || req.body.amount === '') {
        updates.amount = selectedServiceIds.reduce((sum, id) => sum + Number(serviceById.get(id)?.price || 0), 0);
      }
      const baseNote = stripAdditionalServicesLine(
        updates.notes !== undefined ? (updates.notes || '') : (appt.notes || ''),
      );
      const extraNames = selectedServiceIds
        .slice(1)
        .map((id) => serviceById.get(id)?.name)
        .filter(Boolean);
      updates.notes = [baseNote, extraNames.length ? `${APPT_EXTRA_SERVICES_PREFIX} ${extraNames.join(', ')}` : '']
        .filter(Boolean)
        .join('\n');
    }

    // Auto-update amount from service price only when amount is not explicitly provided.
    // This is important for multi-service appointments where the frontend sends a total amount.
    if (updates.service_id && (updates.amount === undefined || updates.amount === null || updates.amount === '')) {
      const svc = await Service.findByPk(updates.service_id, { attributes: ['price'] });
      if (svc) updates.amount = svc.price;
    }

    await appt.update(updates);
    if (normalizedServiceIds.length) {
      const finalPrimary = Number(updates.service_id || appt.service_id || normalizedServiceIds[0]);
      const finalServiceIds = [finalPrimary, ...normalizedServiceIds.filter((id) => id !== finalPrimary)];
      await syncAppointmentServices(appt.id, finalServiceIds);
    }
    return res.json(appt);
  } catch (err) {
    console.error('appointment.update error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const changeStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'confirmed', 'in_service', 'completed', 'cancelled', 'no_show'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${allowed.join(', ')}.` });
    }
    const dbStatus = normalizeStatusForDb(status);

    const appt = await Appointment.findByPk(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Appointment not found.' });

    // Enforce branch ownership for branch-scoped users
    if (req.userBranchId && appt.branch_id !== req.userBranchId) {
      return res.status(403).json({ message: 'Access denied. Appointment belongs to a different branch.' });
    }

    await appt.update({ status: dbStatus });

    // Send confirmation notification only when the requested status is explicitly 'confirmed'
    if (status === 'confirmed' && appt.phone) {
      const [branch, notifyPayload] = await Promise.all([
        Branch.findByPk(appt.branch_id, { attributes: ['id', 'name', 'phone'] }),
        buildNotificationPayload(appt.get({ plain: true })),
      ]);
      await notifyAppointmentConfirmed(
        notifyPayload.appointmentForNotify,
        branch,
        notifyPayload.serviceForNotify,
      );
    }

    // Auto-create next recurring appointment when completed
    if (dbStatus === 'completed' && appt.is_recurring) {
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

    await AppointmentService.destroy({ where: { appointment_id: appt.id } });
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
