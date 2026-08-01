'use strict';

const { Op } = require('sequelize');
const base = require('./salonInventoryController');
const {
  InvProduct, InvStockMovement,
  InvConsumption, InvDayEndBatch, InvDayEndBatchItem,
  InvStockAdjustment, Branch, Staff, Service, Customer, User,
} = require('../models');
const { applyStockChange, sequelize } = require('../services/invStockService');

const {
  toDec, branchScope, requireBranchId, localToday,
  ALLOW_NEGATIVE_ON_DAY_END, ALLOW_NEGATIVE_ON_ADJUSTMENT,
  tenantWhere, byIdWhere, resolveTenantId,
} = base;

// ── Stock Consumption (pending until Day End) ────────────────────────────────
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
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'], required: false },
        { model: Service, as: 'service', attributes: ['id', 'name'], required: false },
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
    const branchId = await requireBranchId(req, req.body.branch_id);
    if (!branchId || !req.body.product_id || !req.body.quantity_used) {
      return res.status(400).json({ message: 'A branch, product and quantity are required.' });
    }
    const product = await InvProduct.findOne({ where: { id: req.body.product_id, ...tenantWhere(req) } });
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    if (Number(product.branch_id) !== branchId) {
      return res.status(400).json({ message: 'Product does not belong to the selected branch.' });
    }
    if (product.product_type !== 'consumable') {
      return res.status(400).json({ message: 'Equipment cannot be consumed. Only consumable products can be recorded.' });
    }

    const qty = toDec(req.body.quantity_used);
    if (qty <= 0) return res.status(400).json({ message: 'Quantity must be greater than zero.' });

    // Always pending — stock is deducted only when Day End Closing is completed.
    const row = await InvConsumption.create({
      tenant_id: resolveTenantId(req),
      branch_id: branchId,
      product_id: product.id,
      staff_id: req.body.staff_id || null,
      customer_id: req.body.customer_id || null,
      appointment_id: req.body.appointment_id || null,
      service_id: req.body.service_id || null,
      consumption_date: req.body.consumption_date || localToday(),
      quantity_used: qty,
      unit: req.body.unit || product.unit,
      reason: req.body.reason || null,
      status: 'pending',
      created_by: req.user?.id,
    });
    return res.status(201).json(row);
  } catch (err) {
    console.error('inv.createConsumption', err.message);
    return res.status(err.status || 500).json({ message: err.message || 'Server error.' });
  }
};

