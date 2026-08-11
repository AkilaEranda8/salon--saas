const { Op, Transaction } = require('sequelize');
const { Appointment, Branch, Customer, Staff, Service, Payment, PaymentSplit, StaffOffDay, Attendance } = require('../models');
const AppointmentService = require('../models/AppointmentService');
const { sequelize } = require('../config/database');
const {
  notifyAppointmentConfirmed,
  notifyAppointmentCompleted,
  notifyWaitlistSlotAvailable,
  notifyStaffAppointmentAssigned,
} = require('../services/notificationService');
const { cancelLinkedNextAppointment, normalizeTime } = require('../services/recurringService');
const { notifyBranch, notifyStaffUser } = require('../services/fcmService');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');
const { notesUsesPackage, usesPackageBooking, parsePackageIdFromNotes, resolvePackageBundlePrice } = require('../utils/packageNotes');
const {
  parseDurationMinutes,
  listAvailableSlots,
  isDateTimeInPast,
  pastBookingMessage,
  loadBlockedRanges,
} = require('../utils/staffAvailability');
const { resolveStaffRecordForRequest } = require('../utils/resolveUserBranch');

const ADVANCE_METHODS = new Set(['Cash', 'Card', 'Online Transfer']);
const ADVANCE_NOTE_PREFIX = 'Advance paid: ';

