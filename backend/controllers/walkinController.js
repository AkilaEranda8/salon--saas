const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { WalkIn, Service, Staff, Branch, WalkInQueueService, Customer } = require('../models');
const { emitQueueUpdate } = require('../socket');
const { notifyBranch, notifyStaffUser } = require('../services/fcmService');
const { notifyWalkInCheckIn, notifyWalkInServing, notifyWalkInCompleted } = require('../services/notificationService');
const { tenantWhere, resolveTenantId } = require('../utils/tenantScope');
const { slToday } = require('../utils/dateUtils');
const { parsePackageIdFromNotes, resolvePackageBundlePrice, notesUsesPackage } = require('../utils/packageNotes');

const { parseQueryBranchId } = require('../utils/branchScope');

function resolveBranchIdFromRequest(req, rawBranchId) {
  const requested = parseQueryBranchId(rawBranchId);
  const userBranchId = req.userBranchId != null ? Number(req.userBranchId) : null;

  if (userBranchId) {
    if (requested && requested !== userBranchId) return { error: 'Access denied for this branch.' };
    return { branchId: userBranchId };
  }

  if (!requested) return { error: 'branchId is required.' };
  return { branchId: requested };
}

// Helper: today as YYYY-MM-DD (Asia/Colombo)
const today = slToday;

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
  { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'], required: false },
  {
    model: WalkInQueueService,
    as: 'queueServices',
    attributes: ['id', 'service_id', 'sort_order', 'line_price'],
    include: [{ model: Service, as: 'service', attributes: ['id', 'name', 'duration_minutes', 'price'] }],
    required: false,
  },
];

