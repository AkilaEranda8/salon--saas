const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { WalkIn, Service, Staff, Branch } = require('../models');
const { emitQueueUpdate } = require('../socket');
const { sendSMS } = require('../services/notificationService');

// Helper: today as YYYY-MM-DD
const today = () => new Date().toISOString().slice(0, 10);

// Helper: generate next token for a branch+date atomically inside a transaction
async function generateToken(branchId, date, transaction) {
  const count = await WalkIn.count({
    where: { branch_id: branchId, check_in_date: date },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const num = count + 1;
  return 'T' + String(num).padStart(3, '0');
}

// Include options reused across queries
const defaultInclude = [
  { model: Service, as: 'service', attributes: ['id', 'name', 'duration_minutes', 'price'] },
  { model: Staff, as: 'staff', attributes: ['id', 'name'] },
];

// ── GET /api/walkin ───────────────────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const { branchId, date, status } = req.query;    if (!branchId) return res.status(400).json({ message: 'branchId is required.' });    const where = {
      branch_id: branchId,
      check_in_date: date || today(),
    };
    if (status) where.status = status;

    const queue = await WalkIn.findAll({
      where,
      include: defaultInclude,
      order: [['createdAt', 'ASC']],
    });

    res.json(queue);
  } catch (err) {
    console.error('walkin.list error:', err);
    res.status(500).json({ message: 'Failed to fetch walk-in queue.' });
  }
};

// ── GET /api/walkin/stats ─────────────────────────────────────────────────────
exports.stats = async (req, res) => {
  try {
    const { branchId, date } = req.query;    if (!branchId) return res.status(400).json({ message: 'branchId is required.' });    const where = {
      branch_id: branchId,
      check_in_date: date || today(),
    };

    const all = await WalkIn.findAll({ where, attributes: ['status'] });

    const counts = { waiting: 0, serving: 0, completed: 0, cancelled: 0, total: all.length };
    all.forEach((r) => { counts[r.status]++; });

    res.json(counts);
  } catch (err) {
    console.error('walkin.stats error:', err);
    res.status(500).json({ message: 'Failed to fetch walk-in stats.' });
  }
};

// ── POST /api/walkin/checkin ──────────────────────────────────────────────────
exports.checkin = async (req, res) => {
  try {
    const { customerName, phone, branchId, serviceId, note } = req.body;

    if (!customerName || !branchId || !serviceId) {
      return res.status(400).json({ message: 'customerName, branchId, and serviceId are required.' });
    }

    const dateStr = today();

    const result = await sequelize.transaction(async (t) => {
      const token = await generateToken(branchId, dateStr, t);

      // Calculate estimated wait
      const service = await Service.findByPk(serviceId, { transaction: t });
      if (!service) throw Object.assign(new Error('Service not found.'), { status: 404 });

      const waitingCount = await WalkIn.count({
        where: { branch_id: branchId, check_in_date: dateStr, status: 'waiting' },
        transaction: t,
      });
      const estimatedWait = waitingCount * (service.duration_minutes || 30);

      const entry = await WalkIn.create({
        token,
        customer_name: customerName,
        phone: phone || null,
        branch_id: branchId,
        service_id: serviceId,
        staff_id: null,
        status: 'waiting',
        check_in_time: new Date().toTimeString().slice(0, 8),
        check_in_date: dateStr,
        estimated_wait: estimatedWait,
        note: note || null,
      }, { transaction: t });

      return WalkIn.findByPk(entry.id, { include: defaultInclude, transaction: t });
    });

    const full = result;

    // Send token SMS to customer (non-blocking)
    const customerPhone = full?.phone || phone || null;
    if (!customerPhone) {
      console.warn('[WalkIn] Token SMS skipped — customer phone not provided.');
    } else if (full?.token) {
      try {
        const [branch, service] = await Promise.all([
          Branch.findByPk(branchId, { attributes: ['name'] }),
          Service.findByPk(full.service_id, { attributes: ['name'] }),
        ]);
        const customerName = full.customer_name || 'Customer';
        const branchName = branch?.name || 'Zane Salon';
        const serviceName = service?.name || 'Service';
        const waitMins = Number(full.estimated_wait || 0);
        const sms =
          `Zane Salon Walk-In Token\n` +
          `Hi ${customerName}, your token is ${full.token}.\n` +
          `Service: ${serviceName}\n` +
          `Branch: ${branchName}\n` +
          (waitMins > 0 ? `Estimated wait: ~${waitMins} min\n` : '') +
          `Please keep this token number.`;
        console.log(`[WalkIn] Sending token SMS → ${customerPhone} (${full.token})`);
        await sendSMS({
          to: customerPhone,
          message: sms,
          meta: {
            customer_name: customerName,
            event_type: 'walkin_token',
            branch_id: Number(branchId) || null,
          },
        });
      } catch (smsErr) {
        console.error('walkin.checkin token sms error:', smsErr.message);
      }
    }

    emitQueueUpdate(branchId, { action: 'checkin', entry: full });
    res.status(201).json(full);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ message: err.message });
    console.error('walkin.checkin error:', err);
    res.status(500).json({ message: 'Failed to check in walk-in customer.' });
  }
};

