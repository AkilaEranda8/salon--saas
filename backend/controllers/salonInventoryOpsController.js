'use strict';

const { Op } = require('sequelize');
const base = require('./salonInventoryController');
const {
  InvProduct, InvStockMovement,
  InvConsumption, InvDayEndBatch, InvDayEndBatchItem,
  InvStockAdjustment, InvStockCount, InvStockCountItem,
  InvSettings, Branch, Staff, Service, Appointment, User,
} = require('../models');
const { applyStockChange, sequelize } = require('../services/invStockService');

const {
  toDec, branchScope, resolveBranchId, getSettings, nextDocNo,
  tenantWhere, byIdWhere, resolveTenantId,
} = base;

// ── Stock Consumption (pending until day-end) ────────────────────────────────
const listConsumptions = async (req, res) => {
  try {
    const where = branchScope(req);
    if (req.query.status) where.status = req.query.status;
    if (req.query.date) where.consumption_date = req.query.date;
    if (req.query.from && req.query.to) {
      where.consumption_date = { [Op.between]: [req.query.from, req.query.to] };
    }
    const rows = await InvConsumption.findAll({
      where,
      include: [
        { model: InvProduct, as: 'product', attributes: ['id', 'name', 'unit', 'product_type'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
        { model: Staff, as: 'staff', attributes: ['id', 'name'], required: false },
        { model: Service, as: 'service', attributes: ['id', 'name'], required: false },
        { model: Appointment, as: 'appointment', attributes: ['id', 'appointment_date'], required: false },
      ],
      order: [['consumption_date', 'DESC'], ['id', 'DESC']],
      limit: 500,
    });
    return res.json(rows);
  } catch (err) {
    console.error('inv.listConsumptions', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const createConsumption = async (req, res) => {
  try {
    const branchId = resolveBranchId(req, req.body.branch_id);
    if (!branchId || !req.body.product_id || !req.body.quantity_used) {
      return res.status(400).json({ message: 'branch_id, product_id and quantity_used are required.' });
    }
    const product = await InvProduct.findOne({ where: { id: req.body.product_id, ...tenantWhere(req) } });
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    if (product.product_type === 'equipment') {
      return res.status(400).json({ message: 'Equipment stock is not consumed.' });
    }

    const settings = await getSettings(req, branchId);
    const qty = toDec(req.body.quantity_used);
    if (qty <= 0) return res.status(400).json({ message: 'Quantity must be positive.' });

    // Day-end mode: save as pending (no stock change)
    if (settings.enable_day_end_consumption && !settings.enable_auto_deduction) {
      const row = await InvConsumption.create({
        tenant_id: resolveTenantId(req),
        branch_id: Number(branchId),
        product_id: product.id,
        staff_id: req.body.staff_id || null,
        appointment_id: req.body.appointment_id || null,
        service_id: req.body.service_id || null,
        consumption_date: req.body.consumption_date || new Date().toISOString().slice(0, 10),
        quantity_used: qty,
        unit: req.body.unit || product.unit,
        reason: req.body.reason || null,
        status: 'pending',
        created_by: req.user?.id,
      });
      return res.status(201).json(row);
    }

    // Auto deduction mode
    const t = await sequelize.transaction();
    try {
      const locked = await InvProduct.findOne({
        where: { id: product.id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      await applyStockChange({
        product: locked,
        delta: -qty,
        movementType: 'consumption',
        tenantId: resolveTenantId(req),
        branchId: Number(branchId),
        userId: req.user?.id,
        referenceType: 'consumption',
        remarks: req.body.reason || 'Auto consumption',
        transaction: t,
        allowNegative: !!settings.allow_negative_stock,
      });
      const row = await InvConsumption.create({
        tenant_id: resolveTenantId(req),
        branch_id: Number(branchId),
        product_id: product.id,
        staff_id: req.body.staff_id || null,
        appointment_id: req.body.appointment_id || null,
        service_id: req.body.service_id || null,
        consumption_date: req.body.consumption_date || new Date().toISOString().slice(0, 10),
        quantity_used: qty,
        unit: req.body.unit || product.unit,
        reason: req.body.reason || null,
        status: 'processed',
        created_by: req.user?.id,
      }, { transaction: t });
      await t.commit();
      return res.status(201).json(row);
    } catch (e) {
      await t.rollback();
      throw e;
    }
  } catch (err) {
    console.error('inv.createConsumption', err.message);
    return res.status(err.status || 500).json({ message: err.message || 'Server error.' });
  }
};

const updateConsumption = async (req, res) => {
  try {
    const row = await InvConsumption.findOne({ where: byIdWhere(req, req.params.id) });
    if (!row) return res.status(404).json({ message: 'Not found.' });
    if (row.status !== 'pending') return res.status(400).json({ message: 'Only pending records can be edited.' });
    const allowed = ['quantity_used', 'reason', 'staff_id', 'service_id', 'appointment_id', 'consumption_date'];
    const updates = {};
    for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
    if (updates.quantity_used != null) updates.quantity_used = toDec(updates.quantity_used);
    await row.update(updates);
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const cancelConsumption = async (req, res) => {
  try {
    const row = await InvConsumption.findOne({ where: byIdWhere(req, req.params.id) });
    if (!row) return res.status(404).json({ message: 'Not found.' });
    if (row.status !== 'pending') return res.status(400).json({ message: 'Only pending can be cancelled.' });
    await row.update({ status: 'cancelled' });
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Day End Stock Consumption ────────────────────────────────────────────────
const dayEndPreview = async (req, res) => {
  try {
    const branchId = resolveBranchId(req, req.query.branchId);
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    if (!branchId) return res.status(400).json({ message: 'branchId required.' });

    const pending = await InvConsumption.findAll({
      where: {
        ...tenantWhere(req),
        branch_id: Number(branchId),
        consumption_date: date,
        status: 'pending',
      },
      include: [{ model: InvProduct, as: 'product', attributes: ['id', 'name', 'unit', 'current_stock', 'product_type'] }],
    });

    const map = new Map();
    for (const c of pending) {
      const key = c.product_id;
      if (!map.has(key)) {
        map.set(key, {
          product_id: c.product_id,
          product: c.product,
          unit: c.unit,
          quantity_used: 0,
          consumption_ids: [],
        });
      }
      const g = map.get(key);
      g.quantity_used += toDec(c.quantity_used);
      g.consumption_ids.push(c.id);
    }

    return res.json({
      date,
      branch_id: Number(branchId),
      pendingCount: pending.length,
      items: [...map.values()],
    });
  } catch (err) {
    console.error('inv.dayEndPreview', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const dayEndSaveDraft = async (req, res) => {
  try {
    const branchId = resolveBranchId(req, req.body.branch_id);
    const date = req.body.date || new Date().toISOString().slice(0, 10);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!branchId) return res.status(400).json({ message: 'branch_id required.' });

    let batch = await InvDayEndBatch.findOne({
      where: {
        ...tenantWhere(req),
        branch_id: Number(branchId),
        batch_date: date,
        status: 'draft',
      },
    });
    if (!batch) {
      batch = await InvDayEndBatch.create({
        tenant_id: resolveTenantId(req),
        branch_id: Number(branchId),
        batch_date: date,
        status: 'draft',
        notes: req.body.notes || null,
        created_by: req.user?.id,
      });
    } else {
      await InvDayEndBatchItem.destroy({ where: { day_end_batch_id: batch.id } });
      if (req.body.notes !== undefined) await batch.update({ notes: req.body.notes });
    }

    for (const it of items) {
      await InvDayEndBatchItem.create({
        day_end_batch_id: batch.id,
        product_id: it.product_id,
        quantity_used: toDec(it.quantity_used),
        unit: it.unit || 'pcs',
      });
    }

    const full = await InvDayEndBatch.findByPk(batch.id, {
      include: [{ model: InvDayEndBatchItem, as: 'items', include: [{ model: InvProduct, as: 'product' }] }],
    });
    return res.json(full);
  } catch (err) {
    console.error('inv.dayEndDraft', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const dayEndConfirm = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const branchId = resolveBranchId(req, req.body.branch_id);
    const date = req.body.date || new Date().toISOString().slice(0, 10);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!branchId || !items.length) {
      await t.rollback();
      return res.status(400).json({ message: 'branch_id and items required.' });
    }

    const settings = await getSettings(req, branchId);
    const batch = await InvDayEndBatch.create({
      tenant_id: resolveTenantId(req),
      branch_id: Number(branchId),
      batch_date: date,
      status: 'confirmed',
      notes: req.body.notes || null,
      created_by: req.user?.id,
      confirmed_by: req.user?.id,
      confirmed_at: new Date(),
    }, { transaction: t });

    const consumptionIds = [];
    for (const it of items) {
      const qty = toDec(it.quantity_used);
      await InvDayEndBatchItem.create({
        day_end_batch_id: batch.id,
        product_id: it.product_id,
        quantity_used: qty,
        unit: it.unit || 'pcs',
      }, { transaction: t });

      if (qty <= 0) continue;
      const product = await InvProduct.findOne({
        where: { id: it.product_id, ...tenantWhere(req) },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!product || product.product_type === 'equipment') continue;

      await applyStockChange({
        product,
        delta: -qty,
        movementType: 'consumption',
        tenantId: resolveTenantId(req),
        branchId: Number(branchId),
        userId: req.user?.id,
        referenceType: 'day_end_batch',
        referenceId: batch.id,
        remarks: `Day-end consumption ${date}`,
        transaction: t,
        allowNegative: !!settings.allow_negative_stock,
      });

      if (Array.isArray(it.consumption_ids)) consumptionIds.push(...it.consumption_ids);
    }

    const pendingWhere = {
      ...tenantWhere(req),
      branch_id: Number(branchId),
      consumption_date: date,
      status: 'pending',
    };
    if (consumptionIds.length) {
      await InvConsumption.update(
        { status: 'processed', day_end_batch_id: batch.id },
        { where: { ...pendingWhere, id: { [Op.in]: consumptionIds } }, transaction: t },
      );
    } else {
      await InvConsumption.update(
        { status: 'processed', day_end_batch_id: batch.id },
        { where: pendingWhere, transaction: t },
      );
    }

    // Cancel leftover draft batches for same day
    await InvDayEndBatch.update(
      { status: 'cancelled' },
      {
        where: {
          ...tenantWhere(req),
          branch_id: Number(branchId),
          batch_date: date,
          status: 'draft',
          id: { [Op.ne]: batch.id },
        },
        transaction: t,
      },
    );

    await t.commit();
    const full = await InvDayEndBatch.findByPk(batch.id, {
      include: [{ model: InvDayEndBatchItem, as: 'items', include: [{ model: InvProduct, as: 'product' }] }],
    });
    return res.json(full);
  } catch (err) {
    await t.rollback();
    console.error('inv.dayEndConfirm', err.message);
    return res.status(err.status || 500).json({ message: err.message || 'Server error.' });
  }
};

// ── Stock Adjustments ────────────────────────────────────────────────────────
const listAdjustments = async (req, res) => {
  try {
    const where = branchScope(req);
    if (req.query.status) where.status = req.query.status;
    const rows = await InvStockAdjustment.findAll({
      where,
      include: [
        { model: InvProduct, as: 'product', attributes: ['id', 'name', 'unit'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 200,
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const createAdjustment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const branchId = resolveBranchId(req, req.body.branch_id);
    const { product_id, direction, quantity, reason } = req.body;
    if (!branchId || !product_id || !direction || !quantity || !reason) {
      await t.rollback();
      return res.status(400).json({ message: 'branch_id, product_id, direction, quantity and reason are required.' });
    }
    const settings = await getSettings(req, branchId);
    const qty = Math.abs(toDec(quantity));
    if (qty <= 0) {
      await t.rollback();
      return res.status(400).json({ message: 'Quantity must be positive.' });
    }

    const needsApproval = !!settings.manager_approval_required
      && !['superadmin', 'admin'].includes(req.user?.role);

    const adj = await InvStockAdjustment.create({
      tenant_id: resolveTenantId(req),
      branch_id: Number(branchId),
      product_id,
      direction,
      quantity: qty,
      reason: String(reason).trim(),
      status: needsApproval ? 'pending' : 'applied',
      created_by: req.user?.id,
      approved_by: needsApproval ? null : req.user?.id,
      approved_at: needsApproval ? null : new Date(),
    }, { transaction: t });

    if (!needsApproval) {
      const product = await InvProduct.findOne({
        where: { id: product_id, ...tenantWhere(req) },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
      const delta = direction === 'add' ? qty : -qty;
      await applyStockChange({
        product,
        delta,
        movementType: 'adjustment',
        tenantId: resolveTenantId(req),
        branchId: Number(branchId),
        userId: req.user?.id,
        referenceType: 'stock_adjustment',
        referenceId: adj.id,
        remarks: reason,
        transaction: t,
        allowNegative: !!settings.allow_negative_stock,
      });
    }

    await t.commit();
    return res.status(201).json(adj);
  } catch (err) {
    await t.rollback();
    return res.status(err.status || 500).json({ message: err.message || 'Server error.' });
  }
};

const approveAdjustment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const adj = await InvStockAdjustment.findOne({
      where: byIdWhere(req, req.params.id),
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!adj) { await t.rollback(); return res.status(404).json({ message: 'Not found.' }); }
    if (adj.status !== 'pending') { await t.rollback(); return res.status(400).json({ message: 'Not pending.' }); }

    const settings = await getSettings(req, adj.branch_id);
    const product = await InvProduct.findOne({
      where: { id: adj.product_id, ...tenantWhere(req) },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    const delta = adj.direction === 'add' ? toDec(adj.quantity) : -toDec(adj.quantity);
    await applyStockChange({
      product,
      delta,
      movementType: 'adjustment',
      tenantId: resolveTenantId(req),
      branchId: adj.branch_id,
      userId: req.user?.id,
      referenceType: 'stock_adjustment',
      referenceId: adj.id,
      remarks: adj.reason,
      transaction: t,
      allowNegative: !!settings.allow_negative_stock,
    });
    await adj.update({
      status: 'applied',
      approved_by: req.user?.id,
      approved_at: new Date(),
    }, { transaction: t });
    await t.commit();
    return res.json(adj);
  } catch (err) {
    await t.rollback();
    return res.status(err.status || 500).json({ message: err.message || 'Server error.' });
  }
};

// ── Stock Count ──────────────────────────────────────────────────────────────
const listStockCounts = async (req, res) => {
  try {
    const rows = await InvStockCount.findAll({
      where: branchScope(req),
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
        { model: InvStockCountItem, as: 'items', include: [{ model: InvProduct, as: 'product', attributes: ['id', 'name', 'unit'] }] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const createStockCount = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const branchId = resolveBranchId(req, req.body.branch_id);
    if (!branchId) { await t.rollback(); return res.status(400).json({ message: 'branch_id required.' }); }

    const products = await InvProduct.findAll({
      where: { ...tenantWhere(req), branch_id: Number(branchId), status: 'active' },
      transaction: t,
    });

    const count = await InvStockCount.create({
      tenant_id: resolveTenantId(req),
      branch_id: Number(branchId),
      count_date: req.body.count_date || new Date().toISOString().slice(0, 10),
      status: 'draft',
      notes: req.body.notes || null,
      created_by: req.user?.id,
    }, { transaction: t });

    const bodyItems = Array.isArray(req.body.items) ? req.body.items : null;
    for (const p of products) {
      const override = bodyItems?.find((i) => Number(i.product_id) === p.id);
      const expected = toDec(p.current_stock);
      const actual = override ? toDec(override.actual_qty, expected) : expected;
      await InvStockCountItem.create({
        stock_count_id: count.id,
        product_id: p.id,
        expected_qty: expected,
        actual_qty: actual,
        variance: actual - expected,
      }, { transaction: t });
    }

    await t.commit();
    const full = await InvStockCount.findByPk(count.id, {
      include: [{ model: InvStockCountItem, as: 'items', include: [{ model: InvProduct, as: 'product' }] }],
    });
    return res.status(201).json(full);
  } catch (err) {
    await t.rollback();
    console.error('inv.createStockCount', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const updateStockCount = async (req, res) => {
  try {
    const count = await InvStockCount.findOne({ where: byIdWhere(req, req.params.id) });
    if (!count) return res.status(404).json({ message: 'Not found.' });
    if (count.status !== 'draft') return res.status(400).json({ message: 'Only draft counts can be edited.' });
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    for (const it of items) {
      const row = await InvStockCountItem.findOne({
        where: { stock_count_id: count.id, product_id: it.product_id },
      });
      if (!row) continue;
      const actual = toDec(it.actual_qty);
      await row.update({
        actual_qty: actual,
        variance: actual - toDec(row.expected_qty),
      });
    }
    if (req.body.notes !== undefined) await count.update({ notes: req.body.notes });
    const full = await InvStockCount.findByPk(count.id, {
      include: [{ model: InvStockCountItem, as: 'items', include: [{ model: InvProduct, as: 'product' }] }],
    });
    return res.json(full);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const completeStockCount = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const count = await InvStockCount.findOne({
      where: byIdWhere(req, req.params.id),
      include: [{ model: InvStockCountItem, as: 'items' }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!count) { await t.rollback(); return res.status(404).json({ message: 'Not found.' }); }
    if (count.status !== 'draft') { await t.rollback(); return res.status(400).json({ message: 'Already completed.' }); }

    const settings = await getSettings(req, count.branch_id);
    for (const it of count.items) {
      const variance = toDec(it.variance);
      if (Math.abs(variance) < 0.0001) continue;
      const product = await InvProduct.findOne({
        where: { id: it.product_id, ...tenantWhere(req) },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!product) continue;
      await applyStockChange({
        product,
        delta: variance,
        movementType: 'stock_count',
        tenantId: resolveTenantId(req),
        branchId: count.branch_id,
        userId: req.user?.id,
        referenceType: 'stock_count',
        referenceId: count.id,
        remarks: `Stock count variance`,
        transaction: t,
        allowNegative: !!settings.allow_negative_stock,
      });
    }
    await count.update({
      status: 'completed',
      completed_by: req.user?.id,
      completed_at: new Date(),
    }, { transaction: t });
    await t.commit();
    return res.json(count);
  } catch (err) {
    await t.rollback();
    return res.status(err.status || 500).json({ message: err.message || 'Server error.' });
  }
};

// ── History / Ledger ─────────────────────────────────────────────────────────
const listHistory = async (req, res) => {
  try {
    const where = branchScope(req);
    if (req.query.product_id) where.product_id = Number(req.query.product_id);
    if (req.query.movement_type) where.movement_type = req.query.movement_type;
    if (req.query.from || req.query.to) {
      where.moved_at = {};
      if (req.query.from) where.moved_at[Op.gte] = new Date(req.query.from);
      if (req.query.to) where.moved_at[Op.lte] = new Date(`${req.query.to}T23:59:59`);
    }
    const rows = await InvStockMovement.findAll({
      where,
      include: [
        { model: InvProduct, as: 'product', attributes: ['id', 'name', 'unit'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
        { model: User, as: 'user', attributes: ['id', 'name', 'username'], required: false },
      ],
      order: [['moved_at', 'DESC'], ['id', 'DESC']],
      limit: Math.min(parseInt(req.query.limit, 10) || 200, 500),
    });
    return res.json(rows);
  } catch (err) {
    console.error('inv.history', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Reports ──────────────────────────────────────────────────────────────────
const reports = async (req, res) => {
  try {
    const type = req.query.type || 'daily_consumption';
    const where = branchScope(req);
    const from = req.query.from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);

    if (type === 'low_stock') {
      return lowStockProxy(req, res);
    }

    if (type === 'inventory_ledger') {
      where.moved_at = { [Op.between]: [new Date(from), new Date(`${to}T23:59:59`)] };
      const rows = await InvStockMovement.findAll({
        where,
        include: [{ model: InvProduct, as: 'product', attributes: ['id', 'name', 'unit'] }],
        order: [['moved_at', 'ASC']],
        limit: 1000,
      });
      return res.json({ type, from, to, data: rows });
    }

    if (type === 'daily_consumption' || type === 'monthly_consumption' || type === 'product_usage'
      || type === 'branch_consumption' || type === 'stylist_consumption') {
      const cWhere = {
        ...tenantWhere(req),
        status: 'processed',
        consumption_date: { [Op.between]: [from, to] },
      };
      if (req.userBranchId) cWhere.branch_id = req.userBranchId;
      else if (req.query.branchId) cWhere.branch_id = Number(req.query.branchId);

      const rows = await InvConsumption.findAll({
        where: cWhere,
        include: [
          { model: InvProduct, as: 'product', attributes: ['id', 'name', 'unit'] },
          { model: Staff, as: 'staff', attributes: ['id', 'name'], required: false },
          { model: Branch, as: 'branch', attributes: ['id', 'name'] },
        ],
        order: [['consumption_date', 'ASC']],
        limit: 2000,
      });
      return res.json({ type, from, to, data: rows });
    }

    if (type === 'adjustment_report') {
      const rows = await InvStockAdjustment.findAll({
        where: { ...branchScope(req), createdAt: { [Op.between]: [new Date(from), new Date(`${to}T23:59:59`)] } },
        include: [{ model: InvProduct, as: 'product', attributes: ['id', 'name', 'unit'] }],
        order: [['createdAt', 'DESC']],
      });
      return res.json({ type, from, to, data: rows });
    }

    if (type === 'purchase_report') {
      const { InvGoodsReceipt, InvGoodsReceiptItem } = require('../models');
      const rows = await InvGoodsReceipt.findAll({
        where: {
          ...branchScope(req),
          status: 'confirmed',
          received_date: { [Op.between]: [from, to] },
        },
        include: [{ model: InvGoodsReceiptItem, as: 'items', include: [{ model: InvProduct, as: 'product' }] }],
        order: [['received_date', 'DESC']],
      });
      return res.json({ type, from, to, data: rows });
    }

    return res.status(400).json({ message: 'Unknown report type.' });
  } catch (err) {
    console.error('inv.reports', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

async function lowStockProxy(req, res) {
  return base.lowStock(req, res);
}

// ── Settings ─────────────────────────────────────────────────────────────────
const getInvSettings = async (req, res) => {
  try {
    const branchId = resolveBranchId(req, req.query.branchId);
    const row = await getSettings(req, branchId);
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const updateInvSettings = async (req, res) => {
  try {
    const branchId = resolveBranchId(req, req.body.branch_id);
    const row = await getSettings(req, branchId);
    const allowed = [
      'enable_day_end_consumption', 'enable_auto_deduction',
      'allow_negative_stock', 'manager_approval_required', 'low_stock_notification',
    ];
    const updates = {};
    for (const f of allowed) if (req.body[f] !== undefined) updates[f] = !!req.body[f];
    await row.update(updates);
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  ...base,
  listConsumptions, createConsumption, updateConsumption, cancelConsumption,
  dayEndPreview, dayEndSaveDraft, dayEndConfirm,
  listAdjustments, createAdjustment, approveAdjustment,
  listStockCounts, createStockCount, updateStockCount, completeStockCount,
  listHistory, reports, getInvSettings, updateInvSettings,
};