// ── GET /api/walkin ───────────────────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const { branchId, date, status } = req.query;
    const branchResolution = resolveBranchIdFromRequest(req, branchId);
    if (branchResolution.error) return res.status(branchResolution.error.includes('Access denied') ? 403 : 400).json({ message: branchResolution.error });

    const where = {
      ...tenantWhere(req),
      branch_id: branchResolution.branchId,
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
    const { branchId, date } = req.query;
    const branchResolution = resolveBranchIdFromRequest(req, branchId);
    if (branchResolution.error) return res.status(branchResolution.error.includes('Access denied') ? 403 : 400).json({ message: branchResolution.error });

    const where = {
      ...tenantWhere(req),
      branch_id: branchResolution.branchId,
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
    const { customerName, phone, branchId, serviceId, serviceIds, customerId, note, customerPackageId } = req.body;
    const branchResolution = resolveBranchIdFromRequest(req, branchId);
    if (branchResolution.error) return res.status(branchResolution.error.includes('Access denied') ? 403 : 400).json({ message: branchResolution.error });
    const effectiveBranchId = branchResolution.branchId;

    if (!customerName || !serviceId) {
      return res.status(400).json({ message: 'customerName, branchId, and serviceId are required.' });
    }

    const dateStr = today();

    const result = await sequelize.transaction(async (t) => {
      const token = await generateToken(effectiveBranchId, dateStr, t);

      const orderedServiceIds = Array.isArray(serviceIds) && serviceIds.length
        ? [...new Set(serviceIds.map(Number).filter(Boolean))]
        : [Number(serviceId)].filter(Boolean);
      if (!orderedServiceIds.length) {
        throw Object.assign(new Error('At least one service is required.'), { status: 400 });
      }

      const primaryServiceId = orderedServiceIds[0];
      const service = await Service.findByPk(primaryServiceId, { transaction: t });
      if (!service) throw Object.assign(new Error('Service not found.'), { status: 404 });

      const svcRows = orderedServiceIds.length > 1
        ? await Service.findAll({
          where: { id: orderedServiceIds },
          attributes: ['id', 'price', 'duration_minutes'],
          transaction: t,
        })
        : [service];
      const durationSum = svcRows.reduce((sum, s) => sum + Number(s.duration_minutes || 30), 0);
      const totalAmount = svcRows.reduce((sum, s) => sum + Number(s.price || 0), 0);
      const usesPackage = !!(customerPackageId || /^\s*package\s*[:\-]?\s*#\d+/im.test(String(note || '')));
      let finalTotal = totalAmount || null;
      if (usesPackage) {
        const pkgId = customerPackageId || parsePackageIdFromNotes(note);
        finalTotal = pkgId ? await resolvePackageBundlePrice(req, pkgId, t) : 0;
      }

      const waitingCount = await WalkIn.count({
        where: { branch_id: effectiveBranchId, check_in_date: dateStr, status: 'waiting' },
        transaction: t,
      });
      const estimatedWait = waitingCount * durationSum;

      const linkedCustomerId = customerId || req.body.customer_id || null;
      let resolvedCustomerId = linkedCustomerId;
      if (!resolvedCustomerId && phone) {
        const phoneQ = String(phone).trim();
        const match = await Customer.findOne({
          where: {
            ...tenantWhere(req),
            phone: { [Op.like]: `%${phoneQ}%` },
          },
          transaction: t,
        });
        if (match) resolvedCustomerId = match.id;
      }

      const entry = await WalkIn.create({
        token,
        customer_name: customerName,
        phone: phone || null,
        customer_id: resolvedCustomerId || null,
        branch_id: effectiveBranchId,
        service_id: primaryServiceId,
        staff_id: null,
        status: 'waiting',
        check_in_time: new Date().toTimeString().slice(0, 8),
        check_in_date: dateStr,
        estimated_wait: estimatedWait,
        total_amount: finalTotal,
        note: note || null,
        tenant_id: resolveTenantId(req),
      }, { transaction: t });

      const priceById = Object.fromEntries(svcRows.map((s) => [Number(s.id), Number(s.price || 0)]));
      await WalkInQueueService.bulkCreate(
        orderedServiceIds.map((sid, idx) => ({
          walk_in_id: entry.id,
          service_id: sid,
          sort_order: idx,
          line_price: priceById[sid] ?? null,
        })),
        { transaction: t },
      );

      return WalkIn.findByPk(entry.id, { include: defaultInclude, transaction: t });
    });

    const full = result;

    emitQueueUpdate(effectiveBranchId, { action: 'checkin', entry: full });

    // Queue entries start unassigned, so only branch management needs to act on them.
    notifyBranch(effectiveBranchId, '🚶 New Walk-In', `${customerName} — Token ${full.token}`, {
      type: 'new_walkin',
      walkin_id: String(full.id),
      branch_id: String(effectiveBranchId),
    }, {
      tenantId: resolveTenantId(req),
      roles: ['superadmin', 'admin', 'manager'],
      excludeUserId: req.user?.id ?? null,
    });

    if (full.phone) {
      const branch = await Branch.findByPk(effectiveBranchId, { attributes: ['id', 'name', 'phone', 'tenant_id'] });
      notifyWalkInCheckIn(full, branch, full.service, resolveTenantId(req));
    }

    res.status(201).json(full);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ message: err.message });
    console.error('walkin.checkin error:', err);
    res.status(500).json({ message: 'Failed to check in walk-in customer.' });
  }
};