const cancelConsumption = async (req, res) => {
  try {
    const row = await InvConsumption.findOne({ where: byIdWhere(req, req.params.id) });
    if (!row) return res.status(404).json({ message: 'Not found.' });
    if (row.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending usage can be removed. Use a stock adjustment instead.' });
    }
    await row.update({ status: 'cancelled' });
    return res.json(row);
  } catch (err) {
    console.error('inv.cancelConsumption', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Day End Closing ──────────────────────────────────────────────────────────
async function findConfirmedBatch(req, branchId, date, transaction) {
  return InvDayEndBatch.findOne({
    where: {
      ...tenantWhere(req),
      branch_id: branchId,
      batch_date: date,
      status: 'confirmed',
    },
    transaction,
  });
}

const dayEndPreview = async (req, res) => {
  try {
    const branchId = await requireBranchId(req, req.query.branchId);
    const date = req.query.date || localToday();
    if (!branchId) return res.status(400).json({ message: 'No branch found for this salon.' });

    const pending = await InvConsumption.findAll({
      where: {
        ...tenantWhere(req),
        branch_id: branchId,
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
          unit: c.unit || c.product?.unit,
          quantity_used: 0,
          entries: 0,
        });
      }
      const group = map.get(key);
      group.quantity_used += toDec(c.quantity_used);
      group.entries += 1;
    }

    const closedBatch = await findConfirmedBatch(req, branchId, date);
    return res.json({
      date,
      branch_id: branchId,
      pendingCount: pending.length,
      alreadyClosed: !!closedBatch,
      closedAt: closedBatch?.confirmed_at || null,
      items: [...map.values()],
    });
  } catch (err) {
    console.error('inv.dayEndPreview', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Totals are recomputed from the pending records inside the transaction rather
 * than trusting the request body, so a stale preview or a double click can never
 * deduct the wrong amount or deduct twice.
 */
const dayEndConfirm = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const branchId = await requireBranchId(req, req.body.branch_id);
    const date = req.body.date || localToday();
    if (!branchId) {
      await t.rollback();
      return res.status(400).json({ message: 'No branch found for this salon.' });
    }

    if (await findConfirmedBatch(req, branchId, date, t)) {
      await t.rollback();
      return res.status(409).json({ message: `Day End for ${date} is already completed.` });
    }

    const pending = await InvConsumption.findAll({
      where: {
        ...tenantWhere(req),
        branch_id: branchId,
        consumption_date: date,
        status: 'pending',
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!pending.length) {
      await t.rollback();
      return res.status(400).json({ message: 'No pending usage to close for this date.' });
    }

    const totals = new Map();
    for (const c of pending) {
      const qty = toDec(c.quantity_used);
      if (qty <= 0) continue;
      const current = totals.get(c.product_id) || { quantity: 0, unit: c.unit };
      current.quantity += qty;
      totals.set(c.product_id, current);
    }

    const batch = await InvDayEndBatch.create({
      tenant_id: resolveTenantId(req),
      branch_id: branchId,
      batch_date: date,
      status: 'confirmed',
      notes: req.body.notes || null,
      created_by: req.user?.id,
      confirmed_by: req.user?.id,
      confirmed_at: new Date(),
    }, { transaction: t });

    for (const [productId, { quantity, unit }] of totals) {
      const product = await InvProduct.findOne({
        where: { id: productId, ...tenantWhere(req) },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!product || product.product_type !== 'consumable') continue;

      await InvDayEndBatchItem.create({
        day_end_batch_id: batch.id,
        product_id: productId,
        quantity_used: quantity,
        unit: unit || product.unit || 'pcs',
      }, { transaction: t });

      await applyStockChange({
        product,
        delta: -quantity,
        movementType: 'consumption',
        tenantId: resolveTenantId(req),
        branchId,
        userId: req.user?.id,
        referenceType: 'day_end_batch',
        referenceId: batch.id,
        remarks: `Day-end consumption ${date}`,
        transaction: t,
        allowNegative: ALLOW_NEGATIVE_ON_DAY_END,
      });
    }

    await InvConsumption.update(
      { status: 'processed', day_end_batch_id: batch.id },
      { where: { id: { [Op.in]: pending.map((c) => c.id) } }, transaction: t },
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

// ── Stock Adjustments (applied immediately, no approval) ─────────────────────
const listAdjustments = async (req, res) => {
  try {
    const rows = await InvStockAdjustment.findAll({
      where: branchScope(req),
      include: [
        { model: InvProduct, as: 'product', attributes: ['id', 'name', 'unit'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 200,
    });
    return res.json(rows);
  } catch (err) {
    console.error('inv.listAdjustments', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const createAdjustment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const branchId = await requireBranchId(req, req.body.branch_id);
    const { product_id, direction, quantity, reason } = req.body;
    if (!branchId || !product_id || !direction || !quantity || !reason) {
      await t.rollback();
      return res.status(400).json({ message: 'Product, direction, quantity and reason are required.' });
    }
    if (!['add', 'remove'].includes(direction)) {
      await t.rollback();
      return res.status(400).json({ message: 'Direction must be add or remove.' });
    }
    const qty = Math.abs(toDec(quantity));
    if (qty <= 0) {
      await t.rollback();
      return res.status(400).json({ message: 'Quantity must be greater than zero.' });
    }

    const product = await InvProduct.findOne({
      where: { id: product_id, ...tenantWhere(req) },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!product) throw Object.assign(new Error('Product not found.'), { status: 404 });
    if (Number(product.branch_id) !== branchId) {
      throw Object.assign(new Error('Product does not belong to the selected branch.'), { status: 400 });
    }

    const adj = await InvStockAdjustment.create({
      tenant_id: resolveTenantId(req),
      branch_id: branchId,
      product_id: product.id,
      direction,
      quantity: qty,
      reason: String(reason).trim(),
      status: 'applied',
      created_by: req.user?.id,
      approved_by: req.user?.id,
      approved_at: new Date(),
    }, { transaction: t });

    await applyStockChange({
      product,
      delta: direction === 'add' ? qty : -qty,
      movementType: 'adjustment',
      tenantId: resolveTenantId(req),
      branchId,
      userId: req.user?.id,
      referenceType: 'stock_adjustment',
      referenceId: adj.id,
      remarks: adj.reason,
      transaction: t,
      allowNegative: ALLOW_NEGATIVE_ON_ADJUSTMENT,
    });

    await t.commit();
    return res.status(201).json(adj);
  } catch (err) {
    await t.rollback();
    console.error('inv.createAdjustment', err.message);
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

module.exports = {
  ...base,
  listConsumptions, createConsumption, cancelConsumption,
  dayEndPreview, dayEndConfirm,
  listAdjustments, createAdjustment,
  listHistory,
};
