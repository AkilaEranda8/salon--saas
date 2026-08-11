/**
 * CRM Integration APIs — tool backend for ai_engine.
 * Auth: X-Service-Key + X-Tenant-Id (or tenantId query/body).
 * Does not modify public booking / ai_bot flows.
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
const Package = require('../models/Package');
const Discount = require('../models/Discount');
const StaffSpecialization = require('../models/StaffSpecialization');
const StaffOffDay = require('../models/StaffOffDay');
const Attendance = require('../models/Attendance');
const {
  parseDurationMinutes,
  listAvailableSlots,
  BLOCKING_ATTENDANCE_STATUSES,
} = require('../utils/staffAvailability');
const { resolveStaffDayWindow } = require('../utils/staffSchedule');
const { getRedis, cacheKey } = require('../utils/redis');

const CACHE_TTL_SEC = 120;

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

function toMinutes(hhmm) {
  const s = String(hhmm || '').substring(0, 5);
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

async function cacheGet(key) {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key, value, ttl = CACHE_TTL_SEC) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttl);
  } catch {
    /* ignore */
  }
}

async function findCustomerByPhone(tenantId, phone) {
  const variants = buildPhoneVariants(phone);
  if (!variants.length) return null;
  return Customer.findOne({
    where: {
      tenant_id: tenantId,
      phone: { [Op.or]: variants },
    },
  });
}

async function getCustomerHistory(tenantId, customerId, limit = 10) {
  return Appointment.findAll({
    where: {
      tenant_id: tenantId,
      customer_id: customerId,
      status: { [Op.ne]: 'cancelled' },
    },
    order: [['date', 'DESC'], ['time', 'DESC']],
    limit,
    attributes: ['id', 'date', 'time', 'status', 'service_id', 'staff_id', 'branch_id', 'amount', 'customer_name'],
  });
}