function toMinutes(hhmm) {
  const raw = String(hhmm || '').trim().substring(0, 5);
  const [h, m] = raw.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function roleOf(req) {
  return String(req.user?.role || req.userRole || '').toLowerCase();
}

function isTeamAppointmentRole(role) {
  return role === 'superadmin' || role === 'admin' || role === 'manager';
}

/** Staff (non-manager) users only see/edit their own appointments. */
async function applyStaffSelfScope(req, where) {
  if (isTeamAppointmentRole(roleOf(req))) return;
  const linked = await resolveStaffRecordForRequest(req);
  where.staff_id = linked ? linked.id : -1;
}

async function assertStaffOwnsAppointment(req, appt) {
  if (isTeamAppointmentRole(roleOf(req))) return null;
  const linked = await resolveStaffRecordForRequest(req);
  if (!linked || Number(appt.staff_id) !== Number(linked.id)) {
    return { status: 403, message: 'You can only access your own appointments.' };
  }
  return null;
}

async function linkedStaffIdOrNull(req) {
  if (isTeamAppointmentRole(roleOf(req))) return null;
  const linked = await resolveStaffRecordForRequest(req);
  return linked ? linked.id : null;
}

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

const replaceAppointmentServiceMappings = async (appointmentId, serviceIds = [], transaction = null) => {
  await ensureAppointmentServicesTable();

  const txOpt = transaction ? { transaction } : {};
  await AppointmentService.destroy({ where: { appointment_id: appointmentId }, ...txOpt });
  if (!serviceIds.length) return;

  await AppointmentService.bulkCreate(
    serviceIds.map((sid, idx) => ({
      appointment_id: appointmentId,
      service_id: sid,
      sort_order: idx,
    })),
    { ignoreDuplicates: true, ...txOpt },
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

  // Customer SMS/WhatsApp for advance (non-blocking)
  setImmediate(async () => {
    try {
      const { Branch, Service, Customer } = require('../models');
      const { notifyAdvancePayment } = require('../services/notificationService');
      const tid = resolveTenantId(req);
      const [branch, service, customer] = await Promise.all([
        Branch.findByPk(branch_id, { attributes: ['id', 'name', 'phone'] }),
        service_id
          ? Service.findByPk(service_id, { attributes: ['id', 'name'] })
          : Promise.resolve(null),
        customer_id
          ? Customer.findByPk(customer_id, { attributes: ['id', 'name', 'phone'] })
          : Promise.resolve(null),
      ]);
      const freshAppt = await appointment.reload().catch(() => appointment);
      await notifyAdvancePayment({
        payment,
        appointment: freshAppt,
        branch,
        service,
        customer,
        method: advanceMethod,
        tenantId: tid,
      });
    } catch (err) {
      console.error('[appointments] advance payment notify failed:', err.message);
    }
  });

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

    const ymd = (v) => {
      const s = String(v || '').slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
    };
    const singleDate = ymd(req.query.date);
    const dateFrom = ymd(req.query.date_from || req.query.dateFrom);
    const dateTo = ymd(req.query.date_to || req.query.dateTo);
    if (singleDate) {
      where.date = singleDate;
    } else if (dateFrom && dateTo) {
      where.date = { [Op.between]: [dateFrom <= dateTo ? dateFrom : dateTo, dateFrom <= dateTo ? dateTo : dateFrom] };
    } else if (dateFrom) {
      where.date = { [Op.gte]: dateFrom };
    } else if (dateTo) {
      where.date = { [Op.lte]: dateTo };
    }

    // Staff role: force own appointments only (ignore client staffId override)
    await applyStaffSelfScope(req, where);

    const dayScoped = Boolean(singleDate || dateFrom || dateTo);
    const { count, rows } = await Appointment.findAndCountAll({
      where,
      limit,
      offset,
      order: dayScoped && req.query.sort === 'time'
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
    const result = await listAvailableSlots({
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

    return res.json({
      duration_minutes: durationMinutes,
      slots: Array.isArray(result?.slots) ? result.slots : (Array.isArray(result) ? result : []),
      remainder_slots: Array.isArray(result?.remainder_slots) ? result.remainder_slots : [],
      occupied: result?.occupied || [],
      gaps: result?.gaps || [],
      window: result?.window || null,
      server_now: result?.server_now || null,
    });
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
    await applyStaffSelfScope(req, where);

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

    const denied = await assertStaffOwnsAppointment(req, appt);
    if (denied) return res.status(denied.status).json({ message: denied.message });

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

    const selfStaffId = await linkedStaffIdOrNull(req);
    if (!isTeamAppointmentRole(roleOf(req)) && !selfStaffId) {
      return res.status(403).json({ message: 'No staff profile linked to this account.' });
    }

    const recurringTplId = parseInt(recurring_message_template_id, 10);
    const recurringTplIds = Array.isArray(recurring_message_template_ids)
      ? [...new Set(recurring_message_template_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
      : null;
    const bodySmsTime = req.body.recurring_sms_time || req.body.appointment_time || null;
    const recurringFields = {
      is_recurring: is_recurring || false,
      recurrence_frequency: is_recurring ? (recurrence_frequency || 'weekly') : null,
      recurring_next_date: is_recurring ? (recurring_next_date || null) : null,
      recurring_sms_time: is_recurring
        ? normalizeTime(bodySmsTime || time)
        : null,
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
        const requestedStaff = raw.staff_id != null && raw.staff_id !== ''
          ? Number(raw.staff_id)
          : null;
        // Prefer explicitly chosen staff per service (multi-booking).
        // Fall back to linked staff profile when caller left staff empty.
        const itemStaff = (Number.isInteger(requestedStaff) && requestedStaff > 0)
          ? requestedStaff
          : (selfStaffId != null ? Number(selfStaffId) : null);
        const itemDate = String(raw.date || '').trim();
        const rawTime = String(raw.time || '').trim();
        if (!Number.isInteger(sid) || sid <= 0) {
          return res.status(400).json({ message: `items[${i}].service_id is required.` });
        }
        if (!itemDate || !rawTime) {
          return res.status(400).json({ message: `items[${i}] needs date and time.` });
        }
        const itemTime = normalizeTime(rawTime);
        if (isDateTimeInPast(itemDate, itemTime)) {
          return res.status(400).json({ message: pastBookingMessage() });
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
        attributes: ['id', 'name', 'price', 'duration_minutes'],
        raw: true,
      });
      const serviceMap = new Map(serviceRows.map((s) => [Number(s.id), s]));

      // Build start/end ranges for conflict checks (assigned staff only).
      const ranged = normalizedItems.map((item, idx) => {
        const duration = parseDurationMinutes(
          serviceMap.get(item.service_id)?.duration_minutes,
          30,
        );
        const start = toMinutes(item.time);
        return {
          ...item,
          idx,
          duration,
          start,
          end: start != null ? start + duration : null,
          serviceName: serviceMap.get(item.service_id)?.name || `Service ${item.service_id}`,
        };
      });
      for (const row of ranged) {
        if (row.start == null || row.end == null) {
          return res.status(400).json({
            message: `Invalid time for ${row.serviceName}.`,
          });
        }
      }

      // Within-request overlap: same staff + same date.
      for (let i = 0; i < ranged.length; i += 1) {
        for (let j = i + 1; j < ranged.length; j += 1) {
          const a = ranged[i];
          const b = ranged[j];
          if (
            a.staff_id != null
            && b.staff_id != null
            && Number(a.staff_id) === Number(b.staff_id)
            && a.date === b.date
            && rangesOverlap(a.start, a.end, b.start, b.end)
          ) {
            return res.status(409).json({
              message: `${a.serviceName} and ${b.serviceName} overlap for the same staff on ${a.date}. Pick different times.`,
            });
          }
        }
      }

      // Against existing appointments (grouped by staff+date).
      const groups = new Map();
      for (const row of ranged) {
        if (row.staff_id == null) continue;
        const key = `${row.staff_id}|${row.date}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }
      for (const [key, group] of groups.entries()) {
        const [staffIdStr, date] = key.split('|');
        const existing = await loadBlockedRanges({
          Appointment,
          Service,
          staffId: Number(staffIdStr),
          date,
          branchId: null,
        });
        const clash = group.find(({ start, end }) =>
          existing.some(([bStart, bEnd]) => rangesOverlap(start, end, bStart, bEnd)));
        if (clash) {
          return res.status(409).json({
            message: `${clash.serviceName}: selected time is not available. Choose another slot.`,
          });
        }
      }

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
      const tx = await sequelize.transaction({
        isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
      });
      try {
        // Re-check conflicts inside transaction for assigned staff.
        for (const [key, group] of groups.entries()) {
          const [staffIdStr, date] = key.split('|');
          const existingTx = await loadBlockedRanges({
            Appointment,
            Service,
            staffId: Number(staffIdStr),
            date,
            branchId: null,
            transaction: tx,
          });
          const clashTx = group.find(({ start, end }) =>
            existingTx.some(([bStart, bEnd]) => rangesOverlap(start, end, bStart, bEnd)));
          if (clashTx) {
            await tx.rollback();
            return res.status(409).json({
              message: `${clashTx.serviceName}: selected time is no longer available. Choose another slot.`,
            });
          }
        }

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

          // Recurring fields only on the first booking — avoids N duplicate chains.
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
            ...(i === 0 ? recurringFields : {
              is_recurring: false,
              recurrence_frequency: null,
              recurring_next_date: null,
              recurring_sms_time: null,
              recurring_message_template_id: null,
              recurring_message_template_ids: null,
            }),
            tenant_id: resolveTenantId(req),
          }, { transaction: tx });
          await replaceAppointmentServiceMappings(appt.id, [item.service_id], tx);
          created.push(appt);
        }

        await tx.commit();
      } catch (err) {
        try { await tx.rollback(); } catch (_) { /* ignore */ }
        throw err;
      }

      for (const appt of created) {
        const timeLabel = appt.time ? String(appt.time).slice(0, 5) : '';
        if (appt.staff_id) {
          notifyStaffUser(appt.staff_id, '📅 New Appointment', `${customer_name} — ${timeLabel}`, {
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

      // SMS only when appointment is already confirmed — avoids double SMS when staff later confirms.
      const notifyPhone = phone || (customer_id
        ? await (async () => {
            const { Customer: CustModel } = require('../models');
            const c = await CustModel.findOne({ where: byIdWhere(req, customer_id), attributes: ['phone'] });
            return c?.phone || null;
          })()
        : null);
      const [branch, service] = await Promise.all([
        Branch.findOne({ where: byIdWhere(req, branch_id), attributes: ['id', 'name', 'phone'] }),
        Service.findOne({ where: byIdWhere(req, created[0]?.service_id), attributes: ['id', 'name'] }),
      ]);
      // WhatsApp assigned staff as soon as the booking is created
      for (const row of created) {
        notifyStaffAppointmentAssigned(row, branch, service, resolveTenantId(req));
      }
      // Customer SMS/WhatsApp/email on create (any status). Confirm transition does not re-send.
      if (notifyPhone && created[0]) {
        notifyAppointmentConfirmed({ ...created[0].toJSON(), phone: notifyPhone }, branch, service, resolveTenantId(req));
      }

      const createdJson = created.map((a) => ({ ...a.toJSON(), service_ids: [a.service_id] }));
      if (hasAdvance && createdJson[0]) {
        createdJson[0].advance_paid = parsedAdvance;
        createdJson[0].amount_paid = parsedAdvance;
      }

      return res.status(201).json({
        message: createdJson.length > 1
          ? `${createdJson.length} bookings created successfully`
          : 'Booking created successfully',
        count: createdJson.length,
        ids: createdJson.map((a) => a.id),
        appointments: createdJson,
        advance_payment_id: advancePayment?.id || null,
        advance_paid: hasAdvance ? parsedAdvance : 0,
        // Keep first appointment shape for older clients that expect a single row
        ...createdJson[0],
        // Do not overwrite single-row service_ids with all item ids
        service_ids: createdJson[0]?.service_ids || [],
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
    if (isDateTimeInPast(date, time)) {
      return res.status(400).json({ message: pastBookingMessage() });
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

    const assignedStaffId = selfStaffId != null ? selfStaffId : (staff_id || null);
    if (assignedStaffId) {
      const durRows = await Service.findAll({
        where: { id: validServiceIds, ...tenantWhere(req) },
        attributes: ['duration_minutes'],
      });
      const newDur = durRows.reduce((acc, s) => acc + (Number(s.duration_minutes) || 0), 0) || 30;
      const start = toMinutes(time);
      if (start == null) {
        return res.status(400).json({ message: 'Invalid time.' });
      }
      const existing = await loadBlockedRanges({
        Appointment,
        Service,
        staffId: assignedStaffId,
        date,
        branchId: null,
      });
      const clash = existing.some(([bStart, bEnd]) => start < bEnd && (start + newDur) > bStart);
      if (clash) {
        return res.status(409).json({
          message: 'Selected time overlaps an existing booking. Choose a time after that service ends.',
        });
      }
    }

    const appt = await Appointment.create({
      branch_id, customer_id,
      staff_id: assignedStaffId,
      service_id: primaryServiceId, customer_name, phone, date, time, amount: finalAmount, notes,
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
    const [branch, service] = await Promise.all([
      Branch.findOne({ where: byIdWhere(req, branch_id), attributes: ['id', 'name', 'phone'] }),
      Service.findOne({ where: byIdWhere(req, primaryServiceId), attributes: ['id', 'name'] }),
    ]);
    // WhatsApp assigned staff as soon as the booking is created
    notifyStaffAppointmentAssigned(appt, branch, service, resolveTenantId(req));
    // Customer SMS/WhatsApp/email on create (any status). Confirm transition does not re-send.
    if (notifyPhone) {
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

    const deniedOwn = await assertStaffOwnsAppointment(req, appt);
    if (deniedOwn) return res.status(deniedOwn.status).json({ message: deniedOwn.message });

    // Status must go through PATCH /appointments/:id/status.
    // Older clients still send status on PUT — ignore when unchanged; reject only if changing.
    if (req.body.status !== undefined && String(req.body.status) !== String(appt.status)) {
      return res.status(400).json({
        message: 'Use PATCH /appointments/:id/status to update appointment status.',
      });
    }

    const allowed = [
      'staff_id', 'service_id', 'customer_name', 'phone', 'date', 'time',
      'amount', 'notes', 'is_recurring', 'recurrence_frequency', 'recurring_next_date',
      'recurring_sms_time', 'recurring_message_template_id', 'recurring_message_template_ids',
    ];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (req.body.appointment_time !== undefined && updates.recurring_sms_time === undefined) {
      updates.recurring_sms_time = req.body.appointment_time;
    }
    if (updates.time !== undefined) {
      const t = String(updates.time || '').trim();
      const m = t.match(/^(\d{1,2}):(\d{2})/);
      updates.time = m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : t.slice(0, 5);
    }
    if (updates.recurring_sms_time !== undefined) {
      updates.recurring_sms_time = updates.recurring_sms_time
        ? normalizeTime(updates.recurring_sms_time)
        : null;
    }

    if (updates.date !== undefined || updates.time !== undefined) {
      const nextDate = updates.date !== undefined ? updates.date : appt.date;
      const nextTime = updates.time !== undefined ? updates.time : appt.time;
      if (isDateTimeInPast(nextDate, nextTime)) {
        const sameDate = String(nextDate).slice(0, 10) === String(appt.date || '').slice(0, 10);
        const sameTime = String(nextTime || '').slice(0, 5) === String(appt.time || '').slice(0, 5);
        // Allow editing other fields on an already-past appointment without changing schedule
        if (!(sameDate && sameTime)) {
          return res.status(400).json({ message: pastBookingMessage() });
        }
      }
    }
    // Staff cannot reassign appointment to another stylist
    if (!isTeamAppointmentRole(roleOf(req))) {
      delete updates.staff_id;
    }
    if (updates.is_recurring === false) {
      updates.recurrence_frequency = null;
      updates.recurring_next_date = null;
      updates.recurring_sms_time = null;
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

    // If staff was newly assigned or changed, notify that staff (push + WhatsApp)
    const newStaffId = updates.staff_id !== undefined ? updates.staff_id : null;
    const staffReassigned = newStaffId != null
      && String(newStaffId) !== ''
      && String(newStaffId) !== String(prevStaffId ?? '');
    if (staffReassigned) {
      const timeLabel = appt.time ? String(appt.time).slice(0, 5) : '';
      notifyStaffUser(newStaffId, '📅 Assigned to You', `${appt.customer_name} — ${timeLabel}`, {
        type: 'appointment_assigned',
        appointment_id: String(appt.id),
        branch_id: String(appt.branch_id),
      });
      try {
        const [branch, service] = await Promise.all([
          Branch.findOne({ where: byIdWhere(req, appt.branch_id), attributes: ['id', 'name', 'phone'] }),
          Service.findOne({ where: byIdWhere(req, appt.service_id), attributes: ['id', 'name'] }),
        ]);
        notifyStaffAppointmentAssigned(appt, branch, service, resolveTenantId(req));
      } catch (notifyErr) {
        console.warn('[appointments][update] staff WhatsApp notify failed:', notifyErr.message);
      }
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

    const deniedOwn = await assertStaffOwnsAppointment(req, appt);
    if (deniedOwn) return res.status(deniedOwn.status).json({ message: deniedOwn.message });

    const previousStatus = appt.status;

    // Completed only after collect payment (final paid row, not advance deposit).
    if (status === 'completed' && previousStatus !== 'completed') {
      const paidFinal = await Payment.count({
        where: {
          appointment_id: appt.id,
          status: 'paid',
          is_advance: false,
        },
      });
      if (!paidFinal) {
        return res.status(400).json({
          message: 'Appointment can only be marked completed after collecting payment.',
        });
      }
    }

    await appt.update({ status });

    // Customer notified on create — do not re-send when confirming (avoids duplicate SMS).

    // Send notification when appointment is completed
    if (status === 'completed' && previousStatus !== 'completed' && appt.phone) {
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

    // Recurring is reminder-only — do not auto-book the next appointment.
    if (status === 'completed' && appt.is_recurring) {
      setImmediate(() => {
        cancelLinkedNextAppointment(appt).catch((e) =>
          console.error('[appointments] cancel linked recurring next failed:', e.message),
        );
      });
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

    const deniedOwn = await assertStaffOwnsAppointment(req, appt);
    if (deniedOwn) return res.status(deniedOwn.status).json({ message: deniedOwn.message });

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
    await applyStaffSelfScope(req, where);

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
      const completedCount = allInChain.filter((a) => a.status === 'completed').length;
      const nextDate = parent.recurring_next_date || null;
      const nextTime = parent.recurring_sms_time || parent.time || null;
      const bookedNext = allInChain.find((a) => ['pending', 'confirmed'].includes(a.status));
      const nextScheduled = nextDate && !parent.recurring_sms_sent_at
        ? { id: parent.id, date: nextDate, time: nextTime, reminder_only: true }
        : (bookedNext
          ? { id: bookedNext.id, date: bookedNext.date, time: bookedNext.time }
          : null);

      return {
        parent: parent.toJSON(),
        children,
        totalBookings: allInChain.length,
        completedCount,
        nextScheduled,
        isActive: Boolean(parent.is_recurring && nextDate && !parent.recurring_sms_sent_at)
          || Boolean(bookedNext),
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
