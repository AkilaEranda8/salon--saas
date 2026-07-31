const express = require('express');
const router = express.Router();
const { Op, Transaction } = require('sequelize');
const jwt = require('jsonwebtoken');
const Branch = require('../models/Branch');
const Service = require('../models/Service');
const Staff = require('../models/Staff');
const { staffWhereForBranch } = require('../utils/staffBranchFilter');
const Appointment = require('../models/Appointment');
const Customer = require('../models/Customer');
const Package = require('../models/Package');
const CustomerPackage = require('../models/CustomerPackage');
const Payment = require('../models/Payment');
const PaymentSplit = require('../models/PaymentSplit');
const { sendSMS } = require('../services/notificationService');
const { getMaintenanceMode } = require('../services/systemSettings');
const Tenant = require('../models/Tenant');
const WEB_BOOKING_BRANCH_NAME = 'HEXAONE (VIP)';

async function resolveTenantSmsName(tenantId) {
  if (!tenantId) return 'Salon';
  try {
    const tenant = await Tenant.findByPk(tenantId, {
      attributes: ['id', 'name', 'brand_name'],
    });
    const label = String(tenant?.brand_name || tenant?.name || '').trim();
    return label || 'Salon';
  } catch {
    return 'Salon';
  }
}

function toPublicUrl(req, relPath = '') {
  if (!relPath || typeof relPath !== 'string') return relPath;
  if (/^https?:\/\//i.test(relPath)) return relPath;
  const storageBase = String(process.env.STORAGE_BASE_URL || '').trim().replace(/\/+$/, '');
  if (storageBase) return `${storageBase}${relPath.startsWith('/') ? relPath : `/${relPath}`}`;
  const host = req.get('x-forwarded-host') || req.get('host');
  const protoHdr = String(req.get('x-forwarded-proto') || req.protocol || 'http');
  const proto = protoHdr.split(',')[0].trim() || 'http';
  if (!host) return relPath;
  return `${proto}://${host}${relPath.startsWith('/') ? relPath : `/${relPath}`}`;
}

async function resolveWebBookingBranchId(fallbackBranchId = null, tenantId = null) {
  const where = { name: WEB_BOOKING_BRANCH_NAME, status: 'active' };
  if (tenantId) where.tenant_id = Number(tenantId);

  const vip = await Branch.findOne({
    where,
    attributes: ['id'],
  });
  if (vip?.id) return vip.id;

  if (!fallbackBranchId) return null;

  // When a tenant is provided, only accept a branch that belongs to that tenant.
  if (tenantId) {
    const branch = await Branch.findOne({
      where: {
        id: Number(fallbackBranchId),
        tenant_id: Number(tenantId),
        status: 'active',
      },
      attributes: ['id'],
    });
    return branch?.id || null;
  }

  return Number(fallbackBranchId);
}

function buildBookingConflictWhere({ staffId, date, branchId = null }) {
  const where = {
    staff_id: Number(staffId),
    date,
    status: { [Op.in]: ['pending', 'confirmed', 'in_service'] },
  };
  if (branchId) where.branch_id = Number(branchId);
  return where;
}

// ── GET /api/public/maintenance-status ──────────────────────────────────────
router.get('/maintenance-status', async (_req, res) => {
  try {
    const mode = await getMaintenanceMode({ force: true });
    return res.json({
      enabled: !!mode.enabled,
      message: mode.message,
      endsAt: mode.endsAt || null,
    });
  } catch (err) {
    console.error('Public maintenance-status error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/public/branches — active branches only ──────────────────────────
router.get('/branches', async (req, res) => {
  try {
    const tenantId = req.query.tenantId ? parseInt(req.query.tenantId, 10) : null;
    const tenantWhr = tenantId ? { tenant_id: tenantId } : {};

    const vip = await Branch.findOne({
      where: { name: WEB_BOOKING_BRANCH_NAME, status: 'active', ...tenantWhr },
      attributes: ['id', 'name', 'address', 'phone', 'color'],
    });
    if (vip) return res.json([vip]);

    const branches = await Branch.findAll({
      where: { status: 'active', ...tenantWhr },
      attributes: ['id', 'name', 'address', 'phone', 'color'],
      order: [['name', 'ASC']],
    });
    res.json(branches);
  } catch (err) {
    console.error('Public branches error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/public/services — active services only ──────────────────────────
router.get('/services', async (req, res) => {
  try {
    const tenantId = req.query.tenantId ? parseInt(req.query.tenantId, 10) : null;
    const tenantWhr = tenantId ? { tenant_id: tenantId } : {};

    const services = await Service.findAll({
      where: { is_active: true, available_online: true, ...tenantWhr },
      attributes: ['id', 'name', 'category', 'duration_minutes', 'description'],
      order: [['category', 'ASC'], ['name', 'ASC']],
    });
    res.json(services);
  } catch (err) {
    console.error('Public services error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/public/staff?branchId=&tenantId= — active staff, limited fields ──────────
router.get('/staff', async (req, res) => {
  try {
    const tenantId = req.query.tenantId ? parseInt(req.query.tenantId, 10) : null;
    const where = { is_active: true };
    if (tenantId) where.tenant_id = tenantId;
    if (req.query.branchId) {
      const bid = parseInt(req.query.branchId, 10);
      const branchPart = await staffWhereForBranch(bid);
      Object.assign(where, branchPart);
    }
    const staff = await Staff.findAll({
      where,
      attributes: ['id', 'name', 'role_title', 'photo_url'],
      order: [['name', 'ASC']],
    });
    res.json(
      staff.map((s) => {
        const out = s.toJSON();
        if (out.photo_url) out.photo_url = toPublicUrl(req, out.photo_url);
        return out;
      }),
    );
  } catch (err) {
    console.error('Public staff error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/public/availability?staffId=&date=&duration= ────────────────────
// Returns available HH:MM time slots considering existing appointment durations.
// duration = new booking's service duration in minutes (default 30).
router.get('/availability', async (req, res) => {
  try {
    const { staffId, date, duration, branchId, tenantId } = req.query;
    if (!staffId || !date) {
      return res.status(400).json({ message: 'staffId and date are required' });
    }

    const staffIdNum = Number(staffId);
    if (!Number.isInteger(staffIdNum) || staffIdNum <= 0) {
      return res.status(400).json({ message: 'staffId must be a valid number' });
    }

    const newDuration = Math.max(30, parseInt(duration, 10) || 30);
    const tenantIdNum = tenantId ? parseInt(tenantId, 10) : null;
    const effectiveBranchId = await resolveWebBookingBranchId(branchId, tenantIdNum);

    // Fetch existing appointments with their service duration
    const appointments = await Appointment.findAll({
      where: buildBookingConflictWhere({ staffId: staffIdNum, date, branchId: effectiveBranchId }),
      attributes: ['time', 'service_id'],
      include: [{ model: Service, as: 'service', attributes: ['duration_minutes'] }],
    });

    // Build blocked ranges as [startMin, endMin] in minutes-since-midnight
    const blockedRanges = appointments.map((a) => {
      const [h, m] = a.time.substring(0, 5).split(':').map(Number);
      const startMin = h * 60 + m;
      const dur = (a.service && a.service.duration_minutes) ? a.service.duration_minutes : 30;
      return [startMin, startMin + dur];
    });

    // Generate slots using service duration as interval: 09:00 → 18:00
    const slotInterval = newDuration;
    const allSlots = [];
    for (let min = 9 * 60; min < 18 * 60; min += slotInterval) {
      allSlots.push(min);
    }

    // A slot is available if [slotStart, slotStart + newDuration] does NOT overlap any blocked range
    const available = allSlots.filter((slotStart) => {
      const slotEnd = slotStart + newDuration;
      // Also ensure the appointment ends by 18:30 (1110 min)
      if (slotEnd > 18 * 60 + 30) return false;
      return !blockedRanges.some(([bStart, bEnd]) => slotStart < bEnd && slotEnd > bStart);
    });

    // Convert back to "HH:MM"
    const result = available.map((min) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    });

    res.json(result);
  } catch (err) {
    console.error('Public availability error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.substring(0, 5).split(':').map(Number);
  return h * 60 + m;
};

const toHHMM = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// ── Customer Self-Service Portal (Phone OTP + JWT) ───────────────────────────
const otpStore = new Map(); // key: normalized phone OR booking:<phone>, value: { code, expiresAt, attempts, verified? }
const OTP_TTL_MS = 5 * 60 * 1000;
const BOOKING_VERIFIED_TTL_MS = 30 * 60 * 1000;

const normalizePhoneDigits = (phone = '') => String(phone).replace(/\D/g, '');
const buildPhoneVariants = (phone = '') => {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return [];
  const set = new Set([digits]);
  if (digits.startsWith('0')) set.add(`94${digits.slice(1)}`);
  if (digits.startsWith('94')) set.add(`0${digits.slice(2)}`);
  return Array.from(set);
};

const bookingOtpKey = (normalized) => `booking:${normalized}`;

const isBookingPhoneVerified = (phone = '') => {
  const normalized = normalizePhoneDigits(phone);
  if (!normalized) return false;
  const row = otpStore.get(bookingOtpKey(normalized));
  if (!row || !row.verified) return false;
  if (Date.now() > (row.verifiedUntil || 0)) {
    otpStore.delete(bookingOtpKey(normalized));
    return false;
  }
  return true;
};

const findTenantCustomerByPhone = async (phone, tenantId) => {
  const variants = buildPhoneVariants(phone);
  if (!variants.length || !tenantId) return null;
  return Customer.findOne({
    where: {
      tenant_id: tenantId,
      phone: { [Op.or]: variants },
    },
    attributes: ['id', 'name', 'phone', 'email'],
  });
};

// ── POST /api/public/booking/check-phone — returning customer? autofill, no OTP ─
router.post('/booking/check-phone', async (req, res) => {
  try {
    const tenantId = parseInt(req.body?.tenantId ?? req.query?.tenantId, 10);
    const normalized = normalizePhoneDigits(req.body?.phone);
    if (!tenantId) return res.status(400).json({ message: 'tenantId is required.' });
    if (!normalized || normalized.length < 9) {
      return res.status(400).json({ message: 'Enter a valid phone number.' });
    }

    const customer = await findTenantCustomerByPhone(normalized, tenantId);
    if (customer) {
      return res.json({
        exists: true,
        needs_otp: false,
        name: customer.name || '',
        email: customer.email || '',
        phone: customer.phone || normalized,
      });
    }
    return res.json({ exists: false, needs_otp: true });
  } catch (err) {
    console.error('booking.checkPhone error:', err);
    return res.status(500).json({ message: 'Failed to check phone number.' });
  }
});

// ── POST /api/public/booking/request-otp — new booker phone verification ───────
router.post('/booking/request-otp', async (req, res) => {
  try {
    const tenantId = parseInt(req.body?.tenantId ?? req.query?.tenantId, 10);
    const normalized = normalizePhoneDigits(req.body?.phone);
    if (!tenantId) return res.status(400).json({ message: 'tenantId is required.' });
    if (!normalized || normalized.length < 9) {
      return res.status(400).json({ message: 'Enter a valid phone number.' });
    }

    // Existing customers do not need OTP for booking
    const existing = await findTenantCustomerByPhone(normalized, tenantId);
    if (existing) {
      return res.json({
        exists: true,
        needs_otp: false,
        name: existing.name || '',
        email: existing.email || '',
        message: 'This number is already registered. OTP is not required.',
      });
    }

    const key = bookingOtpKey(normalized);
    const prior = otpStore.get(key);
    const RESEND_COOLDOWN_MS = 60 * 1000;
    if (
      prior &&
      !prior.verified &&
      prior.sentAt &&
      Date.now() - prior.sentAt < RESEND_COOLDOWN_MS &&
      Date.now() <= (prior.expiresAt || 0)
    ) {
      return res.json({
        exists: false,
        needs_otp: true,
        cooldown: true,
        message: 'OTP already sent. Please wait about a minute before requesting again.',
      });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(key, {
      code,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
      tenantId,
      verified: false,
      sentAt: Date.now(),
    });

    const salonName = await resolveTenantSmsName(tenantId);
    await sendSMS({
      to: normalized,
      message: `${salonName} booking OTP: ${code}. Valid for 5 minutes.`,
      tenantId,
      meta: { event_type: 'booking_otp', tenant_id: tenantId },
    });

    const response = { exists: false, needs_otp: true, message: 'OTP sent to your phone.' };
    if (process.env.NODE_ENV !== 'production') response.debug_otp = code;
    return res.json(response);
  } catch (err) {
    console.error('booking.requestOtp error:', err);
    return res.status(500).json({ message: 'Failed to send OTP.' });
  }
});

// ── POST /api/public/booking/verify-otp ───────────────────────────────────────
router.post('/booking/verify-otp', async (req, res) => {
  try {
    const tenantId = parseInt(req.body?.tenantId ?? req.query?.tenantId, 10);
    const normalized = normalizePhoneDigits(req.body?.phone);
    const otp = String(req.body?.otp || '').trim();
    if (!tenantId) return res.status(400).json({ message: 'tenantId is required.' });
    if (!normalized || !otp) return res.status(400).json({ message: 'Phone and OTP are required.' });

    const key = bookingOtpKey(normalized);
    const row = otpStore.get(key);
    if (!row || Date.now() > row.expiresAt) {
      otpStore.delete(key);
      return res.status(400).json({ message: 'OTP expired. Please request a new code.' });
    }
    if (row.tenantId && Number(row.tenantId) !== tenantId) {
      return res.status(400).json({ message: 'OTP does not match this salon.' });
    }
    if (row.attempts >= 5) {
      otpStore.delete(key);
      return res.status(429).json({ message: 'Too many invalid attempts. Request a new OTP.' });
    }
    if (String(otp) !== String(row.code)) {
      row.attempts += 1;
      otpStore.set(key, row);
      return res.status(401).json({ message: 'Invalid OTP.' });
    }

    otpStore.set(key, {
      verified: true,
      verifiedUntil: Date.now() + BOOKING_VERIFIED_TTL_MS,
      tenantId,
    });
    return res.json({ verified: true, message: 'Phone verified successfully.' });
  } catch (err) {
    console.error('booking.verifyOtp error:', err);
    return res.status(500).json({ message: 'Failed to verify OTP.' });
  }
});

const portalAuth = (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Portal token required.' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.type !== 'customer_portal' || !decoded.phone) {
      return res.status(401).json({ message: 'Invalid portal token.' });
    }
    req.portalPhone = decoded.phone;
    return next();
  } catch (_err) {
    return res.status(401).json({ message: 'Invalid or expired portal token.' });
  }
};

router.post('/customer-portal/request-otp', async (req, res) => {
  try {
    const { phone } = req.body || {};
    const normalized = normalizePhoneDigits(phone);
    if (!normalized) return res.status(400).json({ message: 'Phone is required.' });

    const variants = buildPhoneVariants(normalized);
    const [apptCount, customerCount] = await Promise.all([
      Appointment.count({ where: { phone: { [Op.or]: variants } } }),
      Customer.count({ where: { phone: { [Op.or]: variants } } }),
    ]);
    if (!apptCount && !customerCount) {
      return res.status(404).json({ message: 'No account found for this phone number. Please register first.' });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(normalized, { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });

    const sms = `HEXAONE OTP: ${code}. Valid for 5 minutes.`;
    await sendSMS({ to: normalized, message: sms, meta: { event_type: 'portal_otp' } });

    const response = { message: 'OTP sent successfully.' };
    if (process.env.NODE_ENV !== 'production') response.debug_otp = code;
    return res.json(response);
  } catch (err) {
    console.error('portal.requestOtp error:', err);
    return res.status(500).json({ message: 'Failed to send OTP.' });
  }
});

// ── POST /api/public/customer-portal/register — new customer self-registration ─
router.post('/customer-portal/register', async (req, res) => {
  try {
    const { name, phone, email } = req.body || {};
    const normalized = normalizePhoneDigits(phone);
    if (!normalized || !String(name || '').trim()) {
      return res.status(400).json({ message: 'Name and phone number are required.' });
    }

    const variants = buildPhoneVariants(normalized);
    let customer = await Customer.findOne({ where: { phone: { [Op.or]: variants } } });

    if (!customer) {
      customer = await Customer.create({
        name: String(name).trim(),
        phone: normalized,
        email: email ? String(email).trim() : null,
      });
    } else {
      const updates = {};
      if (!String(customer.name || '').trim() && name) updates.name = String(name).trim();
      if (!String(customer.email || '').trim() && email) updates.email = String(email).trim();
      if (Object.keys(updates).length) await customer.update(updates);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(normalized, { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });

    await sendSMS({ to: normalized, message: `Your verification code is: ${code}. Valid for 5 minutes.`, meta: { event_type: 'portal_register_otp' } });

    const response = { message: 'OTP sent to your phone. Please verify to complete registration.' };
    if (process.env.NODE_ENV !== 'production') response.debug_otp = code;
    return res.json(response);
  } catch (err) {
    console.error('portal.register error:', err);
    return res.status(500).json({ message: 'Registration failed. Please try again.' });
  }
});

router.post('/customer-portal/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body || {};
    const normalized = normalizePhoneDigits(phone);
    if (!normalized || !otp) return res.status(400).json({ message: 'Phone and OTP are required.' });

    const row = otpStore.get(normalized);
    if (!row || Date.now() > row.expiresAt) {
      otpStore.delete(normalized);
      return res.status(400).json({ message: 'OTP expired. Please request a new code.' });
    }
    if (row.attempts >= 5) {
      otpStore.delete(normalized);
      return res.status(429).json({ message: 'Too many invalid attempts. Request a new OTP.' });
    }
    if (String(otp) !== String(row.code)) {
      row.attempts += 1;
      otpStore.set(normalized, row);
      return res.status(401).json({ message: 'Invalid OTP.' });
    }
    otpStore.delete(normalized);

    const token = jwt.sign(
      { type: 'customer_portal', phone: normalized },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    return res.json({ token });
  } catch (err) {
    console.error('portal.verifyOtp error:', err);
    return res.status(500).json({ message: 'Failed to verify OTP.' });
  }
});

router.get('/customer-portal/me', portalAuth, async (req, res) => {
  try {
    const variants = buildPhoneVariants(req.portalPhone);
    const [appointments, customers] = await Promise.all([
      Appointment.findAll({
        where: { phone: { [Op.or]: variants } },
        attributes: ['customer_name'],
        order: [['createdAt', 'DESC']],
        limit: 1,
      }),
      Customer.findAll({
        where: { phone: { [Op.or]: variants } },
        attributes: ['id', 'name', 'phone', 'loyalty_points'],
      }),
    ]);
    const latestAppt = appointments[0];
    const totalPoints = customers.reduce((sum, c) => sum + Number(c.loyalty_points || 0), 0);
    return res.json({
      name: latestAppt?.customer_name || customers[0]?.name || 'Customer',
      phone: req.portalPhone,
      loyalty_points: totalPoints,
    });
  } catch (err) {
    console.error('portal.me error:', err);
    return res.status(500).json({ message: 'Failed to load customer profile.' });
  }
});

router.get('/customer-portal/bookings', portalAuth, async (req, res) => {
  try {
    const variants = buildPhoneVariants(req.portalPhone);
    const bookings = await Appointment.findAll({
      where: { phone: { [Op.or]: variants } },
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'color'] },
        { model: Service, as: 'service', attributes: ['id', 'name', 'price', 'duration_minutes'] },
        { model: Staff, as: 'staff', attributes: ['id', 'name'] },
      ],
      order: [['date', 'DESC'], ['time', 'DESC']],
      limit: 100,
    });
    return res.json(bookings);
  } catch (err) {
    console.error('portal.bookings error:', err);
    return res.status(500).json({ message: 'Failed to load bookings.' });
  }
});

router.post('/customer-portal/rebook', portalAuth, async (req, res) => {
  try {
    const { appointmentId, date, time } = req.body || {};
    if (!appointmentId || !date || !time) {
      return res.status(400).json({ message: 'appointmentId, date and time are required.' });
    }
    const variants = buildPhoneVariants(req.portalPhone);
    const source = await Appointment.findOne({
      where: { id: appointmentId, phone: { [Op.or]: variants } },
      include: [{ model: Service, as: 'service', attributes: ['duration_minutes'] }],
    });
    if (!source) return res.status(404).json({ message: 'Booking not found.' });

    const startMin = toMinutes(time);
    if (!Number.isFinite(startMin)) {
      return res.status(400).json({ message: 'Invalid time format.' });
    }
    const durationMinutes = source.service?.duration_minutes || 30;
    const endMin = startMin + durationMinutes;
    if (endMin > 18 * 60 + 30) {
      return res.status(400).json({ message: 'Selected time exceeds salon working hours.' });
    }

    if (source.staff_id) {
      const existingAppointments = await Appointment.findAll({
        where: buildBookingConflictWhere({
          staffId: source.staff_id,
          date,
          branchId: source.branch_id,
        }),
        attributes: ['time'],
        include: [{ model: Service, as: 'service', attributes: ['duration_minutes'] }],
      });

      const hasOverlap = existingAppointments.some((a) => {
        const s = toMinutes(a.time);
        const d = a.service?.duration_minutes || 30;
        const e = s + d;
        return startMin < e && endMin > s;
      });

      if (hasOverlap) {
        return res.status(409).json({ message: 'Selected time is not available for this booking.' });
      }
    }

    const created = await Appointment.create({
      branch_id: source.branch_id,
      service_id: source.service_id,
      staff_id: source.staff_id,
      customer_name: source.customer_name,
      phone: source.phone,
      date,
      time,
      amount: source.amount,
      status: 'pending',
      notes: source.notes,
    });
    return res.status(201).json({ message: 'Rebooking submitted.', booking: created });
  } catch (err) {
    console.error('portal.rebook error:', err);
    return res.status(500).json({ message: 'Failed to rebook appointment.' });
  }
});

router.get('/customer-portal/packages', portalAuth, async (req, res) => {
  try {
    const variants = buildPhoneVariants(req.portalPhone);
    const latestAppt = await Appointment.findOne({
      where: { phone: { [Op.or]: variants } },
      attributes: ['branch_id'],
      order: [['createdAt', 'DESC']],
    });
    const preferredBranch = latestAppt?.branch_id || null;
    const where = {
      is_active: true,
      type: req.query.type === 'membership' ? 'membership' : 'bundle',
      [Op.or]: [{ branch_id: null }],
    };
    if (preferredBranch) where[Op.or].push({ branch_id: preferredBranch });

    const rows = await Package.findAll({
      where,
      order: [['package_price', 'ASC']],
    });
    return res.json(rows);
  } catch (err) {
    console.error('portal.packages error:', err);
    return res.status(500).json({ message: 'Failed to load packages.' });
  }
});

router.post('/customer-portal/purchase', portalAuth, async (req, res) => {
  const t = await Appointment.sequelize.transaction();
  try {
    const { packageId, paymentMethod } = req.body || {};
    if (!packageId) {
      await t.rollback();
      return res.status(400).json({ message: 'packageId is required.' });
    }

    const variants = buildPhoneVariants(req.portalPhone);
    let customer = await Customer.findOne({
      where: { phone: { [Op.or]: variants } },
      transaction: t,
    });
    const latestAppt = await Appointment.findOne({
      where: { phone: { [Op.or]: variants } },
      attributes: ['customer_name', 'branch_id', 'phone'],
      order: [['createdAt', 'DESC']],
      transaction: t,
    });

    if (!customer && !latestAppt) {
      await t.rollback();
      return res.status(404).json({ message: 'Customer profile not found for this phone.' });
    }

    if (!customer) {
      customer = await Customer.create({
        name: latestAppt.customer_name || 'Portal Customer',
        phone: latestAppt.phone || req.portalPhone,
        branch_id: latestAppt.branch_id || null,
      }, { transaction: t });
    }

    const pkg = await Package.findByPk(packageId, { transaction: t });
    if (!pkg || !pkg.is_active) {
      await t.rollback();
      return res.status(404).json({ message: 'Package not found or inactive.' });
    }

    const effectiveBranchId = pkg.branch_id || customer.branch_id || latestAppt?.branch_id || null;
    if (!effectiveBranchId) {
      await t.rollback();
      return res.status(400).json({ message: 'Could not determine branch for purchase.' });
    }

    if (pkg.type === 'membership') {
      const today = new Date().toISOString().slice(0, 10);
      const existingActive = await CustomerPackage.findOne({
        where: {
          customer_id: customer.id,
          package_id: pkg.id,
          status: 'active',
          expiry_date: { [Op.gte]: today },
        },
        transaction: t,
      });
      if (existingActive) {
        await t.rollback();
        return res.status(409).json({ message: 'This membership is already active.' });
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + Number(pkg.validity_days || 0));
    const cp = await CustomerPackage.create({
      customer_id: customer.id,
      package_id: pkg.id,
      branch_id: effectiveBranchId,
      purchase_date: today,
      expiry_date: expiryDate.toISOString().slice(0, 10),
      sessions_total: pkg.sessions_count ?? null,
      sessions_used: 0,
      status: 'active',
      amount_paid: pkg.package_price,
      payment_method: paymentMethod || 'Cash',
      notes: 'Purchased from customer portal',
    }, { transaction: t });

    const payment = await Payment.create({
      branch_id: effectiveBranchId,
      customer_id: customer.id,
      service_id: null,
      appointment_id: null,
      customer_name: customer.name,
      total_amount: pkg.package_price,
      loyalty_discount: 0,
      points_earned: 0,
      commission_amount: 0,
      date: today,
      status: 'paid',
    }, { transaction: t });

    await PaymentSplit.create({
      payment_id: payment.id,
      method: paymentMethod || 'Cash',
      amount: pkg.package_price,
      customer_package_id: cp.id,
    }, { transaction: t });

    await t.commit();
    return res.status(201).json({ message: `${pkg.type === 'membership' ? 'Membership' : 'Package'} purchased successfully.` });
  } catch (err) {
    await t.rollback();
    console.error('portal.purchase error:', err);
    return res.status(500).json({ message: 'Failed to complete purchase.' });
  }
});

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Normalize public booking payload into discrete appointment items.
 * Supports:
 *  - items: [{ service_id, staff_id, date, time }, ...]  (preferred — own staff/time each)
 *  - legacy: one staff_id/date/time + service_id or service_ids (back-to-back on same staff)
 */
function normalizePublicBookingItems(body = {}) {
  const bookingName = String(body.customer_name || '').trim();
  const bookingPhone = String(body.phone || '').trim();
  const bookingEmail = body.email ? String(body.email).trim() : null;
  const notes = body.notes ? String(body.notes).trim() : null;

  if (Array.isArray(body.items) && body.items.length > 0) {
    const items = body.items.map((raw, idx) => {
      const service_id = Number(raw?.service_id ?? raw?.serviceId);
      const staff_id = Number(raw?.staff_id ?? raw?.staffId);
      const date = String(raw?.date || '').trim();
      const time = String(raw?.time || '').trim();
      if (!Number.isInteger(service_id) || service_id <= 0) {
        throw Object.assign(new Error(`items[${idx}].service_id is required`), { status: 400 });
      }
      if (!Number.isInteger(staff_id) || staff_id <= 0) {
        throw Object.assign(new Error(`items[${idx}].staff_id is required`), { status: 400 });
      }
      if (!date || !time) {
        throw Object.assign(new Error(`items[${idx}] needs date and time`), { status: 400 });
      }
      return { service_id, staff_id, date, time };
    });
    return { items, bookingName, bookingPhone, bookingEmail, notes };
  }

  const staffIdNum = Number(body.staff_id);
  const date = String(body.date || '').trim();
  const time = String(body.time || '').trim();
  if (!Number.isInteger(staffIdNum) || staffIdNum <= 0 || !date || !time) {
    throw Object.assign(new Error('Missing required fields'), { status: 400 });
  }

  const rawServiceIds = Array.isArray(body.service_ids) && body.service_ids.length > 0
    ? body.service_ids
    : (body.service_id ? [body.service_id] : []);
  const selectedServiceIds = rawServiceIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (selectedServiceIds.length === 0 || selectedServiceIds.length !== rawServiceIds.length) {
    throw Object.assign(new Error('At least one service is required'), { status: 400 });
  }

  // Legacy: consecutive slots on the same staff/date starting at `time`.
  // Durations are filled in after services are loaded.
  return {
    items: selectedServiceIds.map((service_id) => ({
      service_id,
      staff_id: staffIdNum,
      date,
      time,
      _legacyChain: true,
    })),
    bookingName,
    bookingPhone,
    bookingEmail,
    notes,
    legacyStartTime: time,
  };
}

async function loadExistingRanges({ staffId, date, branchId, transaction = null }) {
  const rows = await Appointment.findAll({
    where: buildBookingConflictWhere({ staffId, date, branchId }),
    attributes: ['time'],
    include: [{ model: Service, as: 'service', attributes: ['duration_minutes'] }],
    ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}),
  });
  return rows.map((a) => {
    const start = toMinutes(a.time);
    const duration = (a.service && a.service.duration_minutes) ? a.service.duration_minutes : 30;
    return [start, start + duration];
  });
}

// ── POST /api/public/bookings — create one or many appointments (pending) ────
router.post('/bookings', async (req, res) => {
  try {
    const {
      branch_id, customer_name, phone, email, notes,
      tenantId, tenant_id,
    } = req.body;

    if (!customer_name || !phone) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    let normalized;
    try {
      normalized = normalizePublicBookingItems(req.body);
    } catch (normErr) {
      return res.status(normErr.status || 400).json({ message: normErr.message || 'Invalid booking payload' });
    }

    const { items, bookingName, bookingPhone, bookingEmail, notes: bookingNotes, legacyStartTime } = normalized;

    const rawTenantId = tenantId ?? tenant_id ?? req.query.tenantId ?? req.tenant?.id;
    const bookingTenantId = rawTenantId != null && rawTenantId !== ''
      ? parseInt(rawTenantId, 10)
      : null;
    if (!Number.isInteger(bookingTenantId) || bookingTenantId <= 0) {
      return res.status(400).json({ message: 'tenantId is required' });
    }

    const effectiveBranchId = await resolveWebBookingBranchId(branch_id, bookingTenantId);
    if (!effectiveBranchId) {
      return res.status(400).json({ message: 'No active booking branch is configured for this salon.' });
    }

    const serviceIds = [...new Set(items.map((i) => i.service_id))];
    const staffIds = [...new Set(items.map((i) => i.staff_id))];

    const [services, staffRows] = await Promise.all([
      Service.findAll({
        where: { id: serviceIds, is_active: true, available_online: true, tenant_id: bookingTenantId },
        attributes: ['id', 'name', 'price', 'duration_minutes'],
      }),
      Staff.findAll({
        where: { id: staffIds, tenant_id: bookingTenantId, is_active: true },
        attributes: ['id', 'name'],
      }),
    ]);

    if (services.length !== serviceIds.length) {
      return res.status(404).json({ message: 'One or more selected services were not found' });
    }
    if (staffRows.length !== staffIds.length) {
      return res.status(404).json({ message: 'One or more selected staff were not found for this salon' });
    }

    const serviceMap = new Map(services.map((s) => [s.id, s]));
    const staffMap = new Map(staffRows.map((s) => [s.id, s]));

    // Build concrete time ranges per item.
    let legacyCursor = legacyStartTime ? toMinutes(legacyStartTime) : null;
    const requested = [];
    for (const item of items) {
      const service = serviceMap.get(item.service_id);
      const duration = service.duration_minutes || 30;
      let start;
      if (item._legacyChain && legacyCursor != null) {
        start = legacyCursor;
        legacyCursor += duration;
      } else {
        start = toMinutes(item.time);
      }
      const end = start + duration;
      if (end > 18 * 60 + 30) {
        return res.status(400).json({ message: 'Selected services exceed salon working hours' });
      }
      requested.push({
        service,
        staff_id: item.staff_id,
        staff: staffMap.get(item.staff_id),
        date: item.date,
        start,
        end,
        time: toHHMM(start),
      });
    }

    // Conflict within the same request (same staff + same date overlapping).
    for (let i = 0; i < requested.length; i += 1) {
      for (let j = i + 1; j < requested.length; j += 1) {
        const a = requested[i];
        const b = requested[j];
        if (a.staff_id === b.staff_id && a.date === b.date && rangesOverlap(a.start, a.end, b.start, b.end)) {
          return res.status(409).json({
            message: `${a.staff?.name || 'Staff'} is already selected for overlapping times on ${a.date}.`,
          });
        }
      }
    }

    // Conflict against existing appointments (group by staff+date).
    const groups = new Map();
    for (const r of requested) {
      const key = `${r.staff_id}|${r.date}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    for (const [key, group] of groups.entries()) {
      const [staffIdStr, date] = key.split('|');
      const existing = await loadExistingRanges({
        staffId: Number(staffIdStr),
        date,
        branchId: effectiveBranchId,
      });
      const clash = group.some(({ start, end }) =>
        existing.some(([bStart, bEnd]) => rangesOverlap(start, end, bStart, bEnd)));
      if (clash) {
        return res.status(409).json({ message: 'Selected time is not available for all chosen services' });
      }
    }

    const tx = await Appointment.sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE,
    });
    try {
      for (const [key, group] of groups.entries()) {
        const [staffIdStr, date] = key.split('|');
        const existingTx = await loadExistingRanges({
          staffId: Number(staffIdStr),
          date,
          branchId: effectiveBranchId,
          transaction: tx,
        });
        const clashTx = group.some(({ start, end }) =>
          existingTx.some(([bStart, bEnd]) => rangesOverlap(start, end, bStart, bEnd)));
        if (clashTx) {
          await tx.rollback();
          return res.status(409).json({ message: 'Selected time is no longer available. Please choose another slot.' });
        }
      }

      const phoneVariants = buildPhoneVariants(bookingPhone);
      let linkedCustomer = null;
      if (phoneVariants.length) {
        linkedCustomer = await Customer.findOne({
          where: {
            phone: { [Op.or]: phoneVariants },
            tenant_id: bookingTenantId,
          },
          transaction: tx,
          lock: tx.LOCK.UPDATE,
        });
      }
      if (!linkedCustomer) {
        if (!isBookingPhoneVerified(bookingPhone)) {
          await tx.rollback();
          return res.status(400).json({
            message: 'Please verify your phone number with the OTP sent to you.',
          });
        }
        try {
          linkedCustomer = await Customer.create({
            name: bookingName,
            phone: bookingPhone,
            email: bookingEmail || null,
            branch_id: effectiveBranchId || null,
            tenant_id: bookingTenantId,
          }, { transaction: tx });
        } catch (createErr) {
          if (createErr?.name === 'SequelizeUniqueConstraintError' && phoneVariants.length) {
            linkedCustomer = await Customer.findOne({
              where: {
                phone: { [Op.or]: phoneVariants },
                tenant_id: bookingTenantId,
              },
              transaction: tx,
              lock: tx.LOCK.UPDATE,
            });
          }
          if (!linkedCustomer) throw createErr;
        }
      } else {
        const updates = {};
        if (!String(linkedCustomer.name || '').trim() && bookingName) updates.name = bookingName;
        if (!String(linkedCustomer.email || '').trim() && bookingEmail) updates.email = bookingEmail;
        if (!linkedCustomer.branch_id && effectiveBranchId) updates.branch_id = effectiveBranchId;
        if (!linkedCustomer.tenant_id) updates.tenant_id = bookingTenantId;
        if (Object.keys(updates).length) await linkedCustomer.update(updates, { transaction: tx });
      }

      const created = [];
      for (const r of requested) {
        const appointment = await Appointment.create({
          tenant_id: bookingTenantId,
          branch_id: effectiveBranchId,
          customer_id: linkedCustomer?.id || null,
          service_id: r.service.id,
          staff_id: r.staff_id,
          customer_name: bookingName,
          phone: bookingPhone,
          date: r.date,
          time: r.time,
          amount: parseFloat(r.service.price) || 0,
          status: 'pending',
          notes: bookingNotes || null,
        }, { transaction: tx });
        created.push(appointment);
      }
      await tx.commit();

      res.status(201).json({
        message: 'Booking created successfully',
        ids: created.map((a) => a.id),
        count: created.length,
      });

      setImmediate(async () => {
        try {
          const branch = await Branch.findByPk(effectiveBranchId, { attributes: ['id', 'name'] });
          const salonName = await resolveTenantSmsName(bookingTenantId);
          const lines = requested.map((r) =>
            `${r.date} ${r.time} · ${r.service.name} · ${r.staff?.name || 'Staff'}`);
          const totalAmount = requested.reduce((sum, r) => sum + (parseFloat(r.service.price) || 0), 0);
          const summaryMsg =
            `${salonName} - Booking Received\n` +
            `Hi ${bookingName}, your booking is pending confirmation.\n` +
            `${lines.join('\n')}\n` +
            `Branch: ${branch?.name || salonName}\n` +
            `Total: Rs. ${totalAmount.toFixed(2)}`;

          await sendSMS({
            to: bookingPhone,
            message: summaryMsg,
            tenantId: bookingTenantId,
            meta: {
              customer_name: bookingName,
              event_type: 'appointment_confirmed',
              branch_id: effectiveBranchId || null,
              tenant_id: bookingTenantId,
            },
          });
        } catch (smsErr) {
          console.error('Public booking SMS error:', smsErr.message || smsErr);
        }
      });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (err) {
    console.error('Public booking error:', err);
    if (err?.name === 'SequelizeValidationError') {
      const detail = err.errors?.[0]?.message || 'Invalid booking data';
      return res.status(400).json({ message: detail });
    }
    if (err?.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'A customer with this phone already exists. Please try again.' });
    }
    if (/deadlock|could not serialize/i.test(String(err?.message || ''))) {
      return res.status(409).json({ message: 'Booking conflict — please try again in a moment.' });
    }
    return res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/public/plans – active plan configs for the billing/onboarding pages ──
router.get('/plans', async (_req, res) => {
  try {
    const { PlanConfig } = require('../models');
    await PlanConfig.sync();
    let plans = await PlanConfig.findAll({
      where: { is_active: true },
      order: [['sort_order', 'ASC'], ['id', 'ASC']],
    });
    if (plans.length === 0) {
      const defaults = [
        { key: 'trial',      label: 'Free Trial',  price_display: 'Free',        price_period: '',         tagline: '14-day free trial for new salons',    max_branches: 1,  max_staff: 5,  max_services: 20,  features: ['1 branch', '5 staff members', '20 services', 'Email notifications', 'Basic reports'],                                                                   trial_days: 14, is_popular: false, is_active: true, sort_order: 0 },
        { key: 'basic',      label: 'Basic',        price_display: 'LKR 2,900',   price_period: '/mo',      tagline: 'Perfect for single-location salons',   max_branches: 1,  max_staff: 10, max_services: 50,  features: ['1 branch', '10 staff members', '50 services', 'Email & WhatsApp notifications', 'Basic reports'],                                                    trial_days: 0,  is_popular: false, is_active: true, sort_order: 1 },
        { key: 'pro',        label: 'Pro',          price_display: 'LKR 7,900',   price_period: '/mo',      tagline: 'For growing multi-branch salons',       max_branches: 5,  max_staff: 50, max_services: 200, features: ['5 branches', '50 staff members', '200 services', 'AI Chat assistant', 'Advanced analytics & reports', 'Customer loyalty packages'],               trial_days: 0,  is_popular: true,  is_active: true, sort_order: 2 },
        { key: 'enterprise', label: 'Enterprise',   price_display: 'Custom',      price_period: ' pricing', tagline: 'Tailored for large salon chains',       max_branches: -1, max_staff: -1, max_services: -1,  features: ['Unlimited branches', 'Unlimited staff', 'Unlimited services', 'Custom domain', 'API access', 'Priority support'],                                  trial_days: 0,  is_popular: false, is_active: true, sort_order: 3 },
      ];
      await PlanConfig.bulkCreate(defaults, { ignoreDuplicates: true });
      plans = await PlanConfig.findAll({
        where: { is_active: true },
        order: [['sort_order', 'ASC'], ['id', 'ASC']],
      });
    }
    return res.json(plans);
  } catch (err) {
    console.error('Public plans error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
