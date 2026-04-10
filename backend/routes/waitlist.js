'use strict';
const { Router } = require('express');
const { Op } = require('sequelize');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');

const getBranchWhere = (req) => {
  const where = tenantWhere(req);
  if (req.userBranchId) where.branch_id = req.userBranchId;
  else if (req.query.branchId) where.branch_id = parseInt(req.query.branchId, 10);
  return where;
};

const router = Router();
router.use(verifyToken, branchAccess);

// GET /api/waitlist
router.get('/', async (req, res) => {
  try {
    const { Waitlist, Service, Staff } = require('../models');
    const where = getBranchWhere(req);
    if (req.query.status) where.status = req.query.status;

    const rows = await Waitlist.findAll({
      where,
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name', 'duration_minutes', 'price'], required: false },
        { model: Staff,   as: 'staff',   attributes: ['id', 'name', 'role_title'],               required: false },
      ],
      order: [['createdAt', 'ASC']],
    });
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/waitlist
router.post('/', async (req, res) => {
  try {
    const { Waitlist } = require('../models');
    const { customer_name, phone, service_id, staff_id, preferred_date, preferred_time, notes, branch_id, customer_id } = req.body;
    if (!customer_name?.trim()) return res.status(400).json({ message: 'customer_name is required.' });

    const effectiveBranchId = req.userBranchId || branch_id;
    if (!effectiveBranchId) return res.status(400).json({ message: 'branch_id is required.' });

    const entry = await Waitlist.create({
      tenant_id: resolveTenantId(req),
      branch_id: effectiveBranchId,
      customer_id: customer_id || null,
      customer_name: customer_name.trim(),
      phone: phone?.trim() || null,
      service_id: service_id || null,
      staff_id: staff_id || null,
      preferred_date: preferred_date || null,
      preferred_time: preferred_time || null,
      notes: notes?.trim() || null,
      status: 'waiting',
    });
    return res.status(201).json(entry);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/waitlist/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { Waitlist } = require('../models');
    const entry = await Waitlist.findOne({ where: byIdWhere(req, req.params.id) });
    if (!entry) return res.status(404).json({ message: 'Waitlist entry not found.' });

    const { status } = req.body;
    const valid = ['waiting', 'notified', 'booked', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ message: 'Invalid status.' });

    entry.status = status;
    if (status === 'notified') entry.notified_at = new Date();
    await entry.save();
    return res.json(entry);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/waitlist/:id
router.delete('/:id', requireRole('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { Waitlist } = require('../models');
    const entry = await Waitlist.findOne({ where: byIdWhere(req, req.params.id) });
    if (!entry) return res.status(404).json({ message: 'Not found.' });
    await entry.destroy();
    return res.json({ message: 'Deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/waitlist/notify-available — called internally when appointment is cancelled
// Finds waiting entries matching the cancelled slot's branch/service and marks them notified
router.post('/notify-available', requireRole('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { Waitlist } = require('../models');
    const { branch_id, service_id, date, time } = req.body;
    if (!branch_id) return res.status(400).json({ message: 'branch_id required.' });

    const where = { status: 'waiting', branch_id: Number(branch_id) };
    const tenantId = resolveTenantId(req);
    if (tenantId) where.tenant_id = tenantId;
    if (service_id) where.service_id = Number(service_id);
    if (date) where.preferred_date = { [Op.or]: [date, null] };

    const waiting = await Waitlist.findAll({ where, order: [['createdAt', 'ASC']], limit: 5 });

    for (const w of waiting) {
      w.status = 'notified';
      w.notified_at = new Date();
      await w.save();
    }
    return res.json({ notified: waiting.length, entries: waiting });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
