const { Op } = require('sequelize');
const { Inventory, Branch } = require('../models');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');

const getBranchWhere = (req) => {
  const where = tenantWhere(req);
  if (req.userBranchId)    where.branch_id = req.userBranchId;
  else if (req.query.branchId) where.branch_id = req.query.branchId;
  return where;
};

const list = async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const where  = getBranchWhere(req);
    if (req.query.category) where.category = req.query.category;

    const { count, rows } = await Inventory.findAndCountAll({
      where,
      limit,
      offset,
      order: [['name', 'ASC']],
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
    });

    return res.json({ total: count, page, limit, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const lowStock = async (req, res) => {
  try {
    const where = getBranchWhere(req);
    // quantity <= min_quantity
    const items = await Inventory.findAll({
      where: { ...where, quantity: { [Op.lte]: Inventory.sequelize.col('min_quantity') } },
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
    });
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const toDecimal = (value, fallback = 0) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const create = async (req, res) => {
  try {
    const { branch_id, name, category, quantity, min_quantity, unit, cost_price, sell_price } = req.body;
    const effectiveBranchId = req.userBranchId || branch_id || req.user?.branch_id || req.user?.branchId || null;
    if (!effectiveBranchId || !name) return res.status(400).json({ message: 'branch_id and name are required.' });
    if (req.userBranchId && Number(effectiveBranchId) !== Number(req.userBranchId)) {
      return res.status(403).json({ message: 'You can only create inventory in your branch.' });
    }

    const item = await Inventory.create({
      branch_id: Number(effectiveBranchId),
      name: String(name).trim(),
      category: category || null,
      quantity: toDecimal(quantity, 0),
      min_quantity: toDecimal(min_quantity, 0),
      unit: unit || null,
      cost_price: toDecimal(cost_price, 0),
      sell_price: toDecimal(sell_price, 0),
      tenant_id: resolveTenantId(req),
    });
    return res.status(201).json(item);
  } catch (err) {
    console.error('inventory.create failed:', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const item = await Inventory.findOne({ where: byIdWhere(req, req.params.id) });
    if (!item) return res.status(404).json({ message: 'Inventory item not found.' });

    const allowed = ['name', 'category', 'quantity', 'unit', 'min_quantity', 'cost_price', 'sell_price', 'notes'];
    const decimalFields = new Set(['quantity', 'min_quantity', 'cost_price', 'sell_price']);
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] === undefined) continue;
      updates[field] = decimalFields.has(field) ? toDecimal(req.body[field], 0) : req.body[field];
    }
    await item.update(updates);
    return res.json(item);
  } catch (err) {
    console.error('inventory.update failed:', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const item = await Inventory.findOne({ where: byIdWhere(req, req.params.id) });
    if (!item) return res.status(404).json({ message: 'Inventory item not found.' });

    await item.destroy();
    return res.json({ message: 'Item deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const adjust = async (req, res) => {
  try {
    const { delta } = req.body;
    if (typeof delta !== 'number') {
      return res.status(400).json({ message: 'delta must be a number.' });
    }

    const item = await Inventory.findOne({ where: byIdWhere(req, req.params.id) });
    if (!item) return res.status(404).json({ message: 'Inventory item not found.' });

    const newQty = parseFloat(item.quantity) + delta;
    if (newQty < 0) return res.status(400).json({ message: 'Quantity cannot go below zero.' });

    await item.update({ quantity: newQty });
    return res.json(item);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, lowStock, create, update, remove, adjust };
