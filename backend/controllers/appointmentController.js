const { Op } = require('sequelize');
const { Appointment, Branch, Customer, Staff, Service, Payment, PaymentSplit, StaffOffDay, Attendance } = require('../models');
const AppointmentService = require('../models/AppointmentService');
const { sequelize } = require('../config/database');
const { notifyAppointmentConfirmed, notifyAppointmentCompleted, notifyWaitlistSlotAvailable } = require('../services/notificationService');
const { createNextRecurring } = require('../services/recurringService');
const { notifyBranch, notifyStaffUser } = require('../services/fcmService');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');
const { notesUsesPackage, usesPackageBooking, parsePackageIdFromNotes, resolvePackageBundlePrice } = require('../utils/packageNotes');
const { parseDurationMinutes, listAvailableSlots } = require('../utils/staffAvailability');

const ADVANCE_METHODS = new Set(['Cash', 'Card', 'Online Transfer']);
const ADVANCE_NOTE_PREFIX = 'Advance paid:';

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

const attachAdvancePaidToAppointments = async (appointments) => {
  const list = Array.isArray(appointments) ? appointments.filter(Boolean) : (appointments ? [appointments] : []);
  if (!list.length) return;

  const apptIds = list.map((a) => Number(a.id)).filter(Boolean);
  if (!apptIds.length) return;

  const payments = await Payment.findAll({
    where: {
      appointment_id: { [Op.in]: apptIds },
      status: 'paid',
    },
    attributes: ['id', 'appointment_id', 'total_amount', 'is_advance', 'commission_amount'],
    include: [{ model: PaymentSplit, as: 'splits', attributes: ['method', 'amount', 'customer_package_id'] }],
    order: [['id', 'ASC']],
  });

  const byAppt = new Map();
  for (const p of payments) {
    const key = Number(p.appointment_id);
    if (!byAppt.has(key)) byAppt.set(key, []);
    byAppt.get(key).push(p);
  }

  for (const appt of list) {
    const rows = byAppt.get(Number(appt.id)) || [];
    const amountPaid = rows.reduce((s, p) => s + (parseFloat(p.total_amount) || 0), 0);
    let advanceRows = rows.filter((p) => p.is_advance);
    // Legacy deposits (before is_advance): treat as advance while appointment still open
    if (!advanceRows.length && rows.length && String(appt.status || '') !== 'completed') {
      advanceRows = rows;
    }
    const advancePaid = advanceRows.reduce((s, p) => s + (parseFloat(p.total_amount) || 0), 0);
    const advanceSplits = [];
    for (const p of advanceRows) {
      for (const sp of (p.splits || [])) {
        advanceSplits.push({
          method: sp.method,
          amount: parseFloat(sp.amount) || 0,
          customer_package_id: sp.customer_package_id || null,
        });
      }
    }

    if (typeof appt.setDataValue === 'function') {
      appt.setDataValue('advance_paid', advancePaid);
      appt.setDataValue('amount_paid', amountPaid);
      appt.setDataValue('advance_splits', advanceSplits);
    } else {
      appt.advance_paid = advancePaid;
      appt.amount_paid = amountPaid;
      appt.advance_splits = advanceSplits;
    }
  }
};

const buildAdvanceNote = (amount, method) =>
  `${ADVANCE_NOTE_PREFIX} Rs. ${Number(amount).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${method})`;