// ── PATCH /api/walkin/:id/status ──────────────────────────────────────────────
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const valid = ['serving', 'completed', 'cancelled'];
    if (!valid.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${valid.join(', ')}` });
    }

    const entry = await WalkIn.findByPk(id);
    if (!entry) return res.status(404).json({ message: 'Walk-in entry not found.' });

    entry.status = status;
    if (status === 'serving') {
      entry.serve_start_time = new Date().toTimeString().slice(0, 8);
    }
    await entry.save();

    const full = await WalkIn.findByPk(id, { include: defaultInclude });
    emitQueueUpdate(entry.branch_id, { action: 'statusChange', entry: full });
    res.json(full);
  } catch (err) {
    console.error('walkin.updateStatus error:', err);
    res.status(500).json({ message: 'Failed to update walk-in status.' });
  }
};

// ── PATCH /api/walkin/:id/assign ──────────────────────────────────────────────
exports.assign = async (req, res) => {
  try {
    const { id } = req.params;
    const { staffId } = req.body;

    if (!staffId) return res.status(400).json({ message: 'staffId is required.' });

    const entry = await WalkIn.findByPk(id);
    if (!entry) return res.status(404).json({ message: 'Walk-in entry not found.' });

    entry.staff_id = staffId;
    entry.status = 'serving';
    entry.serve_start_time = new Date().toTimeString().slice(0, 8);
    await entry.save();

    const full = await WalkIn.findByPk(id, { include: defaultInclude });
    emitQueueUpdate(entry.branch_id, { action: 'assign', entry: full });
    res.json(full);
  } catch (err) {
    console.error('walkin.assign error:', err);
    res.status(500).json({ message: 'Failed to assign staff.' });
  }
};

// ── PATCH /api/walkin/:id ─────────────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { customerName, phone, serviceId, note } = req.body;

    const entry = await WalkIn.findByPk(id);
    if (!entry) return res.status(404).json({ message: 'Walk-in entry not found.' });
    if (entry.status === 'completed') {
      return res.status(400).json({ message: 'Completed walk-in entries cannot be edited.' });
    }

    if (customerName != null && !String(customerName).trim()) {
      return res.status(400).json({ message: 'customerName cannot be empty.' });
    }

    if (serviceId != null) {
      const service = await Service.findByPk(serviceId);
      if (!service) return res.status(404).json({ message: 'Service not found.' });
      entry.service_id = Number(serviceId);
    }

    if (customerName != null) entry.customer_name = String(customerName).trim();
    if (phone !== undefined) entry.phone = phone || null;
    if (note !== undefined) entry.note = note || null;

    await entry.save();
    const full = await WalkIn.findByPk(id, { include: defaultInclude });
    emitQueueUpdate(entry.branch_id, { action: 'update', entry: full });
    res.json(full);
  } catch (err) {
    console.error('walkin.update error:', err);
    res.status(500).json({ message: 'Failed to update walk-in entry.' });
  }
};

// ── DELETE /api/walkin/:id ────────────────────────────────────────────────────
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;

    const entry = await WalkIn.findByPk(id);
    if (!entry) return res.status(404).json({ message: 'Walk-in entry not found.' });

    const branchId = entry.branch_id;
    await entry.destroy();

    emitQueueUpdate(branchId, { action: 'remove', id: Number(id) });
    res.json({ message: 'Walk-in entry removed.' });
  } catch (err) {
    console.error('walkin.remove error:', err);
    res.status(500).json({ message: 'Failed to remove walk-in entry.' });
  }
};
