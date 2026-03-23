const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { WalkIn, Service, Staff } = require('../models');
const { emitQueueUpdate } = require('../socket');

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
    const { customerName, phone, branchId, serviceId, serviceIds, note } = req.body;

    // Accept either serviceIds (array) or legacy serviceId (single)
    const ids = Array.isArray(serviceIds) && serviceIds.length > 0
      ? serviceIds.map(Number).filter(Boolean)
      : serviceId ? [Number(serviceId)] : [];

    if (!customerName || !branchId || ids.length === 0) {
      return res.status(400).json({ message: 'customerName, branchId, and at least one serviceId are required.' });
    }

    const primaryServiceId = ids[0];
    const dateStr = today();

    const result = await sequelize.transaction(async (t) => {
      const token = await generateToken(branchId, dateStr, t);

      // Load all selected services to get total duration
      const services = await Service.findAll({
        where: { id: ids },
        transaction: t,
      });
      if (services.length === 0) throw Object.assign(new Error('Service not found.'), { status: 404 });

      const totalDuration = services.reduce((sum, s) => sum + (s.duration_minutes || 30), 0);

      const waitingCount = await WalkIn.count({
        where: { branch_id: branchId, check_in_date: dateStr, status: 'waiting' },
        transaction: t,
      });
      const estimatedWait = waitingCount * totalDuration;

      // Build extra_services note suffix if multiple services selected
      const extraNote = ids.length > 1
        ? `[services:${ids.join(',')}]`
        : '';
      const fullNote = [extraNote, note].filter(Boolean).join(' ');

      const entry = await WalkIn.create({
        token,
        customer_name: customerName,
        phone: phone || null,
        branch_id: branchId,
        service_id: primaryServiceId,
        staff_id: null,
        status: 'waiting',
        check_in_time: new Date().toTimeString().slice(0, 8),
        check_in_date: dateStr,
        estimated_wait: estimatedWait,
        note: fullNote || null,
      }, { transaction: t });

      return WalkIn.findByPk(entry.id, { include: defaultInclude, transaction: t });
    });

    // Attach all service details to response
    const allServices = await Service.findAll({ where: { id: ids }, attributes: ['id', 'name', 'duration_minutes', 'price'] });
    const full = result.toJSON ? result.toJSON() : result;
    full.services = allServices;

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