/** GET /customers/by-phone?phone= */
const customerByPhone = async (req, res) => {
  try {
    const tenantId = req.crmTenantId;
    const phone = req.query.phone || req.body?.phone;
    if (!phone) return res.status(400).json({ message: 'phone is required' });

    const customer = await findCustomerByPhone(tenantId, phone);
    if (!customer) {
      return res.json({
        exists: false,
        phone: normalizePhoneDigits(phone),
        customer: null,
        history: [],
      });
    }

    const history = await getCustomerHistory(tenantId, customer.id);
    return res.json({
      exists: true,
      phone: customer.phone,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        branch_id: customer.branch_id,
      },
      history,
    });
  } catch (err) {
    console.error('[crm-integration] customerByPhone', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** GET /branches */
const listBranches = async (req, res) => {
  try {
    const tenantId = req.crmTenantId;
    const key = cacheKey(tenantId, 'crm', 'branches');
    const cached = await cacheGet(key);
    if (cached) return res.json(cached);

    const rows = await Branch.findAll({
      where: { tenant_id: tenantId, status: 'active' },
      attributes: ['id', 'name', 'address', 'phone', 'color'],
      order: [['name', 'ASC']],
    });
    const data = rows.map((r) => r.toJSON());
    await cacheSet(key, data);
    return res.json(data);
  } catch (err) {
    console.error('[crm-integration] listBranches', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** GET /services */
const listServices = async (req, res) => {
  try {
    const tenantId = req.crmTenantId;
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const key = cacheKey(tenantId, 'crm', 'services', branchId || 'all');
    const cached = await cacheGet(key);
    if (cached) return res.json(cached);

    const where = {
      tenant_id: tenantId,
      is_active: true,
    };
    // Prefer online-available for AI channel; fall back to all active if none
    let rows = await Service.findAll({
      where: { ...where, available_online: true },
      attributes: ['id', 'name', 'price', 'duration_minutes', 'category', 'description'],
      order: [['name', 'ASC']],
    });
    if (!rows.length) {
      rows = await Service.findAll({
        where,
        attributes: ['id', 'name', 'price', 'duration_minutes', 'category', 'description'],
        order: [['name', 'ASC']],
      });
    }
    const data = rows.map((r) => r.toJSON());
    await cacheSet(key, data);
    return res.json(data);
  } catch (err) {
    console.error('[crm-integration] listServices', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** GET /staff?branchId=&serviceId= */
const listStaff = async (req, res) => {
  try {
    const tenantId = req.crmTenantId;
    const serviceId = req.query.serviceId ? Number(req.query.serviceId) : null;

    const where = { tenant_id: tenantId, is_active: true };
    let rows = await Staff.findAll({
      where: { ...where, available_online: true },
      attributes: ['id', 'name', 'branch_id', 'working_hours', 'photo_url'],
      order: [['name', 'ASC']],
    });
    if (!rows.length) {
      rows = await Staff.findAll({
        where,
        attributes: ['id', 'name', 'branch_id', 'working_hours', 'photo_url'],
        order: [['name', 'ASC']],
      });
    }

    if (serviceId) {
      const specs = await StaffSpecialization.findAll({
        where: { service_id: serviceId },
        attributes: ['staff_id'],
      });
      const allowed = new Set(specs.map((s) => Number(s.staff_id)));
      // If specializations exist for this service, filter; if staff have no specs at all, keep them
      if (allowed.size) {
        rows = rows.filter((s) => allowed.has(Number(s.id)));
      }
    }

    return res.json(rows.map((r) => r.toJSON()));
  } catch (err) {
    console.error('[crm-integration] listStaff', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** GET /availability?staffId=&date=&duration= */
const getAvailability = async (req, res) => {
  try {
    const tenantId = req.crmTenantId;
    const { staffId, date, duration } = req.query;
    if (!staffId || !date) {
      return res.status(400).json({ message: 'staffId and date are required' });
    }
    const staffIdNum = Number(staffId);
    const durationMinutes = parseDurationMinutes(duration, 30);

    const result = await listAvailableSlots({
      Staff,
      StaffOffDay,
      Attendance,
      Appointment,
      Service,
      staffId: staffIdNum,
      date: String(date).slice(0, 10),
      durationMinutes,
      tenantId,
      requireOnline: false,
      scopeBranchConflicts: false,
    });

    return res.json({
      slots: Array.isArray(result?.slots) ? result.slots : (Array.isArray(result) ? result : []),
      window: result?.window || null,
      duration_minutes: durationMinutes,
      server_now: result?.server_now || null,
    });
  } catch (err) {
    console.error('[crm-integration] availability', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** GET /packages — active packages (offer fields for WhatsApp AI) */
const listPackages = async (req, res) => {
  try {
    const tenantId = req.crmTenantId;
    const offersOnly = String(req.query.offers || '') === '1';
    const key = cacheKey(tenantId, 'crm', offersOnly ? 'packages_offers' : 'packages');
    const cached = await cacheGet(key);
    if (cached) return res.json(cached);

    const rows = await Package.findAll({
      where: { tenant_id: tenantId, is_active: true },
      order: [['name', 'ASC']],
    });
    let data = rows.map((r) => {
      const j = r.toJSON();
      const orig = Number(j.original_price) || 0;
      const price = Number(j.package_price) || 0;
      const disc = Number(j.discount_percent) || 0;
      const showOffer = j.show_as_offer !== false;
      return {
        id: j.id,
        name: j.name,
        type: j.type,
        description: j.description,
        offer_title: j.offer_title || null,
        offer_note: j.offer_note || j.description || null,
        show_as_offer: showOffer,
        package_price: price,
        original_price: orig,
        discount_percent: disc,
        savings: Math.max(0, orig - price),
        validity_days: j.validity_days,
        sessions_count: j.sessions_count,
        services: j.services,
      };
    });
    if (offersOnly) {
      data = data.filter((p) => p.show_as_offer && (p.discount_percent > 0 || p.offer_title || p.offer_note));
    }
    await cacheSet(key, data);
    return res.json(data);
  } catch (err) {
    console.error('[crm-integration] packages', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** GET /promotions — active discounts */
const listPromotions = async (req, res) => {
  try {
    const tenantId = req.crmTenantId;
    const today = new Date().toISOString().slice(0, 10);
    const rows = await Discount.findAll({
      where: {
        tenant_id: tenantId,
        is_active: true,
        [Op.or]: [
          { starts_at: null },
          { starts_at: { [Op.lte]: today } },
        ],
      },
      order: [['id', 'DESC']],
      limit: 50,
    });
    const data = rows
      .map((r) => r.toJSON())
      .filter((d) => !d.ends_at || String(d.ends_at).slice(0, 10) >= today)
      .map((d) => ({
        id: d.id,
        name: d.name,
        code: d.code || null,
        discount_type: d.discount_type,
        value: Number(d.value),
        min_bill: Number(d.min_bill) || 0,
        max_discount_amount: d.max_discount_amount != null ? Number(d.max_discount_amount) : null,
        starts_at: d.starts_at,
        ends_at: d.ends_at,
      }));
    return res.json(data);
  } catch (err) {
    // Discount schema varies — soft-fail
    console.warn('[crm-integration] promotions', err.message);
    return res.json([]);
  }
};

/** GET /appointments?phone= */
const listAppointments = async (req, res) => {
  try {
    const tenantId = req.crmTenantId;
    const phone = req.query.phone;
    if (!phone) return res.status(400).json({ message: 'phone is required' });

    const variants = buildPhoneVariants(phone);
    const today = new Date().toISOString().slice(0, 10);
    const rows = await Appointment.findAll({
      where: {
        tenant_id: tenantId,
        phone: { [Op.or]: variants },
        date: { [Op.gte]: today },
        status: { [Op.in]: ['pending', 'confirmed', 'in_service'] },
      },
      order: [['date', 'ASC'], ['time', 'ASC']],
      limit: 20,
    });
    return res.json(rows);
  } catch (err) {
    console.error('[crm-integration] listAppointments', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

async function resolveIdempotent(tenantId, idempotencyKey) {
  if (!idempotencyKey) return null;
  const redis = getRedis();
  const key = cacheKey(tenantId, 'crm', 'idem', idempotencyKey);
  if (redis) {
    try {
      const id = await redis.get(key);
      if (id && id !== 'pending') {
        const appt = await Appointment.findOne({ where: { id: Number(id), tenant_id: tenantId } });
        if (appt) return appt;
      }
    } catch { /* ignore */ }
  }
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
 * Acquire idempotency lock with SET NX (C17). Returns false if another request holds it.
 */
async function acquireIdempotencyLock(tenantId, idempotencyKey) {
  if (!idempotencyKey) return { ok: true, locked: false };
  const redis = getRedis();
  if (!redis) return { ok: true, locked: false };
  const key = cacheKey(tenantId, 'crm', 'idem', idempotencyKey);
  try {
    const existing = await redis.get(key);
    if (existing && existing !== 'pending') {
      return { ok: false, existingId: Number(existing) };
    }
    const got = await redis.set(key, 'pending', 'EX', 60, 'NX');
    if (!got) {
      // Wait briefly for winner
      for (let i = 0; i < 10; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        const id = await redis.get(key);
        if (id && id !== 'pending') return { ok: false, existingId: Number(id) };
      }
      return { ok: false, existingId: null };
    }
    return { ok: true, locked: true, key };
  } catch {
    return { ok: true, locked: false };
  }
}

async function storeIdempotent(tenantId, idempotencyKey, appointmentId) {
  if (!idempotencyKey) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(cacheKey(tenantId, 'crm', 'idem', idempotencyKey), String(appointmentId), 'EX', 86400 * 7);
  } catch { /* ignore */ }
}

/**
 * POST /appointments
 * Body: { branch_id, service_id, staff_id, date, time, customer_name, phone, email?, notes?, idempotency_key? }
 * Creates confirmed appointment (AI customer already confirmed on WhatsApp).
 * C17: DB unique active slot + transaction — Redis optional, never sole guard.
 */
const createAppointment = async (req, res) => {
  const tenantId = req.crmTenantId;
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
  } = req.body || {};

  if (!service_id || !staff_id || !date || !time || !customer_name || !phone) {
    return res.status(400).json({
      message: 'service_id, staff_id, date, time, customer_name, and phone are required',
    });
  }

  try {
    const existingIdem = await resolveIdempotent(tenantId, idempotency_key);
    if (existingIdem) {
      return res.status(200).json({ appointment: existingIdem, idempotent: true });
    }

    const lock = await acquireIdempotencyLock(tenantId, idempotency_key);
    if (!lock.ok) {
      if (lock.existingId) {
        const appt = await Appointment.findOne({ where: { id: lock.existingId, tenant_id: tenantId } });
        if (appt) return res.status(200).json({ appointment: appt, idempotent: true });
      }
      const again = await resolveIdempotent(tenantId, idempotency_key);
      if (again) return res.status(200).json({ appointment: again, idempotent: true });
      return res.status(409).json({ message: 'Booking already in progress' });
    }

    const dateKey = String(date).slice(0, 10);
    const timeKey = String(time).substring(0, 5);

    // Best-effort Redis slot lock (not required — DB unique is authority)
    const redis = getRedis();
    if (redis) {
      const slotLockKey = cacheKey(tenantId, 'crm', 'slot', staff_id, dateKey, timeKey);
      const slotOk = await redis.set(slotLockKey, '1', 'EX', 30, 'NX');
      if (!slotOk) {
        return res.status(409).json({ message: 'Selected time is being booked by another request' });
      }
    }

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

      const [service, staffRow] = await Promise.all([
        Service.findOne({
          where: { id: service_id, tenant_id: tenantId, is_active: true },
          transaction: t,
        }),
        Staff.findOne({
          where: { id: staff_id, tenant_id: tenantId, is_active: true },
          transaction: t,
        }),
      ]);
      if (!service) {
        const err = new Error('Service not found');
        err.code = 'NOT_FOUND';
        throw err;
      }
      if (!staffRow) {
        const err = new Error('Staff not found');
        err.code = 'NOT_FOUND';
        throw err;
      }

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

      const duration = service.duration_minutes || 30;
      const dayWindow = resolveStaffDayWindow(staffRow.working_hours, dateKey);
      if (dayWindow.closed) {
        const err = new Error('Staff is not working on this date');
        err.code = 'BAD_REQUEST';
        throw err;
      }
      const start = toMinutes(timeKey);
      const end = start + duration;
      if (start < dayWindow.startMin || end > dayWindow.endMin) {
        const err = new Error('Selected time is outside working hours');
        err.code = 'BAD_REQUEST';
        throw err;
      }

      const slotResult = await listAvailableSlots({
        Staff,
        StaffOffDay,
        Attendance,
        Appointment,
        Service,
        staffId: Number(staff_id),
        date: dateKey,
        durationMinutes: duration,
        tenantId,
        requireOnline: false,
        scopeBranchConflicts: false,
      });
      const slots = Array.isArray(slotResult?.slots) ? slotResult.slots : [];
      if (slots.length && !slots.includes(timeKey)) {
        const err = new Error('Selected time is not available');
        err.code = 'SLOT_CONFLICT';
        throw err;
      }

      let customer = await findCustomerByPhone(tenantId, phone);
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
      if (idempotency_key) noteParts.push(`[idem:${idempotency_key}]`);

      const appointment = await Appointment.create({
        tenant_id: tenantId,
        branch_id: branchId,
        customer_id: customer.id,
        service_id: service.id,
        staff_id: Number(staff_id),
        customer_name,
        phone: String(phone).trim(),
        date: dateKey,
        time: timeKey,
        amount: service.price || 0,
        status: 'confirmed',
        notes: noteParts.join(' '),
      }, { transaction: t });

      try {
        await AppointmentService.create({
          appointment_id: appointment.id,
          service_id: service.id,
        }, { transaction: t });
      } catch {
        // join optional
      }

      return { appointment, customer };
    });

    await storeIdempotent(tenantId, idempotency_key, result.appointment.id);

    // Same salon notification path as UI bookings (SMS / WhatsApp / staff WA)
    try {
      const {
        notifyAppointmentConfirmed,
        notifyStaffAppointmentAssigned,
      } = require('../services/notificationService');
      const branch = await Branch.findOne({
        where: { id: result.appointment.branch_id, tenant_id: tenantId },
        attributes: ['id', 'name', 'phone'],
      });
      const serviceRow = await Service.findOne({
        where: { id: result.appointment.service_id, tenant_id: tenantId },
        attributes: ['id', 'name'],
      });
      const apptPayload = {
        ...result.appointment.toJSON(),
        phone: result.appointment.phone || String(phone).trim(),
        email: email || result.customer?.email || null,
      };
      await Promise.allSettled([
        notifyStaffAppointmentAssigned(apptPayload, branch, serviceRow, tenantId),
        notifyAppointmentConfirmed(apptPayload, branch, serviceRow, tenantId),
      ]);
      console.log(
        `[crm-integration] salon notifications queued appointment=${result.appointment.id} phone=${apptPayload.phone}`
      );
    } catch (notifyErr) {
      console.warn('[crm-integration] appointment notify failed:', notifyErr.message);
    }

    return res.status(201).json({
      appointment: result.appointment,
      customer: {
        id: result.customer.id,
        name: result.customer.name,
        phone: result.customer.phone,
      },
      idempotent: false,
    });
  } catch (err) {
    if (err.code === 'SLOT_CONFLICT' || err.name === 'SequelizeUniqueConstraintError') {
      if (err.appointment) {
        await storeIdempotent(tenantId, idempotency_key, err.appointment.id);
        return res.status(409).json({
          message: 'Selected time is already booked',
          appointment: err.appointment,
          conflict: true,
        });
      }
      return res.status(409).json({
        message: 'Selected time is already booked',
        conflict: true,
      });
    }
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ message: err.message });
    }
    if (err.code === 'BAD_REQUEST') {
      return res.status(400).json({ message: err.message });
    }
    console.error('[crm-integration] createAppointment', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

/** PUT /appointments/:id — reschedule date/time/staff */
const rescheduleAppointment = async (req, res) => {
  try {
    const tenantId = req.crmTenantId;
    const id = Number(req.params.id);
    const appt = await Appointment.findOne({ where: { id, tenant_id: tenantId } });
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });
    if (['completed', 'cancelled'].includes(appt.status)) {
      return res.status(400).json({ message: `Cannot reschedule a ${appt.status} appointment` });
    }

    const updates = {};
    if (req.body.date) updates.date = String(req.body.date).slice(0, 10);
    if (req.body.time) updates.time = String(req.body.time).substring(0, 5);
    if (req.body.staff_id) updates.staff_id = Number(req.body.staff_id);
    if (req.body.notes !== undefined) updates.notes = req.body.notes;

    const nextDate = updates.date || appt.date;
    const nextTime = updates.time || String(appt.time).substring(0, 5);
    const nextStaff = updates.staff_id || appt.staff_id;

    const service = await Service.findByPk(appt.service_id);
    const duration = service?.duration_minutes || 30;
    const slotResult = await listAvailableSlots({
      Staff,
      StaffOffDay,
      Attendance,
      Appointment,
      Service,
      staffId: Number(nextStaff),
      date: String(nextDate).slice(0, 10),
      durationMinutes: duration,
      tenantId,
      requireOnline: false,
      scopeBranchConflicts: false,
    });
    const slots = Array.isArray(slotResult?.slots) ? slotResult.slots : [];
    // Allow current slot if same appointment occupies it
    const sameSlot = String(appt.date).slice(0, 10) === String(nextDate).slice(0, 10)
      && String(appt.time).substring(0, 5) === nextTime
      && Number(appt.staff_id) === Number(nextStaff);
    if (!sameSlot && slots.length && !slots.includes(nextTime)) {
      return res.status(409).json({ message: 'Selected time is not available' });
    }

    await appt.update(updates);
    return res.json({ appointment: appt });
  } catch (err) {
    console.error('[crm-integration] reschedule', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /appointments/:id/cancel */
const cancelAppointment = async (req, res) => {
  try {
    const tenantId = req.crmTenantId;
    const id = Number(req.params.id);
    const appt = await Appointment.findOne({ where: { id, tenant_id: tenantId } });
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });
    if (appt.status === 'cancelled') {
      return res.json({ appointment: appt, already_cancelled: true });
    }
    if (appt.status === 'completed') {
      return res.status(400).json({ message: 'Cannot cancel a completed appointment' });
    }

    const reason = req.body?.reason ? String(req.body.reason).slice(0, 500) : '';
    const notes = [appt.notes || '', reason ? `[cancel_reason:${reason}]` : '', '[cancelled_via:whatsapp_ai_crm]']
      .filter(Boolean)
      .join(' ');

    await appt.update({ status: 'cancelled', notes });
    return res.json({ appointment: appt, already_cancelled: false });
  } catch (err) {
    console.error('[crm-integration] cancel', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** GET /knowledge/search?q= */
const searchKnowledgeHandler = async (req, res) => {
  try {
    const tenantId = req.crmTenantId;
    const q = req.query.q || '';
    const { searchKnowledge, formatSnippetsForPrompt } = require('../services/knowledgeService');
    const hits = await searchKnowledge(tenantId, q, {
      limit: Math.min(parseInt(req.query.limit, 10) || 5, 10),
      branchId: req.query.branchId || null,
      category: req.query.category || null,
    });
    return res.json({
      query: q,
      hits,
      prompt_block: formatSnippetsForPrompt(hits),
    });
  } catch (err) {
    console.error('[crm-integration] knowledge', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  customerByPhone,
  listBranches,
  listServices,
  listStaff,
  getAvailability,
  listPackages,
  listPromotions,
  listAppointments,
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  searchKnowledge: searchKnowledgeHandler,
};