// ── PATCH /api/walkin/:id ─────────────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      customerName,
      phone,
      serviceId,
      serviceIds,
      note,
      customerId,
      customerPackageId,
      customer_package_id: customerPackageIdSnake,
    } = req.body;
    const resolvedCustomerPackageId = customerPackageId || customerPackageIdSnake;

    const entry = await WalkIn.findByPk(id);
    if (!entry) return res.status(404).json({ message: 'Walk-in entry not found.' });
    if (req.userBranchId && Number(entry.branch_id) !== Number(req.userBranchId)) {
      return res.status(403).json({ message: 'Access denied for this branch.' });
    }

    const result = await sequelize.transaction(async (t) => {
      if (customerName != null) entry.customer_name = String(customerName).trim() || entry.customer_name;
      if (phone !== undefined) entry.phone = phone || null;
      if (note !== undefined) entry.note = note || null;

      const effectiveNote = note !== undefined ? note : entry.note;
      const pkgId = resolvedCustomerPackageId || parsePackageIdFromNotes(effectiveNote);
      const usesPackage = !!(pkgId || notesUsesPackage(effectiveNote));

      let resolvedCustomerId = customerId || req.body.customer_id || entry.customer_id;
      if (!resolvedCustomerId && (phone || entry.phone)) {
        const phoneQ = String(phone ?? entry.phone).trim();
        const match = await Customer.findOne({
          where: { ...tenantWhere(req), phone: { [Op.like]: `%${phoneQ}%` } },
          transaction: t,
        });
        if (match) resolvedCustomerId = match.id;
      }
      if (customerId !== undefined || req.body.customer_id !== undefined || resolvedCustomerId) {
        entry.customer_id = resolvedCustomerId || null;
      }

      const orderedServiceIds = Array.isArray(serviceIds) && serviceIds.length
        ? [...new Set(serviceIds.map(Number).filter(Boolean))]
        : serviceId
          ? [Number(serviceId)].filter(Boolean)
          : null;

      if (orderedServiceIds?.length) {
        const svcRows = await Service.findAll({
          where: { id: orderedServiceIds },
          attributes: ['id', 'price', 'duration_minutes'],
          transaction: t,
        });
        if (!svcRows.length) {
          throw Object.assign(new Error('Service not found.'), { status: 404 });
        }
        entry.service_id = orderedServiceIds[0];
        if (usesPackage && pkgId) {
          entry.total_amount = await resolvePackageBundlePrice(req, pkgId, t);
        } else {
          entry.total_amount = svcRows.reduce((sum, s) => sum + Number(s.price || 0), 0);
        }

        await WalkInQueueService.destroy({ where: { walk_in_id: entry.id }, transaction: t });
        const priceById = Object.fromEntries(svcRows.map((s) => [Number(s.id), Number(s.price || 0)]));
        await WalkInQueueService.bulkCreate(
          orderedServiceIds.map((sid, idx) => ({
            walk_in_id: entry.id,
            service_id: sid,
            sort_order: idx,
            line_price: priceById[sid] ?? null,
          })),
          { transaction: t },
        );
      } else if (note !== undefined || resolvedCustomerPackageId !== undefined) {
        let svcIds = [];
        const links = await WalkInQueueService.findAll({
          where: { walk_in_id: entry.id },
          attributes: ['service_id'],
          transaction: t,
        });
        if (links.length) svcIds = links.map((l) => Number(l.service_id)).filter(Boolean);
        else if (entry.service_id) svcIds = [Number(entry.service_id)];

        if (usesPackage && pkgId) {
          entry.total_amount = await resolvePackageBundlePrice(req, pkgId, t);
        } else if (svcIds.length) {
          const rows = await Service.findAll({
            where: { id: svcIds },
            attributes: ['price'],
            transaction: t,
          });
          entry.total_amount = rows.reduce((sum, s) => sum + Number(s.price || 0), 0);
        }
      }

      await entry.save({ transaction: t });
      return WalkIn.findByPk(entry.id, { include: defaultInclude, transaction: t });
    });

    emitQueueUpdate(result.branch_id, { action: 'update', entry: result });
    res.json(result);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ message: err.message });
    console.error('walkin.update error:', err);
    res.status(500).json({ message: 'Failed to update walk-in entry.' });
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
    if (req.userBranchId && Number(entry.branch_id) !== Number(req.userBranchId)) {
      return res.status(403).json({ message: 'Access denied for this branch.' });
    }

    entry.status = status;
    if (status === 'serving') {
      entry.serve_start_time = new Date().toTimeString().slice(0, 8);
      entry.reminder_15_sent_at = null;
      entry.reminder_at_end_sent_at = null;
    }
    await entry.save();

    const full = await WalkIn.findByPk(id, { include: defaultInclude });
    emitQueueUpdate(entry.branch_id, { action: 'statusChange', entry: full });

    if (full.phone && (status === 'serving' || status === 'completed')) {
      const branch = await Branch.findByPk(entry.branch_id, { attributes: ['id', 'name', 'phone', 'tenant_id'] });
      const tid = resolveTenantId(req) ?? entry.tenant_id;
      if (status === 'serving') notifyWalkInServing(full, branch, full.service, tid);
      else notifyWalkInCompleted(full, branch, full.service, tid);
    }

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

    const entry = await WalkIn.findByPk(id, { include: defaultInclude });
    if (!entry) return res.status(404).json({ message: 'Walk-in entry not found.' });
    if (req.userBranchId && Number(entry.branch_id) !== Number(req.userBranchId)) {
      return res.status(403).json({ message: 'Access denied for this branch.' });
    }

    // Server-side guard: staff cannot be assigned if they're already serving a walk-in
    // and that walk-in's duration end time hasn't passed yet.
    // Walk-in doesn't pick a time slot; it blocks in real-time based on serve_start_time.
    const { slNowParts, normalizeWallClockTime } = require('../utils/dateUtils');
    const now = slNowParts();
    const nowMin = Number(now.minutes);

    const hmToMinutes = (hm) => {
      const t = normalizeWallClockTime(hm || '');
      const [h, m] = String(t).slice(0, 5).split(':').map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    };

    const durationMinutesForWalkIn = (w) => {
      const links = Array.isArray(w?.queueServices) ? w.queueServices : [];
      if (links.length) {
        const sum = links.reduce((acc, l) => acc + (Number(l?.service?.duration_minutes) || 0), 0);
        if (sum > 0) return sum;
      }
      return Number(w?.service?.duration_minutes) || 30;
    };

    const conflicting = await WalkIn.findAll({
      where: {
        tenant_id: resolveTenantId(req) ?? entry.tenant_id,
        branch_id: entry.branch_id,
        staff_id: staffId,
        status: 'serving',
      },
      include: defaultInclude,
    });

    const isBusy = conflicting.some((w) => {
      const startMin = hmToMinutes(w?.serve_start_time || w?.check_in_time);
      const dur = durationMinutesForWalkIn(w);
      if (startMin == null) return true; // unknown -> be safe
      const endMin = startMin + dur;
      return nowMin < endMin;
    });

    if (isBusy) {
      return res.status(409).json({ message: 'Selected staff is busy right now for another walk-in.' });
    }

    entry.staff_id = staffId;
    entry.status = 'serving';
    entry.serve_start_time = new Date().toTimeString().slice(0, 8);
    entry.reminder_15_sent_at = null;
    entry.reminder_at_end_sent_at = null;
    await entry.save();

    const full = await WalkIn.findByPk(id, { include: defaultInclude });
    emitQueueUpdate(entry.branch_id, { action: 'assign', entry: full });

    notifyStaffUser(staffId, '🚶 Walk-In Assigned', `${full.customer_name} — Token ${full.token}`, {
      type: 'walkin_assigned',
      walkin_id: String(full.id),
      branch_id: String(entry.branch_id),
    }, resolveTenantId(req) ?? entry.tenant_id);

    if (full.phone) {
      const branch = await Branch.findByPk(entry.branch_id, { attributes: ['id', 'name', 'phone', 'tenant_id'] });
      notifyWalkInServing(full, branch, full.service, resolveTenantId(req) ?? entry.tenant_id);
    }

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
    if (req.userBranchId && Number(entry.branch_id) !== Number(req.userBranchId)) {
      return res.status(403).json({ message: 'Access denied for this branch.' });
    }

    const branchId = entry.branch_id;
    await entry.destroy();

    emitQueueUpdate(branchId, { action: 'remove', id: Number(id) });
    res.json({ message: 'Walk-in entry removed.' });
  } catch (err) {
    console.error('walkin.remove error:', err);
    res.status(500).json({ message: 'Failed to remove walk-in entry.' });
  }
};
