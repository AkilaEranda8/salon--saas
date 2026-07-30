'use strict';

const { Op } = require('sequelize');
const {
  InvProduct, InvStockMovement,
  InvGoodsReceipt, InvGoodsReceiptItem,
  Branch,
} = require('../models');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');
const { applyStockChange, sequelize } = require('../services/invStockService');

const toDec = (v, fb = 0) => {
  if (v === '' || v == null) return fb;
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

const branchScope = (req) => {
  const where = tenantWhere(req);
  if (req.userBranchId) where.branch_id = req.userBranchId;
  else if (req.query.branchId) where.branch_id = Number(req.query.branchId);
  return where;
};

const resolveBranchId = (req, bodyBranchId) =>
  req.userBranchId || bodyBranchId || req.user?.branch_id || req.user?.branchId || null;

/**
 * Owners and admins carry no branch on their token, so every write used to fail
 * with "branch_id is required" until the UI sent one explicitly. Fall back to the
 * tenant's first branch, which is the only branch for most salons.
 */
async function requireBranchId(req, bodyBranchId) {
  const direct = resolveBranchId(req, bodyBranchId);
  if (direct) return Number(direct);
  const branch = await Branch.findOne({
    where: tenantWhere(req),
    attributes: ['id'],
    order: [['id', 'ASC']],
  });
  return branch ? Number(branch.id) : null;
}

/** Server runs on Asia/Colombo; ISO-UTC dates would file evening usage on the wrong day. */
function localToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Fixed stock rules — the salon flow has no configurable inventory policy.
 * Day End must never be blocked, so it may push stock negative and the shortfall
 * stays visible on the product list until someone corrects it.
 */
const ALLOW_NEGATIVE_ON_DAY_END = true;
const ALLOW_NEGATIVE_ON_ADJUSTMENT = false;

const PRODUCT_TYPES = ['consumable', 'equipment'];
const normalizeProductType = (value) =>
  (String(value || '').trim().toLowerCase() === 'equipment' ? 'equipment' : 'consumable');

const nextDocNo = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;

// ── Products ─────────────────────────────────────────────────────────────────
const listProducts = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = (page - 1) * limit;
    const where = branchScope(req);
    if (req.query.status) where.status = req.query.status;
    if (req.query.product_type) where.product_type = req.query.product_type;
    if (req.query.category_id) where.category_id = Number(req.query.category_id);
    if (req.query.q) {
      where[Op.or] = [
        { name: { [Op.like]: `%${req.query.q}%` } },
        { sku: { [Op.like]: `%${req.query.q}%` } },
        { barcode: { [Op.like]: `%${req.query.q}%` } },
        { brand: { [Op.like]: `%${req.query.q}%` } },
      ];
    }
    if (req.query.lowStock === 'true' || req.query.lowStock === '1') {
      where[Op.and] = sequelize.where(
        sequelize.col('current_stock'),
        Op.lte,
        sequelize.col('min_stock'),
      );
    }

    const { count, rows } = await InvProduct.findAndCountAll({
      where,
      limit,
      offset,
      order: [['name', 'ASC']],
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
    });
    return res.json({ total: count, page, limit, data: rows });
  } catch (err) {
    console.error('inv.listProducts', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const createProduct = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const branchId = await requireBranchId(req, req.body.branch_id);
    if (!branchId || !req.body.name) {
      await t.rollback();
      return res.status(400).json({ message: 'A branch and product name are required.' });
    }
    const opening = toDec(req.body.opening_stock ?? req.body.current_stock, 0);
    const product = await InvProduct.create({
      tenant_id: resolveTenantId(req),
      branch_id: branchId,
      category_id: req.body.category_id || null,
      supplier_id: req.body.supplier_id || null,
      name: String(req.body.name).trim(),
      sku: req.body.sku || null,
      barcode: req.body.barcode || null,
      brand: req.body.brand || null,
      product_type: normalizeProductType(req.body.product_type),
      unit: req.body.unit || 'pcs',
      cost_price: toDec(req.body.cost_price),
      sell_price: toDec(req.body.sell_price),
      opening_stock: opening,
      current_stock: opening,
      min_stock: toDec(req.body.min_stock),
      max_stock: toDec(req.body.max_stock),
      status: req.body.status || 'active',
      notes: req.body.notes || null,
    }, { transaction: t });

    if (opening !== 0) {
      await InvStockMovement.create({
        tenant_id: resolveTenantId(req),
        branch_id: branchId,
        product_id: product.id,
        movement_type: 'opening',
        opening_qty: 0,
        quantity_changed: opening,
        closing_qty: opening,
        reference_type: 'product',
        reference_id: product.id,
        user_id: req.user?.id || null,
        remarks: 'Opening stock',
        moved_at: new Date(),
      }, { transaction: t });
    }

    await t.commit();
    return res.status(201).json(product);
  } catch (err) {
    await t.rollback();
    console.error('inv.createProduct', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const product = await InvProduct.findOne({ where: byIdWhere(req, req.params.id) });
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    const allowed = [
      'name', 'sku', 'barcode', 'brand', 'category_id', 'supplier_id',
      'product_type', 'unit', 'cost_price', 'sell_price',
      'min_stock', 'max_stock', 'status', 'notes',
    ];
    const decimalFields = new Set(['cost_price', 'sell_price', 'min_stock', 'max_stock']);
    const updates = {};
    for (const f of allowed) {
      if (req.body[f] === undefined) continue;
      updates[f] = decimalFields.has(f) ? toDec(req.body[f]) : req.body[f];
    }
    if (updates.product_type !== undefined) {
      updates.product_type = normalizeProductType(updates.product_type);
    }
    await product.update(updates);
    return res.json(product);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await InvProduct.findOne({ where: byIdWhere(req, req.params.id) });
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    await product.update({ status: 'inactive' });
    return res.json({ message: 'Product deactivated.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const lowStock = async (req, res) => {
  try {
    const where = branchScope(req);
    where.status = 'active';
    where[Op.and] = sequelize.where(
      sequelize.col('current_stock'),
      Op.lte,
      sequelize.col('min_stock'),
    );
    const rows = await InvProduct.findAll({
      where,
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
      order: [['name', 'ASC']],
    });
    return res.json(rows.map((p) => ({
      ...p.toJSON(),
      suggested_order_qty: Math.max(0, toDec(p.max_stock) - toDec(p.current_stock)) || toDec(p.min_stock),
    })));
  } catch (err) {
    console.error('inv.lowStock', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Goods Received (only this increases stock) ───────────────────────────────
const listGoodsReceipts = async (req, res) => {
  try {
    const where = branchScope(req);
    if (req.query.status) where.status = req.query.status;
    const rows = await InvGoodsReceipt.findAll({
      where,
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
        { model: InvGoodsReceiptItem, as: 'items', include: [{ model: InvProduct, as: 'product', attributes: ['id', 'name', 'unit'] }] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 200,
    });
    return res.json(rows);
  } catch (err) {
    console.error('inv.listGRN', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const createGoodsReceipt = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const branchId = await requireBranchId(req, req.body.branch_id);
    const items = (Array.isArray(req.body.items) ? req.body.items : [])
      .filter((it) => it && it.product_id && toDec(it.quantity_received) > 0);
    if (!branchId || !items.length) {
      await t.rollback();
      return res.status(400).json({ message: 'A branch and at least one received product are required.' });
    }

    const grn = await InvGoodsReceipt.create({
      tenant_id: resolveTenantId(req),
      branch_id: branchId,
      supplier_id: req.body.supplier_id || null,
      grn_number: req.body.grn_number || nextDocNo('GRN'),
      received_date: req.body.received_date || localToday(),
      status: 'confirmed',
      notes: req.body.notes || null,
      created_by: req.user?.id,
      confirmed_by: req.user?.id,
      confirmed_at: new Date(),
    }, { transaction: t });

    for (const it of items) {
      const qty = toDec(it.quantity_received);
      const cost = toDec(it.unit_cost);
      await InvGoodsReceiptItem.create({
        goods_receipt_id: grn.id,
        product_id: it.product_id,
        quantity_received: qty,
        unit_cost: cost,
        line_total: qty * cost,
      }, { transaction: t });

      const product = await InvProduct.findOne({
        where: { id: it.product_id, ...tenantWhere(req) },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
      if (Number(product.branch_id) !== branchId) {
        throw Object.assign(new Error('Product does not belong to the selected branch.'), { status: 400 });
      }
      await applyStockChange({
        product,
        delta: qty,
        movementType: 'purchase',
        tenantId: resolveTenantId(req),
        branchId,
        userId: req.user?.id,
        referenceType: 'goods_receipt',
        referenceId: grn.id,
        remarks: `GRN ${grn.grn_number}`,
        transaction: t,
        allowNegative: true,
      });
      if (cost > 0) await product.update({ cost_price: cost }, { transaction: t });
    }

    await t.commit();
    const full = await InvGoodsReceipt.findByPk(grn.id, {
      include: [{ model: InvGoodsReceiptItem, as: 'items', include: [{ model: InvProduct, as: 'product' }] }],
    });
    return res.status(201).json(full);
  } catch (err) {
    await t.rollback();
    console.error('inv.createGRN', err.message);
    return res.status(err.status || 500).json({ message: err.message || 'Server error.' });
  }
};

module.exports = {
  listProducts, createProduct, updateProduct, deleteProduct, lowStock,
  listGoodsReceipts, createGoodsReceipt,
  // Stock operations continue in salonInventoryOpsController, which re-exports these.
  toDec, branchScope, resolveBranchId, requireBranchId, localToday, nextDocNo,
  normalizeProductType, PRODUCT_TYPES,
  ALLOW_NEGATIVE_ON_DAY_END, ALLOW_NEGATIVE_ON_ADJUSTMENT,
  tenantWhere, byIdWhere, resolveTenantId,
};