const recordAdvancePayment = async ({
  req, appointment, amount, method, customer_id, customer_name, branch_id, staff_id, service_id,
}) => {
  const advanceAmount = Number(amount);
  const advanceMethod = String(method || 'Cash');
  if (!(advanceAmount > 0) || !ADVANCE_METHODS.has(advanceMethod)) {
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const payment = await Payment.create({
    branch_id,
    staff_id: staff_id || null,
    customer_id: customer_id || null,
    service_id: service_id || null,
    appointment_id: appointment.id,
    customer_name: customer_name || appointment.customer_name || null,
    total_amount: advanceAmount,
    loyalty_discount: 0,
    promo_discount: 0,
    points_earned: 0,
    commission_amount: 0, // settle commission on final payment
    date: today,
    status: 'paid',
    tenant_id: resolveTenantId(req),
    is_advance: true,
  });

  await PaymentSplit.create({
    payment_id: payment.id,
    method: advanceMethod,
    amount: advanceAmount,
    customer_package_id: null,
    tenant_id: resolveTenantId(req),
  });

  const noteLine = buildAdvanceNote(advanceAmount, advanceMethod);
  const existingNotes = String(appointment.notes || '').trim();
  if (!existingNotes.includes(ADVANCE_NOTE_PREFIX)) {
    await appointment.update({
      notes: [existingNotes, noteLine].filter(Boolean).join('\n'),
    });
  }

  return payment;
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
      order: req.query.date && req.query.sort === 'time'
        ? [['time', String(req.query.order || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC']]
        : [['date', 'DESC'], ['time', 'DESC']],
      include: [
        { model: Branch,   as: 'branch',   attributes: ['id', 'name', 'color'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'] },
        { model: Staff,    as: 'staff',    attributes: ['id', 'name'] },
        { model: Service,  as: 'service',  attributes: ['id', 'name', 'price', 'duration_minutes'] },
      ],
    });

    await attachServiceIdsToAppointments(rows);
    await attachAdvancePaidToAppointments(rows);

    return res.json({ total: count, page, limit, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * GET /api/appointments/availability?staffId=&date=&duration=
 * Admin slot picker — same rules as public booking but allows any active staff
 * (not only available_online).
 */
const availability = async (req, res) => {
  try {
    const staffId = Number(req.query.staffId ?? req.query.staff_id);
    const date = String(req.query.date || '').slice(0, 10);
    if (!Number.isInteger(staffId) || staffId <= 0 || !date) {
      return res.status(400).json({ message: 'staffId and date are required' });
    }

    let durationMinutes = parseDurationMinutes(req.query.duration, 0);
    const serviceIdsRaw = req.query.serviceIds ?? req.query.service_ids;
    if ((!durationMinutes || durationMinutes <= 0) && serviceIdsRaw) {
      const ids = String(serviceIdsRaw)
        .split(',')
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length) {
        const svcs = await Service.findAll({
          where: { ...tenantWhere(req), id: ids },
          attributes: ['duration_minutes'],
        });
        durationMinutes = svcs.reduce((acc, s) => acc + (Number(s.duration_minutes) || 0), 0);
      }
    }
    if (!durationMinutes || durationMinutes <= 0) durationMinutes = 30;

    const tenantId = resolveTenantId(req);
    const slots = await listAvailableSlots({
      Staff,
      StaffOffDay,
      Attendance,
      Appointment,
      Service,
      staffId,
      date,
      durationMinutes,
      tenantId,
      requireOnline: false,
      scopeBranchConflicts: false,
    });

    return res.json({ duration_minutes: durationMinutes, slots });
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
    await attachAdvancePaidToAppointments(appts);

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
    await attachAdvancePaidToAppointments(appt);
    return res.json(appt);
  } catch (err) {
    console.error('[appointments][getOne]', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const {
      branch_id, customer_id, staff_id, service_id, service_ids, customer_name,
      phone, date, time, amount, notes, is_recurring, recurrence_frequency,
      recurring_next_date, recurring_message_template_id, recurring_message_template_ids,
      items, advance_amount, advance_method,
    } = req.body;

    const parsedAdvance = Number(advance_amount);
    const hasAdvance = Number.isFinite(parsedAdvance) && parsedAdvance > 0;
    const advanceMethod = ADVANCE_METHODS.has(String(advance_method || ''))
      ? String(advance_method)
      : 'Cash';
    if (hasAdvance && !ADVANCE_METHODS.has(advanceMethod)) {
      return res.status(400).json({ message: 'advance_method must be Cash, Card, or Online Transfer.' });
    }

    if (!customer_name) {
      return res.status(400).json({ message: 'customer_name is required.' });
    }
    if (!branch_id) {
      return res.status(400).json({ message: 'branch_id is required.' });
    }

    const recurringTplId = parseInt(recurring_message_template_id, 10);
    const recurringTplIds = Array.isArray(recurring_message_template_ids)
      ? [...new Set(recurring_message_template_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
      : null;
    const recurringFields = {
      is_recurring: is_recurring || false,
      recurrence_frequency: is_recurring ? (recurrence_frequency || 'weekly') : null,
      recurring_next_date: is_recurring ? (recurring_next_date || null) : null,
      recurring_message_template_id: is_recurring && Number.isInteger(recurringTplId) && recurringTplId > 0
        ? recurringTplId
        : null,
      recurring_message_template_ids: is_recurring && recurringTplIds?.length ? recurringTplIds : null,
    };

    // ── Multi-booking: one appointment per item (own staff + date + time) ──
    if (Array.isArray(items) && items.length > 0) {
      const normalizedItems = [];
      for (let i = 0; i < items.length; i += 1) {
        const raw = items[i] || {};
        const sid = Number(raw.service_id ?? raw.serviceId);
        const itemStaff = raw.staff_id != null && raw.staff_id !== ''
          ? Number(raw.staff_id)
          : null;
        const itemDate = String(raw.date || '').trim();
        const itemTime = String(raw.time || '').trim();
        if (!Number.isInteger(sid) || sid <= 0) {
          return res.status(400).json({ message: `items[${i}].service_id is required.` });
        }
        if (!itemDate || !itemTime) {
          return res.status(400).json({ message: `items[${i}] needs date and time.` });
        }
        if (itemStaff != null && (!Number.isInteger(itemStaff) || itemStaff <= 0)) {
          return res.status(400).json({ message: `items[${i}].staff_id is invalid.` });
        }
        normalizedItems.push({
          service_id: sid,
          staff_id: itemStaff,
          date: itemDate,
          time: itemTime,
        });
      }

      const allServiceIds = [...new Set(normalizedItems.map((i) => i.service_id))];
      const validServiceIds = await resolveValidServiceIds(req, allServiceIds);
      if (validServiceIds.length !== allServiceIds.length) {
        return res.status(400).json({ message: 'One or more selected services are invalid.' });
      }

      const serviceRows = await Service.findAll({
        where: { id: allServiceIds, ...tenantWhere(req) },
        attributes: ['id', 'name', 'price'],
        raw: true,
      });
      const serviceMap = new Map(serviceRows.map((s) => [Number(s.id), s]));

      const usesPackage = usesPackageBooking({
        notes,
        customer_package_id: req.body.customer_package_id,
      });
      let packageAmount = 0;
      if (usesPackage) {
        const pkgId = req.body.customer_package_id || parsePackageIdFromNotes(notes);
        if (amount !== undefined && amount !== null && amount !== '') {
          packageAmount = Number(amount);
        } else {
          packageAmount = pkgId ? await resolvePackageBundlePrice(req, pkgId) : 0;
        }
      }

      const created = [];
      for (let i = 0; i < normalizedItems.length; i += 1) {
        const item = normalizedItems[i];
        const svc = serviceMap.get(item.service_id);
        let itemAmount;
        if (usesPackage) {
          itemAmount = i === 0 ? packageAmount : 0;
        } else if (amount !== undefined && amount !== null && amount !== '' && normalizedItems.length === 1) {
          itemAmount = Number(amount);
        } else {
          itemAmount = Number(svc?.price || 0);
        }

        const appt = await Appointment.create({
          branch_id,
          customer_id: customer_id || null,
          staff_id: item.staff_id,
          service_id: item.service_id,
          customer_name,
          phone: phone || null,
          date: item.date,
          time: item.time,
          amount: itemAmount,
          notes: notes || null,
          status: req.body.status || 'pending',
          ...recurringFields,
          tenant_id: resolveTenantId(req),
        });
        await replaceAppointmentServiceMappings(appt.id, [item.service_id]);
        created.push(appt);

        const timeLabel = item.time ? String(item.time).slice(0, 5) : '';
        if (item.staff_id) {
          notifyStaffUser(item.staff_id, '📅 New Appointment', `${customer_name} — ${timeLabel}`, {
            type: 'appointment_assigned',
            appointment_id: String(appt.id),
            branch_id: String(branch_id),
          });
        } else {
          notifyBranch(branch_id, '📅 New Appointment', `${customer_name} — ${timeLabel}`, {
            type: 'new_appointment',
            appointment_id: String(appt.id),
            branch_id: String(branch_id),
          });
        }
      }

      let advancePayment = null;
      if (hasAdvance && created[0]) {
        advancePayment = await recordAdvancePayment({
          req,
          appointment: created[0],
          amount: parsedAdvance,
          method: advanceMethod,
          customer_id: customer_id || null,
          customer_name,
          branch_id,
          staff_id: created[0].staff_id || null,
          service_id: created[0].service_id || null,
        });
        await created[0].reload();
      }

      // SMS once for the batch
      const notifyPhone = phone || (customer_id
        ? await (async () => {
            const { Customer: CustModel } = require('../models');
            const c = await CustModel.findOne({ where: byIdWhere(req, customer_id), attributes: ['phone'] });
            return c?.phone || null;
          })()
        : null);
      if (notifyPhone && created[0]) {
        const [branch, service] = await Promise.all([
          Branch.findOne({ where: byIdWhere(req, branch_id), attributes: ['id', 'name', 'phone'] }),
          Service.findOne({ where: byIdWhere(req, created[0].service_id), attributes: ['id', 'name'] }),
        ]);
        notifyAppointmentConfirmed({ ...created[0].toJSON(), phone: notifyPhone }, branch, service, resolveTenantId(req));
      }

      const createdJson = created.map((a) => ({ ...a.toJSON(), service_ids: [a.service_id] }));
      if (hasAdvance && createdJson[0]) {
        createdJson[0].advance_paid = parsedAdvance;
        createdJson[0].amount_paid = parsedAdvance;
      }

      return res.status(201).json({
        message: 'Bookings created successfully',
        count: createdJson.length,
        ids: createdJson.map((a) => a.id),
        appointments: createdJson,
        advance_payment_id: advancePayment?.id || null,
        advance_paid: hasAdvance ? parsedAdvance : 0,
        // Keep first appointment shape for older clients that expect a single row
        ...createdJson[0],
        service_ids: createdJson.map((a) => a.service_id),
      });
    }

    // ── Legacy single appointment (multi-service on one staff/time) ──
    const requestedServiceIds = normalizeServiceIds(service_ids, service_id);
    const validServiceIds = await resolveValidServiceIds(req, requestedServiceIds);
    if (requestedServiceIds.length && validServiceIds.length !== requestedServiceIds.length) {
      return res.status(400).json({ message: 'One or more selected services are invalid.' });
    }
    const primaryServiceId = validServiceIds[0] || null;

    if (!primaryServiceId || !date || !time) {
      return res.status(400).json({ message: 'branch_id, service_id, customer_name, date and time are required.' });
    }

    const usesPackage = usesPackageBooking({
      notes,
      customer_package_id: req.body.customer_package_id,
    });

    let finalAmount = amount;
    if (usesPackage) {
      const pkgId = req.body.customer_package_id || parsePackageIdFromNotes(notes);
      if (amount !== undefined && amount !== null && amount !== '') {
        finalAmount = Number(amount);
      } else {
        finalAmount = pkgId ? await resolvePackageBundlePrice(req, pkgId) : 0;
      }
    } else if (finalAmount === undefined || finalAmount === null || finalAmount === '') {
      const services = await Service.findAll({
        where: { id: validServiceIds, ...tenantWhere(req) },
        attributes: ['price'],
        raw: true,
      });
      finalAmount = services.reduce((sum, svc) => sum + Number(svc.price || 0), 0);
    } else {
      finalAmount = Number(finalAmount);
    }

    const appt = await Appointment.create({
      branch_id, customer_id, staff_id, service_id: primaryServiceId, customer_name, phone, date, time, amount: finalAmount, notes,
      status: req.body.status || 'pending',
      ...recurringFields,
      tenant_id: resolveTenantId(req),
    });

    await replaceAppointmentServiceMappings(appt.id, validServiceIds);

    let advancePayment = null;
    if (hasAdvance) {
      advancePayment = await recordAdvancePayment({
        req,
        appointment: appt,
        amount: parsedAdvance,
        method: advanceMethod,
        customer_id: customer_id || null,
        customer_name,
        branch_id,
        staff_id: staff_id || null,
        service_id: primaryServiceId,
      });
      await appt.reload();
    }

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
      notifyAppointmentConfirmed({ ...appt.toJSON(), phone: notifyPhone }, branch, service, resolveTenantId(req));
    }

    const timeLabel = appt.time ? appt.time.slice(0, 5) : '';
    if (staff_id) {
      notifyStaffUser(staff_id, '📅 New Appointment', `${appt.customer_name} — ${timeLabel}`, {
        type: 'appointment_assigned',
        appointment_id: String(appt.id),
        branch_id: String(branch_id),
      });
    } else {
      notifyBranch(branch_id, '📅 New Appointment', `${appt.customer_name} — ${timeLabel}`, {
        type: 'new_appointment',
        appointment_id: String(appt.id),
        branch_id: String(branch_id),
      });
    }

    return res.status(201).json({
      ...appt.toJSON(),
      service_ids: validServiceIds,
      advance_payment_id: advancePayment?.id || null,
      advance_paid: hasAdvance ? parsedAdvance : 0,
      amount_paid: hasAdvance ? parsedAdvance : 0,
    });
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

    const allowed = [
      'staff_id', 'service_id', 'customer_name', 'phone', 'date', 'time',
      'amount', 'notes', 'is_recurring', 'recurrence_frequency', 'recurring_next_date',
      'recurring_message_template_id', 'recurring_message_template_ids',
    ];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.is_recurring === false) {
      updates.recurrence_frequency = null;
      updates.recurring_next_date = null;
      updates.recurring_message_template_id = null;
      updates.recurring_message_template_ids = null;
    }
    if (updates.recurring_message_template_id !== undefined) {
      const tid = parseInt(updates.recurring_message_template_id, 10);
      updates.recurring_message_template_id = Number.isInteger(tid) && tid > 0 ? tid : null;
    }
    if (updates.recurring_message_template_ids !== undefined) {
      const tids = Array.isArray(updates.recurring_message_template_ids)
        ? [...new Set(updates.recurring_message_template_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
        : [];
      updates.recurring_message_template_ids = tids.length ? tids : null;
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

      const nextNotes = req.body.notes !== undefined ? req.body.notes : appt.notes;
      const packageBooking = usesPackageBooking({
        notes: nextNotes,
        customer_package_id: req.body.customer_package_id,
      });

      // Recalculate amount from selected services when amount is not explicitly supplied
      if (req.body.amount === undefined && !packageBooking) {
        const selected = await Service.findAll({
          where: { id: nextServiceIds, ...tenantWhere(req) },
          attributes: ['price'],
          raw: true,
        });
        updates.amount = selected.reduce((sum, svc) => sum + Number(svc.price || 0), 0);
      } else if (packageBooking && req.body.amount === undefined) {
        const pkgId = req.body.customer_package_id || parsePackageIdFromNotes(nextNotes);
        updates.amount = pkgId ? await resolvePackageBundlePrice(req, pkgId) : 0;
      }
    }

    // Auto-update amount from service price when service changes
    if (updates.service_id && req.body.amount === undefined && !nextServiceIds && !notesUsesPackage(req.body.notes ?? appt.notes)) {
      const svc = await Service.findOne({ where: byIdWhere(req, updates.service_id), attributes: ['price'] });
      if (svc) updates.amount = svc.price;
    }

    const prevStaffId = appt.staff_id;
    if (
      updates.date !== undefined
      || updates.time !== undefined
      || updates.service_id !== undefined
      || nextServiceIds
    ) {
      updates.reminder_15_sent_at = null;
      updates.reminder_before_start_sent_at = null;
      updates.reminder_at_end_sent_at = null;
    }
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
      notifyAppointmentConfirmed(appt, branch, service, resolveTenantId(req));
    }

    // Send notification when appointment is completed
    if (status === 'completed' && appt.phone) {
      const [branch, service] = await Promise.all([
        Branch.findOne({ where: byIdWhere(req, appt.branch_id), attributes: ['id', 'name', 'phone'] }),
        Service.findOne({ where: byIdWhere(req, appt.service_id), attributes: ['id', 'name'] }),
      ]);
      notifyAppointmentCompleted(appt, branch, service, resolveTenantId(req));
    }

    // Push notification for cancellation
    if (status === 'cancelled') {
      notifyBranch(appt.branch_id, '❌ Appointment Cancelled', appt.customer_name, {
        type: 'appointment_cancelled',
        appointment_id: String(appt.id),
        branch_id: String(appt.branch_id),
      });

      // Auto-notify matching waitlist entries (fire-and-forget)
      setImmediate(async () => {
        try {
          const { Waitlist } = require('../models');
          const where = { status: 'waiting', branch_id: appt.branch_id };
          if (appt.tenant_id) where.tenant_id = appt.tenant_id;
          if (appt.service_id) where.service_id = appt.service_id;
          if (appt.date) where.preferred_date = { [Op.or]: [{ [Op.eq]: appt.date }, { [Op.is]: null }] };
          const waiting = await Waitlist.findAll({
            where,
            order: [['createdAt', 'ASC']],
            limit: 5,
            include: [
              { model: require('../models/Service'), as: 'service', attributes: ['id', 'name'], required: false },
            ],
          });
          const branch = waiting.length
            ? await require('../models/Branch').findOne({ where: { id: appt.branch_id }, attributes: ['id', 'name'] })
            : null;
          for (const w of waiting) {
            w.status = 'notified';
            w.notified_at = new Date();
            await w.save();
            notifyWaitlistSlotAvailable(w, branch, w.service || null);
          }
          if (waiting.length > 0) {
            console.log(`[waitlist] Auto-notified ${waiting.length} entries for cancelled appt #${appt.id}`);
          }
        } catch (e) {
          console.error('[waitlist] auto-notify failed:', e.message);
        }
      });
    }

    // Auto-create next recurring appointment when completed
    if (status === 'completed' && appt.is_recurring) {
      setImmediate(() => createNextRecurring(appt, {
        nextDate: appt.recurring_next_date || undefined,
        skipNotify: true,
      }));
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

module.exports = { list, calendar, availability, getOne, create, update, changeStatus, remove, listRecurring, stopRecurring };
