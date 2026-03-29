const { Op } = require('sequelize');
const { Discount, Branch } = require('../models');
const { computePromoAmount, isDiscountActive, activeDiscountWhere } = require('../services/discountHelpers');

/** List discounts for admin (all or branch-scoped). */
const list = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const offset = (page - 1) * limit;
    const where = {};
    if (req.query.branchId) {
      where.branch_id = req.query.branchId === 'all' ? { [Op.eq]: null } : req.query.branchId;
    } else if (req.userBranchId) {
      where[Op.or] = [{ branch_id: null }, { branch_id: Number(req.userBranchId) }];
    }
    if (req.query.active === '1') where.is_active = true;

    const { count, rows } = await Discount.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'], required: false }],
    });
    return res.json({ total: count, page, limit, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/** Active discounts for payment form (branch + date). */
const listForPayment = async (req, res) => {
  try {
    const qRaw = req.query.branchId;
    const q = qRaw === undefined || qRaw === null || qRaw === ''
      ? null
      : (Array.isArray(qRaw) ? qRaw[0] : qRaw);
    // Staff/manager: always use JWT branch; admins use query.branchId
    let branchId = req.userBranchId != null && req.userBranchId !== ''
      ? Number(req.userBranchId)
      : (q != null && q !== '' ? Number(q) : null);
    if (branchId != null && Number.isNaN(branchId)) branchId = null;
    if (!branchId) {
      return res.status(400).json({ message: 'branchId is required.' });
    }
    const rows = await Discount.findAll({
      where: activeDiscountWhere(branchId),
      order: [['name', 'ASC']],
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'], required: false }],
    });
    return res.json({ data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const getOne = async (req, res) => {
  try {
    const row = await Discount.findByPk(req.params.id, {
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'], required: false }],
    });
    if (!row) return res.status(404).json({ message: 'Discount not found.' });
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const {
      branch_id, name, code, discount_type, value, min_bill,
      max_discount_amount, starts_at, ends_at, is_active,
    } = req.body;
    if (!name || value === undefined || value === '') {
      return res.status(400).json({ message: 'name and value are required.' });
    }
    if (req.userBranchId && branch_id && Number(branch_id) !== Number(req.userBranchId)) {
      return res.status(403).json({ message: 'You can only create discounts for your branch.' });
    }
    const row = await Discount.create({
      branch_id: branch_id || null,
      name: String(name).trim(),
      code: code ? String(code).trim() : null,
      discount_type: discount_type === 'fixed' ? 'fixed' : 'percent',
      value,
      min_bill: min_bill ?? 0,
      max_discount_amount: max_discount_amount ?? null,
      starts_at: starts_at || null,
      ends_at: ends_at || null,
      is_active: is_active !== false,
    });
    return res.status(201).json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const row = await Discount.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Discount not found.' });
    if (req.userBranchId && row.branch_id != null && Number(row.branch_id) !== Number(req.userBranchId)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    const allowed = ['branch_id', 'name', 'code', 'discount_type', 'value', 'min_bill', 'max_discount_amount', 'starts_at', 'ends_at', 'is_active'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (updates.discount_type) updates.discount_type = updates.discount_type === 'fixed' ? 'fixed' : 'percent';
    await row.update(updates);
    return res.json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const row = await Discount.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Discount not found.' });
    if (req.userBranchId && row.branch_id != null && Number(row.branch_id) !== Number(req.userBranchId)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    await row.destroy();
    return res.json({ message: 'Deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

/** Preview computed amount (server truth). */
const preview = async (req, res) => {
  try {
    const { id } = req.params;
    const gross = parseFloat(req.query.gross || req.body.gross || 0);
    const branchId = req.userBranchId || req.query.branchId;
    const disc = await Discount.findByPk(id);
    if (!disc) return res.status(404).json({ message: 'Discount not found.' });
    if (!isDiscountActive(disc, branchId)) {
      return res.json({ amount: 0, applicable: false });
    }
    const amount = computePromoAmount(disc, gross);
    return res.json({ amount, applicable: amount > 0, discount: disc });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  list, listForPayment, getOne, create, update, remove, preview,
};
