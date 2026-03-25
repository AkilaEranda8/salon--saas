const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const Branch = require('../models/Branch');
const Service = require('../models/Service');
const Staff = require('../models/Staff');
const Appointment = require('../models/Appointment');

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
      where.branch_id = parseInt(req.query.branchId, 10);
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
