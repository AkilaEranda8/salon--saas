'use strict';

const { Op } = require('sequelize');
const {
  InvCategory, InvSupplier, InvProduct, InvStockMovement,
  InvPurchaseOrder, InvPurchaseOrderItem,
  InvGoodsReceipt, InvGoodsReceiptItem,
  InvConsumption, InvDayEndBatch, InvDayEndBatchItem,
  InvStockAdjustment, InvStockCount, InvStockCountItem,
  InvSettings, Branch, Staff, Service, Appointment, User,
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

const nextDocNo = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;

async function getSettings(req, branchId) {
  const tenantId = resolveTenantId(req);
  const where = { tenant_id: tenantId };
  if (branchId) where.branch_id = branchId;
  let row = await InvSettings.findOne({ where });
  if (!row) {
    row = await InvSettings.create({
      tenant_id: tenantId,
      branch_id: branchId || null,
    });
  }
  return row;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
const dashboard = async (req, res) => {
  try {
    const where = branchScope(req);
    const products = await InvProduct.findAll({ where: { ...where, status: 'active' } });
    const lowStock = products.filter((p) => toDec(p.current_stock) <= toDec(p.min_stock));
    const today = new Date().toISOString().slice(0, 10);
    const pendingConsumption = await InvConsumption.count({
      where: { ...where, status: 'pending', consumption_date: today },
    });
    const openPos = await InvPurchaseOrder.count({
      where: { ...where, status: { [Op.in]: ['draft', 'ordered', 'partial'] } },
    });
    const stockValue = products.reduce(
      (s, p) => s + toDec(p.current_stock) * toDec(p.cost_price),
      0,
    );
    return res.json({
      totalProducts: products.length,
      lowStockCount: lowStock.length,
      pendingConsumption,
      openPurchaseOrders: openPos,
      stockValue: Math.round(stockValue * 100) / 100,
      lowStockItems: lowStock.slice(0, 10),
    });
  } catch (err) {
    console.error('inv.dashboard', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Categories ───────────────────────────────────────────────────────────────
const listCategories = async (req, res) => {
  try {
    const where = tenantWhere(req);
    if (req.query.type) where.type = req.query.type;
    const rows = await InvCategory.findAll({ where, order: [['name', 'ASC']] });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const createCategory = async (req, res) => {
  try {
    const { name, type, description } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    const row = await InvCategory.create({
      tenant_id: resolveTenantId(req),
      name: String(name).trim(),
      type: type || 'consumable',
      description: description || null,
    });
    return res.status(201).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const updateCategory = async (req, res) => {
  try {
    const row = await InvCategory.findOne({ where: byIdWhere(req, req.params.id) });
    if (!row) return res.status(404).json({ message: 'Category not found.' });
    const allowed = ['name', 'type', 'description', 'is_active'];
    const updates = {};
    for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
    await row.update(updates);
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const row = await InvCategory.findOne({ where: byIdWhere(req, req.params.id) });
    if (!row) return res.status(404).json({ message: 'Category not found.' });
    await row.destroy();
    return res.json({ message: 'Deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Suppliers ────────────────────────────────────────────────────────────────
const listSuppliers = async (req, res) => {
  try {
    const rows = await InvSupplier.findAll({
      where: tenantWhere(req),
      order: [['name', 'ASC']],
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const createSupplier = async (req, res) => {
  try {
    const { name, contact_person, phone, email, address, notes } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    const row = await InvSupplier.create({
      tenant_id: resolveTenantId(req),
      name: String(name).trim(),
      contact_person, phone, email, address, notes,
    });
    return res.status(201).json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const updateSupplier = async (req, res) => {
  try {
    const row = await InvSupplier.findOne({ where: byIdWhere(req, req.params.id) });
    if (!row) return res.status(404).json({ message: 'Supplier not found.' });
    const allowed = ['name', 'contact_person', 'phone', 'email', 'address', 'notes', 'is_active'];
    const updates = {};
    for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
    await row.update(updates);
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const deleteSupplier = async (req, res) => {
  try {
    const row = await InvSupplier.findOne({ where: byIdWhere(req, req.params.id) });
    if (!row) return res.status(404).json({ message: 'Supplier not found.' });
    await row.destroy();
    return res.json({ message: 'Deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

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
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
        { model: InvCategory, as: 'category', attributes: ['id', 'name', 'type'] },
        { model: InvSupplier, as: 'supplier', attributes: ['id', 'name'] },
      ],
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
    const branchId = resolveBranchId(req, req.body.branch_id);
    if (!branchId || !req.body.name) {
      await t.rollback();
      return res.status(400).json({ message: 'branch_id and name are required.' });
    }
    const opening = toDec(req.body.opening_stock ?? req.body.current_stock, 0);
    const product = await InvProduct.create({
      tenant_id: resolveTenantId(req),
      branch_id: Number(branchId),
      category_id: req.body.category_id || null,
      supplier_id: req.body.supplier_id || null,
      name: String(req.body.name).trim(),
      sku: req.body.sku || null,
      barcode: req.body.barcode || null,
      brand: req.body.brand || null,
      product_type: req.body.product_type || 'consumable',
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
      await applyStockChange({
        product,
        delta: 0, // already set current_stock; record ledger with 0 change from opening
        movementType: 'opening',
        tenantId: resolveTenantId(req),
        branchId: Number(branchId),
        userId: req.user?.id,
        referenceType: 'product',
        referenceId: product.id,
        remarks: 'Opening stock',
        transaction: t,
        allowNegative: true,
      });
      // Fix: opening movement should show opening as both open/close with qty = opening
      await InvStockMovement.update(
        {
          opening_qty: 0,
          quantity_changed: opening,
          closing_qty: opening,
        },
        { where: { product_id: product.id, movement_type: 'opening' }, transaction: t },
      );
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
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
        { model: InvCategory, as: 'category', attributes: ['id', 'name'] },
        { model: InvSupplier, as: 'supplier', attributes: ['id', 'name'] },
      ],
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

// ── Purchase Orders ──────────────────────────────────────────────────────────
const listPurchaseOrders = async (req, res) => {
  try {
    const where = branchScope(req);
    if (req.query.status) where.status = req.query.status;
    const rows = await InvPurchaseOrder.findAll({
      where,
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
        { model: InvSupplier, as: 'supplier', attributes: ['id', 'name'] },
        { model: InvPurchaseOrderItem, as: 'items', include: [{ model: InvProduct, as: 'product', attributes: ['id', 'name', 'unit'] }] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 200,
    });
    return res.json(rows);
  } catch (err) {
    console.error('inv.listPO', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const createPurchaseOrder = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const branchId = resolveBranchId(req, req.body.branch_id);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!branchId || !items.length) {
      await t.rollback();
      return res.status(400).json({ message: 'branch_id and items are required.' });
    }
    let total = 0;
    const po = await InvPurchaseOrder.create({
      tenant_id: resolveTenantId(req),
      branch_id: Number(branchId),
      supplier_id: req.body.supplier_id || null,
      po_number: req.body.po_number || nextDocNo('PO'),
      status: req.body.status || 'draft',
      order_date: req.body.order_date || new Date().toISOString().slice(0, 10),
      expected_date: req.body.expected_date || null,
      notes: req.body.notes || null,
      created_by: req.user?.id,
      total_cost: 0,
    }, { transaction: t });

    for (const it of items) {
      const qty = toDec(it.quantity_ordered);
      const cost = toDec(it.unit_cost);
      const line = qty * cost;
      total += line;
      await InvPurchaseOrderItem.create({
        purchase_order_id: po.id,
        product_id: it.product_id,
        quantity_ordered: qty,
        unit_cost: cost,
        line_total: line,
      }, { transaction: t });
    }
    await po.update({ total_cost: total }, { transaction: t });
    await t.commit();
    const full = await InvPurchaseOrder.findByPk(po.id, {
      include: [{ model: InvPurchaseOrderItem, as: 'items', include: [{ model: InvProduct, as: 'product' }] }],
    });
    return res.status(201).json(full);
  } catch (err) {
    await t.rollback();
    console.error('inv.createPO', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const updatePurchaseOrder = async (req, res) => {
  try {
    const po = await InvPurchaseOrder.findOne({ where: byIdWhere(req, req.params.id) });
    if (!po) return res.status(404).json({ message: 'PO not found.' });
    const allowed = ['status', 'supplier_id', 'order_date', 'expected_date', 'notes'];
    const updates = {};
    for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
    await po.update(updates);
    return res.json(po);
  } catch (err) {
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
        { model: InvSupplier, as: 'supplier', attributes: ['id', 'name'] },
        { model: InvPurchaseOrder, as: 'purchaseOrder', attributes: ['id', 'po_number'] },
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
    const branchId = resolveBranchId(req, req.body.branch_id);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!branchId || !items.length) {
      await t.rollback();
      return res.status(400).json({ message: 'branch_id and items are required.' });
    }
    const settings = await getSettings(req, branchId);
    const confirmNow = req.body.confirm === true || req.body.status === 'confirmed';

    const grn = await InvGoodsReceipt.create({
      tenant_id: resolveTenantId(req),
      branch_id: Number(branchId),
      purchase_order_id: req.body.purchase_order_id || null,
      supplier_id: req.body.supplier_id || null,
      grn_number: req.body.grn_number || nextDocNo('GRN'),
      received_date: req.body.received_date || new Date().toISOString().slice(0, 10),
      status: confirmNow ? 'confirmed' : 'draft',
      notes: req.body.notes || null,
      created_by: req.user?.id,
      confirmed_by: confirmNow ? req.user?.id : null,
      confirmed_at: confirmNow ? new Date() : null,
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

      if (confirmNow && qty > 0) {
        const product = await InvProduct.findOne({
          where: { id: it.product_id, ...tenantWhere(req) },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
        await applyStockChange({
          product,
          delta: qty,
          movementType: 'purchase',
          tenantId: resolveTenantId(req),
          branchId: Number(branchId),
          userId: req.user?.id,
          referenceType: 'goods_receipt',
          referenceId: grn.id,
          remarks: `GRN ${grn.grn_number}`,
          transaction: t,
          allowNegative: !!settings.allow_negative_stock,
        });
        if (cost > 0) await product.update({ cost_price: cost }, { transaction: t });

        if (req.body.purchase_order_id) {
          const poItem = await InvPurchaseOrderItem.findOne({
            where: { purchase_order_id: req.body.purchase_order_id, product_id: it.product_id },
            transaction: t,
          });
          if (poItem) {
            await poItem.update({
              quantity_received: toDec(poItem.quantity_received) + qty,
            }, { transaction: t });
          }
        }
      }
    }

    if (confirmNow && req.body.purchase_order_id) {
      const po = await InvPurchaseOrder.findByPk(req.body.purchase_order_id, {
        include: [{ model: InvPurchaseOrderItem, as: 'items' }],
        transaction: t,
      });
      if (po) {
        const allReceived = po.items.every(
          (i) => toDec(i.quantity_received) >= toDec(i.quantity_ordered),
        );
        const anyReceived = po.items.some((i) => toDec(i.quantity_received) > 0);
        await po.update({
          status: allReceived ? 'received' : anyReceived ? 'partial' : po.status,
        }, { transaction: t });
      }
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

const confirmGoodsReceipt = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const grn = await InvGoodsReceipt.findOne({
      where: byIdWhere(req, req.params.id),
      include: [{ model: InvGoodsReceiptItem, as: 'items' }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!grn) { await t.rollback(); return res.status(404).json({ message: 'GRN not found.' }); }
    if (grn.status === 'confirmed') { await t.rollback(); return res.status(400).json({ message: 'Already confirmed.' }); }

    const settings = await getSettings(req, grn.branch_id);
    for (const it of grn.items) {
      const qty = toDec(it.quantity_received);
      if (qty <= 0) continue;
      const product = await InvProduct.findOne({
        where: { id: it.product_id, ...tenantWhere(req) },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!product) continue;
      await applyStockChange({
        product,
        delta: qty,
        movementType: 'purchase',
        tenantId: resolveTenantId(req),
        branchId: grn.branch_id,
        userId: req.user?.id,
        referenceType: 'goods_receipt',
        referenceId: grn.id,
        remarks: `GRN ${grn.grn_number}`,
        transaction: t,
        allowNegative: !!settings.allow_negative_stock,
      });
    }
    await grn.update({
      status: 'confirmed',
      confirmed_by: req.user?.id,
      confirmed_at: new Date(),
    }, { transaction: t });
    await t.commit();
    return res.json(grn);
  } catch (err) {
    await t.rollback();
    return res.status(err.status || 500).json({ message: err.message || 'Server error.' });
  }
};

module.exports = {
  dashboard,
  listCategories, createCategory, updateCategory, deleteCategory,
  listSuppliers, createSupplier, updateSupplier, deleteSupplier,
  listProducts, createProduct, updateProduct, deleteProduct, lowStock,
  listPurchaseOrders, createPurchaseOrder, updatePurchaseOrder,
  listGoodsReceipts, createGoodsReceipt, confirmGoodsReceipt,
  // continued in salonInventoryController2 — re-export after merge
  toDec, branchScope, resolveBranchId, getSettings, nextDocNo, tenantWhere, byIdWhere, resolveTenantId,
};
