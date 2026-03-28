const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
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

// ── GET /api/public/branches — active branches only ──────────────────────────
router.get('/branches', async (req, res) => {
  try {
    const branches = await Branch.findAll({
      where: { status: 'active' },
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
    const services = await Service.findAll({
      where: { is_active: true },
      attributes: ['id', 'name', 'category', 'duration_minutes', 'price', 'description'],
      order: [['category', 'ASC'], ['name', 'ASC']],
    });
    res.json(services);
  } catch (err) {
    console.error('Public services error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/public/staff?branchId= — active staff, limited fields ──────────
router.get('/staff', async (req, res) => {
  try {
    const where = { is_active: true };
    if (req.query.branchId) {
      const bid = parseInt(req.query.branchId, 10);
      const branchPart = await staffWhereForBranch(bid);
      Object.assign(where, branchPart);
    }
    const staff = await Staff.findAll({
      where,
      attributes: ['id', 'name', 'role_title'],
      order: [['name', 'ASC']],
    });
    res.json(staff);
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
    const { staffId, date, duration } = req.query;
    if (!staffId || !date) {
      return res.status(400).json({ message: 'staffId and date are required' });
    }

    const newDuration = Math.max(30, parseInt(duration, 10) || 30);

    // Fetch existing appointments with their service duration
    const appointments = await Appointment.findAll({
      where: {
        staff_id: parseInt(staffId, 10),
        date,
        status: { [Op.in]: ['pending', 'confirmed'] },
      },
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
const otpStore = new Map(); // key: normalized phone, value: { code, expiresAt, attempts }
const OTP_TTL_MS = 5 * 60 * 1000;

const normalizePhoneDigits = (phone = '') => String(phone).replace(/\D/g, '');
const buildPhoneVariants = (phone = '') => {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return [];
  const set = new Set([digits]);
  if (digits.startsWith('0')) set.add(`94${digits.slice(1)}`);
  if (digits.startsWith('94')) set.add(`0${digits.slice(2)}`);
  return Array.from(set);
};

const portalAuth = (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Portal token required.' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
    const existing = await Appointment.count({
      where: { phone: { [Op.or]: variants } },
    });
    if (!existing) {
      return res.status(404).json({ message: 'No bookings found for this phone number.' });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(normalized, { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });

    const sms = `Zane Salon OTP: ${code}. Valid for 5 minutes.`;
    await sendSMS({ to: normalized, message: sms, meta: { event_type: 'portal_otp' } });

    const response = { message: 'OTP sent successfully.' };
    if (process.env.NODE_ENV !== 'production') response.debug_otp = code;
    return res.json(response);
  } catch (err) {
    console.error('portal.requestOtp error:', err);
    return res.status(500).json({ message: 'Failed to send OTP.' });
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
    });
    if (!source) return res.status(404).json({ message: 'Booking not found.' });

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

// ── POST /api/public/bookings — create one or many appointments (pending) ────
router.post('/bookings', async (req, res) => {
  try {
    const {
      branch_id, service_id, service_ids, staff_id, customer_name, phone, email, date, time, notes,
    } = req.body;

    if (!branch_id || !staff_id || !customer_name || !phone || !date || !time) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const selectedServiceIds = Array.isArray(service_ids) && service_ids.length > 0
      ? service_ids
      : (service_id ? [service_id] : []);

    if (selectedServiceIds.length === 0) {
      return res.status(400).json({ message: 'At least one service is required' });
    }

    const services = await Service.findAll({
      where: { id: selectedServiceIds, is_active: true },
      attributes: ['id', 'price', 'duration_minutes'],
    });
    if (services.length !== selectedServiceIds.length) {
      return res.status(404).json({ message: 'One or more selected services were not found' });
    }

    const serviceMap = new Map(services.map((s) => [s.id, s]));
    const orderedServices = selectedServiceIds.map((id) => serviceMap.get(id));

    const startMin = toMinutes(time);
    let cursor = startMin;
    const requestedRanges = orderedServices.map((s) => {
      const duration = s.duration_minutes || 30;
      const range = { start: cursor, end: cursor + duration, service: s };
      cursor += duration;
      return range;
    });

    if (requestedRanges[requestedRanges.length - 1].end > 18 * 60 + 30) {
      return res.status(400).json({ message: 'Selected services exceed salon working hours' });
    }

    const existingAppointments = await Appointment.findAll({
      where: {
        staff_id,
        date,
        status: { [Op.in]: ['pending', 'confirmed'] },
      },
      attributes: ['time'],
      include: [{ model: Service, as: 'service', attributes: ['duration_minutes'] }],
    });

    const existingRanges = existingAppointments.map((a) => {
      const s = toMinutes(a.time);
      const d = (a.service && a.service.duration_minutes) ? a.service.duration_minutes : 30;
      return [s, s + d];
    });

    const hasOverlap = requestedRanges.some(({ start, end }) =>
      existingRanges.some(([bStart, bEnd]) => start < bEnd && end > bStart));
    if (hasOverlap) {
      return res.status(409).json({ message: 'Selected time is not available for all chosen services' });
    }

    const tx = await Appointment.sequelize.transaction();
    try {
      const created = [];
      for (const r of requestedRanges) {
        const appointment = await Appointment.create({
          branch_id,
          service_id: r.service.id,
          staff_id,
          customer_name: customer_name.trim(),
          phone: phone.trim(),
          date,
          time: toHHMM(r.start),
          amount: r.service.price,
          status: 'pending',
          notes: notes ? notes.trim() : null,
        }, { transaction: tx });
        created.push(appointment);
      }
      await tx.commit();

      res.status(201).json({
        message: 'Booking created successfully',
        ids: created.map((a) => a.id),
        count: created.length,
      });

      // Send SMS in background so web booking response is immediate.
      setImmediate(async () => {
        try {
          const branch = await Branch.findByPk(branch_id, { attributes: ['id', 'name'] });
          const firstTime = created[0] ? created[0].time : time;
          const endTime = toHHMM(requestedRanges[requestedRanges.length - 1].end);
          const totalAmount = orderedServices.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);
          const summaryMsg =
            `Zane Salon - Booking Received\n` +
            `Hi ${customer_name.trim()}, your booking is pending confirmation.\n` +
            `Date: ${date} ${firstTime}-${endTime}\n` +
            `Services: ${orderedServices.length} item(s)\n` +
            `Branch: ${branch?.name || 'Zane Salon'}\n` +
            `Total: Rs. ${totalAmount.toFixed(2)}`;

          await sendSMS({
            to: phone.trim(),
            message: summaryMsg,
            meta: {
              customer_name: customer_name.trim(),
              event_type: 'appointment_confirmed',
              branch_id: branch_id || null,
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
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
