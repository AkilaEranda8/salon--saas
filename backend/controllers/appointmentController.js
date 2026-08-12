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
const { resolveCustomerId } = require('../utils/resolveCustomer');

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
  const sid = linked ? Number(linked.id) : -1;
  // Own primary staff OR assigned on a service line
  where[Op.and] = [
    ...(where[Op.and] ? (Array.isArray(where[Op.and]) ? where[Op.and] : [where[Op.and]]) : []),
    {
      [Op.or]: [
        { staff_id: sid },
        sequelize.literal(
          `EXISTS (SELECT 1 FROM appointment_services AS asv WHERE asv.appointment_id = \`Appointment\`.\`id\` AND asv.staff_id = ${sid})`,
        ),
      ],
    },
  ];
  delete where.staff_id;
}

async function assertStaffOwnsAppointment(req, appt) {
  if (isTeamAppointmentRole(roleOf(req))) return null;
  const linked = await resolveStaffRecordForRequest(req);
  if (!linked) {
    return { status: 403, message: 'You can only access your own appointments.' };
  }
  if (Number(appt.staff_id) === Number(linked.id)) return null;
  await ensureAppointmentServicesTable();
  const line = await AppointmentService.findOne({
    where: { appointment_id: appt.id, staff_id: linked.id },
    attributes: ['id'],
  });
  if (!line) {
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
    appointmentServicesTableReadyPromise = (async () => {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS appointment_services (
          id INT AUTO_INCREMENT PRIMARY KEY,
          appointment_id INT NOT NULL,
          service_id INT NOT NULL,
          staff_id INT NULL,
          sort_order INT NOT NULL DEFAULT 0,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_appt_service (appointment_id, service_id),
          KEY idx_appointment_id (appointment_id),
          KEY idx_service_id (service_id),
          KEY idx_staff_id (staff_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
      `);
      const [cols] = await sequelize.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'appointment_services'
          AND COLUMN_NAME = 'staff_id'
      `);
      if (!cols.length) {
        await sequelize.query(`
          ALTER TABLE appointment_services
          ADD COLUMN staff_id INT NULL AFTER service_id,
          ADD KEY idx_staff_id (staff_id)
        `);
      }
      for (const col of ['date', 'time']) {
        const [found] = await sequelize.query(`
          SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'appointment_services'
            AND COLUMN_NAME = '${col}'
        `);
        if (!found.length) {
          const sql = col === 'date'
            ? 'ADD COLUMN date DATE NULL AFTER staff_id'
            : 'ADD COLUMN time TIME NULL AFTER date';
          await sequelize.query(`ALTER TABLE appointment_services ${sql}`);
        }
      }
    })().catch((err) => {
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
    const id = Number(value?.service_id ?? value?.serviceId ?? value);
    if (Number.isInteger(id) && id > 0) ids.push(id);
  }

  const fallback = Number(fallbackServiceId);
  if (!ids.length && Number.isInteger(fallback) && fallback > 0) {
    ids.push(fallback);
  }

  return Array.from(new Set(ids));
};

/** Normalize [{service_id, staff_id, date?, time?}] (+ service_staff / items). */
const normalizeServiceLines = ({ serviceIds, serviceId, serviceStaff, items } = {}) => {
  const lineMap = new Map();
  const order = [];

  const mergeLine = (raw) => {
    const service_id = Number(raw?.service_id ?? raw?.serviceId);
    if (!Number.isInteger(service_id) || service_id <= 0) return;
    if (!lineMap.has(service_id)) {
      lineMap.set(service_id, {
        service_id,
        staff_id: null,
        date: null,
        time: null,
      });
      order.push(service_id);
    }
    const line = lineMap.get(service_id);
    const staffRaw = raw?.staff_id ?? raw?.staffId;
    if (staffRaw != null && staffRaw !== '') {
      const staffNum = Number(staffRaw);
      if (Number.isInteger(staffNum) && staffNum > 0) line.staff_id = staffNum;
    }
    const rawDate = raw?.date;
    if (rawDate != null && String(rawDate).trim()) {
      line.date = String(rawDate).trim().slice(0, 10);
    }
    const rawTime = raw?.time;
    if (rawTime != null && String(rawTime).trim()) {
      line.time = normalizeTime(rawTime);
    }
  };

  if (Array.isArray(items) && items.length) {
    for (const raw of items) mergeLine(raw);
  }

  if (Array.isArray(serviceStaff)) {
    for (const raw of serviceStaff) mergeLine(raw);
  } else if (serviceStaff && typeof serviceStaff === 'object') {
    for (const [k, v] of Object.entries(serviceStaff)) {
      if (v && typeof v === 'object') mergeLine({ service_id: k, ...v });
      else mergeLine({ service_id: k, staff_id: v });
    }
  }

  const ids = normalizeServiceIds(serviceIds, serviceId);
  for (const sid of ids) {
    if (!lineMap.has(sid)) {
      lineMap.set(sid, { service_id: sid, staff_id: null, date: null, time: null });
      order.push(sid);
    }
  }

  return order.map((sid) => lineMap.get(sid));
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

const replaceAppointmentServiceMappings = async (appointmentId, serviceIdsOrLines = [], transaction = null) => {
  await ensureAppointmentServicesTable();

  const txOpt = transaction ? { transaction } : {};
  await AppointmentService.destroy({ where: { appointment_id: appointmentId }, ...txOpt });

  const lines = Array.isArray(serviceIdsOrLines)
    ? serviceIdsOrLines.map((raw, idx) => {
      if (raw && typeof raw === 'object') {
        const service_id = Number(raw.service_id ?? raw.serviceId);
        const staffRaw = raw.staff_id ?? raw.staffId;
        const staffNum = staffRaw != null && staffRaw !== '' ? Number(staffRaw) : null;
        const lineDate = raw.date != null && String(raw.date).trim()
          ? String(raw.date).trim().slice(0, 10)
          : null;
        const lineTime = raw.time != null && String(raw.time).trim()
          ? normalizeTime(raw.time)
          : null;
        return {
          service_id,
          staff_id: (Number.isInteger(staffNum) && staffNum > 0) ? staffNum : null,
          date: lineDate,
          time: lineTime,
          sort_order: Number.isInteger(raw.sort_order) ? raw.sort_order : idx,
        };
      }
      return {
        service_id: Number(raw),
        staff_id: null,
        date: null,
        time: null,
        sort_order: idx,
      };
    }).filter((l) => Number.isInteger(l.service_id) && l.service_id > 0)
    : [];

  if (!lines.length) return;

  await AppointmentService.bulkCreate(
    lines.map((l, idx) => ({
      appointment_id: appointmentId,
      service_id: l.service_id,
      staff_id: l.staff_id,
      date: l.date,
      time: l.time,
      sort_order: l.sort_order ?? idx,
    })),
    txOpt,
  );
};

const existingStaffId = (raw) => {
  const n = raw != null && raw !== '' ? Number(raw) : null;
  return Number.isInteger(n) && n > 0 ? n : null;
};

const mergeAppointmentServiceLines = (incomingLines, existingRows, fallbackStaff) => {
  const existingBySvc = new Map(
    (existingRows || []).map((r) => [Number(r.service_id), r]),
  );
  const fallbackId = existingStaffId(fallbackStaff);
  return (incomingLines || []).map((l) => {
    const prev = existingBySvc.get(Number(l.service_id));
    const incomingId = existingStaffId(l.staff_id);
    const prevId = existingStaffId(prev?.staff_id);
    return {
      ...l,
      staff_id: incomingId || prevId || fallbackId || null,
      date: l.date || (prev?.date ? String(prev.date).slice(0, 10) : null),
      time: l.time || (prev?.time ? normalizeTime(prev.time) : null),
    };
  });
};

const attachServiceIdsToAppointments = async (appointments) => {
  const list = Array.isArray(appointments) ? appointments.filter(Boolean) : (appointments ? [appointments] : []);
  if (!list.length) return;

  await ensureAppointmentServicesTable();

  const apptIds = list.map((a) => Number(a.id)).filter(Boolean);
  if (!apptIds.length) return;

  const rows = await AppointmentService.findAll({
    where: { appointment_id: { [Op.in]: apptIds } },
    attributes: ['appointment_id', 'service_id', 'staff_id', 'date', 'time', 'sort_order', 'id'],
    order: [['appointment_id', 'ASC'], ['sort_order', 'ASC'], ['id', 'ASC']],
    raw: true,
  });

  const map = new Map();
  const staffMap = new Map();
  for (const row of rows) {
    const key = Number(row.appointment_id);
    if (!map.has(key)) map.set(key, []);
    if (!staffMap.has(key)) staffMap.set(key, []);
    map.get(key).push(Number(row.service_id));
    staffMap.get(key).push({
      service_id: Number(row.service_id),
      staff_id: row.staff_id != null ? Number(row.staff_id) : null,
      date: row.date ? String(row.date).slice(0, 10) : null,
      time: row.time ? normalizeTime(row.time) : null,
    });
  }

  const allStaffIds = [...new Set(rows.map((r) => Number(r.staff_id)).filter((id) => id > 0))];
  const allSvcIds = [...new Set(rows.map((r) => Number(r.service_id)).filter((id) => id > 0))];
  const [staffRows, svcRows] = await Promise.all([
    allStaffIds.length
      ? Staff.findAll({ where: { id: allStaffIds }, attributes: ['id', 'name'], raw: true })
      : [],
    allSvcIds.length
      ? Service.findAll({ where: { id: allSvcIds }, attributes: ['id', 'name'], raw: true })
      : [],
  ]);
  const staffNameById = new Map(staffRows.map((s) => [Number(s.id), s.name]));
  const svcNameById = new Map(svcRows.map((s) => [Number(s.id), s.name]));

  for (const appt of list) {
    const ids = map.get(Number(appt.id)) || [];
    const fallbackPrimary = Number(appt.service_id || 0);
    const finalIds = ids.length
      ? Array.from(new Set(ids))
      : (fallbackPrimary ? [fallbackPrimary] : []);
    const apptDate = appt.date ? String(appt.date).slice(0, 10) : null;
    const apptTime = appt.time ? normalizeTime(appt.time) : null;
    const serviceStaff = (staffMap.get(Number(appt.id)) || finalIds.map((sid) => ({
      service_id: sid,
      staff_id: appt.staff_id != null ? Number(appt.staff_id) : null,
      date: apptDate,
      time: apptTime,
    }))).map((line) => ({
      ...line,
      date: line.date || apptDate,
      time: line.time || apptTime,
      staff_name: line.staff_id ? (staffNameById.get(Number(line.staff_id)) || null) : null,
      service_name: svcNameById.get(Number(line.service_id)) || null,
    }));
    if (typeof appt.setDataValue === 'function') {
      appt.setDataValue('service_ids', finalIds);
      appt.setDataValue('service_staff', serviceStaff);
    } else {
      appt.service_ids = finalIds;
      appt.service_staff = serviceStaff;
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
        {
          model: Service,
          as: 'service',
          attributes: ['id', 'name', 'duration_minutes'],
        },
        {
          model: Service,
          as: 'services',
          attributes: ['id', 'name', 'duration_minutes'],
          through: { attributes: [] },
          required: false,
        },
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
      items, advance_amount, advance_method, service_staff,
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

    const resolvedCustomerId = await resolveCustomerId(req, { customerId: customer_id, phone });

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
        ? normalizeTime(bodySmsTime || time || (Array.isArray(items) && items[0] && items[0].time) || null)
        : null,
      recurring_message_template_id: is_recurring && Number.isInteger(recurringTplId) && recurringTplId > 0
        ? recurringTplId
        : null,
      recurring_message_template_ids: is_recurring && recurringTplIds?.length ? recurringTplIds : null,
    };

    // ── items[] compat: fold into ONE multi-service appointment (pay once) ──
    let effectiveDate = date;
    let effectiveTime = time;
    let effectiveStaffId = staff_id;
    let effectiveServiceIds = service_ids;
    let effectiveServiceStaff = service_staff;
    if (Array.isArray(items) && items.length > 0) {
      const fromItems = normalizeServiceLines({ items });
      if (!fromItems.length) {
        return res.status(400).json({ message: 'items must include valid service_id values.' });
      }
      effectiveServiceIds = fromItems.map((l) => l.service_id);
      effectiveServiceStaff = fromItems.map((l, idx) => ({
        service_id: l.service_id,
        staff_id: l.staff_id,
        date: items[idx]?.date || date || null,
        time: items[idx]?.time || time || null,
      }));
      const first = items[0] || {};
      effectiveDate = date || first.date;
      effectiveTime = time || first.time;
      if (staff_id == null || staff_id === '') {
        const firstStaff = fromItems.find((l) => l.staff_id)?.staff_id
          || first.staff_id
          || first.staffId
          || null;
        effectiveStaffId = firstStaff;
      }
    }

    // ── Single appointment (multi-service; optional per-service staff) ──
    const serviceLines = normalizeServiceLines({
      serviceIds: effectiveServiceIds,
      serviceId: service_id,
      serviceStaff: effectiveServiceStaff,
    });
    // Fill empty line staff from top-level staff_id / self
    const defaultStaff = selfStaffId != null
      ? Number(selfStaffId)
      : (effectiveStaffId != null && effectiveStaffId !== '' ? Number(effectiveStaffId) : null);
    const linesWithStaff = serviceLines.map((l) => ({
      ...l,
      staff_id: l.staff_id || ((Number.isInteger(defaultStaff) && defaultStaff > 0) ? defaultStaff : null),
    }));
    const requestedServiceIds = linesWithStaff.map((l) => l.service_id);
    const validServiceIds = await resolveValidServiceIds(req, requestedServiceIds);
    if (requestedServiceIds.length && validServiceIds.length !== requestedServiceIds.length) {
      return res.status(400).json({ message: 'One or more selected services are invalid.' });
    }
    const validLines = linesWithStaff
      .filter((l) => validServiceIds.includes(l.service_id))
      .map((l) => ({
        ...l,
        date: l.date || effectiveDate || null,
        time: l.time || effectiveTime || null,
      }));
    const primaryServiceId = validLines[0]?.service_id || null;
    const assignedStaffId = selfStaffId != null
      ? Number(selfStaffId)
      : (validLines.find((l) => l.staff_id)?.staff_id || null);

    const headerDate = validLines[0]?.date || effectiveDate;
    const headerTime = validLines[0]?.time || effectiveTime;

    if (!primaryServiceId) {
      return res.status(400).json({ message: 'branch_id, service_id and customer_name are required.' });
    }
    for (let i = 0; i < validLines.length; i += 1) {
      const line = validLines[i];
      if (!line.date || !line.time) {
        return res.status(400).json({ message: `Service line ${i + 1}: date and time are required.` });
      }
      if (isDateTimeInPast(line.date, line.time)) {
        return res.status(400).json({ message: pastBookingMessage() });
      }
    }
    effectiveDate = headerDate;
    effectiveTime = headerTime;

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

    // Conflict: sequential blocks per service line staff (same start chain)
    const durRows = await Service.findAll({
      where: { id: validServiceIds, ...tenantWhere(req) },
      attributes: ['id', 'duration_minutes'],
      raw: true,
    });
    const durById = new Map(durRows.map((s) => [Number(s.id), parseInt(s.duration_minutes, 10) || 30]));
    for (const line of validLines) {
      const dur = durById.get(line.service_id) || 30;
      const lineStaff = line.staff_id || assignedStaffId;
      const lineDate = line.date || effectiveDate;
      const lineTime = line.time || effectiveTime;
      const startMin = toMinutes(lineTime);
      if (startMin == null) {
        return res.status(400).json({ message: 'Invalid time.' });
      }
      const endMin = startMin + dur;
      if (lineStaff) {
        const existing = await loadBlockedRanges({
          Appointment,
          Service,
          staffId: lineStaff,
          date: lineDate,
          branchId: null,
        });
        const clash = existing.some(([bStart, bEnd]) => startMin < bEnd && endMin > bStart);
        if (clash) {
          return res.status(409).json({
            message: 'Selected time overlaps an existing booking for an assigned staff. Choose another slot.',
          });
        }
      }
    }

    const appt = await Appointment.create({
      branch_id, customer_id: resolvedCustomerId || null,
      staff_id: assignedStaffId,
      service_id: primaryServiceId, customer_name, phone,
      date: effectiveDate, time: normalizeTime(effectiveTime), amount: finalAmount, notes,
      status: req.body.status || 'pending',
      ...recurringFields,
      tenant_id: resolveTenantId(req),
    });

    await replaceAppointmentServiceMappings(appt.id, validLines);

    let advancePayment = null;
    if (hasAdvance) {
      advancePayment = await recordAdvancePayment({
        req,
        appointment: appt,
        amount: parsedAdvance,
        method: advanceMethod,
        customer_id: resolvedCustomerId || null,
        customer_name,
        branch_id,
        staff_id: effectiveStaffId || assignedStaffId || null,
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
    const [branch, primaryService] = await Promise.all([
      Branch.findOne({ where: byIdWhere(req, branch_id), attributes: ['id', 'name', 'phone'] }),
      Service.findOne({ where: byIdWhere(req, primaryServiceId), attributes: ['id', 'name'] }),
    ]);

    const notifiedStaff = new Set();
    for (const line of validLines) {
      const lineStaffId = line.staff_id || assignedStaffId;
      if (!lineStaffId) continue;
      const lineDate = line.date || appt.date;
      const lineTime = line.time || appt.time;
      const lineTimeLabel = lineTime ? String(lineTime).slice(0, 5) : '';
      const lineService = await Service.findOne({
        where: byIdWhere(req, line.service_id),
        attributes: ['id', 'name'],
      });

      // WhatsApp per assigned staff (their service + time)
      notifyStaffAppointmentAssigned(
        { ...appt.toJSON(), staff_id: lineStaffId, date: lineDate, time: lineTime },
        branch,
        lineService || primaryService,
        resolveTenantId(req),
      );

      if (notifiedStaff.has(Number(lineStaffId))) continue;
      notifiedStaff.add(Number(lineStaffId));
      notifyStaffUser(lineStaffId, '📅 New Appointment', `${appt.customer_name} — ${lineTimeLabel}`, {
        type: 'appointment_assigned',
        appointment_id: String(appt.id),
        branch_id: String(branch_id),
      });
    }

    // Customer SMS/WhatsApp/email on create (any status). Confirm transition does not re-send.
    if (notifyPhone) {
      notifyAppointmentConfirmed({ ...appt.toJSON(), phone: notifyPhone }, branch, primaryService, resolveTenantId(req));
    }

    if (!notifiedStaff.size) {
      const timeLabel = appt.time ? appt.time.slice(0, 5) : '';
      notifyBranch(branch_id, '📅 New Appointment', `${appt.customer_name} — ${timeLabel}`, {
        type: 'new_appointment',
        appointment_id: String(appt.id),
        branch_id: String(branch_id),
      });
    }

    await attachServiceIdsToAppointments(appt);

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
    if (updates.recurring_next_date !== undefined) {
      const next = String(updates.recurring_next_date || '').slice(0, 10);
      const prev = String(appt.recurring_next_date || '').slice(0, 10);
      if (next && next !== prev) updates.recurring_sms_sent_at = null;
    }

    let nextServiceLines = null;
    if (req.body.service_ids !== undefined || req.body.service_id !== undefined || req.body.service_staff !== undefined) {
      // Always merge existing appointment_services staff/date/time.
      // Collect Payment used to send service_staff with every line stamped to
      // header staff_id, which destroyed per-service assignments.
      await ensureAppointmentServicesTable();
      const existingRows = await AppointmentService.findAll({
        where: { appointment_id: appt.id },
        attributes: ['service_id', 'staff_id', 'date', 'time', 'sort_order'],
        order: [['sort_order', 'ASC'], ['id', 'ASC']],
        raw: true,
      });
      const existingIds = existingRows.map((r) => Number(r.service_id)).filter((id) => id > 0);
      const requestedIds = normalizeServiceIds(
        req.body.service_ids !== undefined ? req.body.service_ids : (existingIds.length ? existingIds : [appt.service_id]),
        req.body.service_id || appt.service_id,
      );
      const sameServiceSet = requestedIds.length === existingIds.length
        && requestedIds.every((id) => existingIds.includes(id));

      // Notes/amount/payment updates that repeat the same service_ids must not
      // destroy and recreate mappings. Only remap when the set changed or the
      // client sent an explicit service_staff payload.
      const staffPayloadSent = req.body.service_staff !== undefined;
      if (staffPayloadSent || !sameServiceSet) {
        const incomingStaff = staffPayloadSent ? req.body.service_staff : existingRows;
        const lines = normalizeServiceLines({
          serviceIds: requestedIds,
          serviceId: req.body.service_id || appt.service_id,
          serviceStaff: incomingStaff,
        });
        const requestedServiceIds = lines.map((l) => l.service_id);
        const validIds = await resolveValidServiceIds(req, requestedServiceIds);
        if (requestedServiceIds.length && validIds.length !== requestedServiceIds.length) {
          return res.status(400).json({ message: 'One or more selected services are invalid.' });
        }
        if (!validIds.length) {
          return res.status(400).json({ message: 'At least one valid service is required.' });
        }
        const fallbackStaff = updates.staff_id !== undefined
          ? updates.staff_id
          : appt.staff_id;
        nextServiceLines = mergeAppointmentServiceLines(
          lines.filter((l) => validIds.includes(l.service_id)),
          existingRows,
          fallbackStaff,
        );
        if (!nextServiceLines.length) {
          return res.status(400).json({ message: 'At least one valid service is required.' });
        }

        // Collect Payment used to stamp every line with header staff_id and did
        // not send a top-level staff_id. Ignore that collapse. Real Edit always
        // sends staff_id, so reassigning every service to one person still works.
        const existingDistinct = [...new Set(
          existingRows.map((r) => existingStaffId(r.staff_id)).filter(Boolean),
        )];
        const incomingDistinct = [...new Set(
          nextServiceLines.map((l) => existingStaffId(l.staff_id)).filter(Boolean),
        )];
        const headerStaff = existingStaffId(fallbackStaff);
        if (
          req.body.staff_id === undefined
          && existingDistinct.length > 1
          && incomingDistinct.length === 1
          && incomingDistinct[0] === headerStaff
        ) {
          nextServiceLines = mergeAppointmentServiceLines(
            nextServiceLines.map((l) => ({ ...l, staff_id: null })),
            existingRows,
            fallbackStaff,
          );
        }

        updates.service_id = nextServiceLines[0].service_id;
        if (nextServiceLines[0]?.date) updates.date = nextServiceLines[0].date;
        if (nextServiceLines[0]?.time) updates.time = nextServiceLines[0].time;
      }

      const nextNotes = req.body.notes !== undefined ? req.body.notes : appt.notes;
      const packageBooking = usesPackageBooking({
        notes: nextNotes,
        customer_package_id: req.body.customer_package_id,
      });

      // Recalculate amount from selected services when amount is not explicitly supplied
      if (req.body.amount === undefined && !packageBooking) {
        const validIds = await resolveValidServiceIds(req, requestedIds);
        const selected = await Service.findAll({
          where: { id: validIds, ...tenantWhere(req) },
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
    if (updates.service_id && req.body.amount === undefined && !nextServiceLines && !notesUsesPackage(req.body.notes ?? appt.notes)) {
      const svc = await Service.findOne({ where: byIdWhere(req, updates.service_id), attributes: ['price'] });
      if (svc) updates.amount = svc.price;
    }

    const prevStaffId = appt.staff_id;
    if (
      updates.date !== undefined
      || updates.time !== undefined
      || updates.service_id !== undefined
      || nextServiceLines
    ) {
      updates.reminder_15_sent_at = null;
      updates.reminder_before_start_sent_at = null;
      updates.reminder_at_end_sent_at = null;
    }
    await appt.update(updates);

    if (nextServiceLines) {
      await replaceAppointmentServiceMappings(appt.id, nextServiceLines);
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
