const { Op } = require('sequelize');
const { Customer, Branch, Appointment, Service } = require('../models');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');
const {
  ensureWalkInCustomerForTenant,
  sortWalkInFirst,
  WALK_IN_CUSTOMER_NAME,
} = require('../services/ensureWalkInCustomer');

/**
 * Branch filter for customers:
 * - Explicit ?branchId= filters that branch + shared (null branch) customers.
 * - Without ?branchId=, return all customers for the tenant (booking / inventory pickers).
 * - JWT branch is NOT applied on list — managers need full salon customer pickers.
 */
const getCustomerListWhere = (req) => {
  const where = tenantWhere(req);
  const and = [];

  const branchId = req.query.branchId || null;
  if (branchId) {
    and.push({
      [Op.or]: [
        { branch_id: branchId },
        { branch_id: null },
      ],
    });
  }

  const q = String(req.query.search || req.query.q || '').trim();
  if (q) {
    and.push({
      [Op.or]: [
        { name:  { [Op.like]: `%${q}%` } },
        { phone: { [Op.like]: `%${q}%` } },
        { email: { [Op.like]: `%${q}%` } },
      ],
    });
  }

  if (and.length === 1) Object.assign(where, and[0]);
  else if (and.length > 1) where[Op.and] = and;

  return where;
};

const list = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (tenantId) {
      await ensureWalkInCustomerForTenant(tenantId);
    }

    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 20, 2000);
    const offset = (page - 1) * limit;

    const where = getCustomerListWhere(req);

    const { count, rows } = await Customer.findAndCountAll({
      where,
      limit,
      offset,
      order: [
        // Walk-in Customer always first within the page
        [Customer.sequelize.literal(
          `CASE WHEN \`Customer\`.\`name\` = ${Customer.sequelize.escape(WALK_IN_CUSTOMER_NAME)} THEN 0 ELSE 1 END`
        ), 'ASC'],
        ['name', 'ASC'],
      ],
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
    });

    return res.json({ total: count, page, limit, data: sortWalkInFirst(rows) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const getOne = async (req, res) => {
  try {
    const cust = await Customer.findOne({
      where: byIdWhere(req, req.params.id),
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
        {
          model: Appointment,
          as: 'appointments',
          limit: 10,
          order: [['date', 'DESC']],
          include: [{ model: Service, as: 'service', attributes: ['id', 'name'] }],
        },
      ],
    });

    if (!cust) return res.status(404).json({ message: 'Customer not found.' });
    return res.json(cust);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const { name, phone, email, branch_id } = req.body;
    if (!name) return res.status(400).json({ message: 'Customer name is required.' });

    const effectiveBranchId = req.userBranchId || branch_id || req.user?.branchId || null;
    if (req.userBranchId && effectiveBranchId && Number(effectiveBranchId) !== Number(req.userBranchId)) {
      return res.status(403).json({ message: 'You can only create customers in your branch.' });
    }

    const emailNorm = email != null && String(email).trim() !== '' ? String(email).trim() : null;

    const cust = await Customer.create({
      name,
      phone,
      email: emailNorm,
      branch_id: effectiveBranchId,
      tenant_id: resolveTenantId(req),
    });
    return res.status(201).json(cust);
  } catch (err) {
    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({ message: err.errors?.[0]?.message || 'Validation failed.' });
    }
    return res.status(500).json({ message: 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const cust = await Customer.findOne({ where: byIdWhere(req, req.params.id) });
    if (!cust) return res.status(404).json({ message: 'Customer not found.' });

    const allowed = ['name', 'phone', 'email', 'branch_id'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.email !== undefined) {
      updates.email = updates.email != null && String(updates.email).trim() !== ''
        ? String(updates.email).trim()
        : null;
    }
    await cust.update(updates);
    return res.json(cust);
  } catch (err) {
    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({ message: err.errors?.[0]?.message || 'Validation failed.' });
    }
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const cust = await Customer.findOne({ where: byIdWhere(req, req.params.id) });
    if (!cust) return res.status(404).json({ message: 'Customer not found.' });
    if (cust.name === WALK_IN_CUSTOMER_NAME) {
      return res.status(400).json({ message: 'Walk-in Customer is a system record and cannot be deleted.' });
    }

    await cust.destroy();
    return res.json({ message: 'Customer deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const loyalty = async (req, res) => {
  try {
    const { action, points } = req.body;
    if (!['add', 'redeem'].includes(action) || !Number.isInteger(points) || points <= 0) {
      return res.status(400).json({ message: 'action must be "add" or "redeem" and points must be a positive integer.' });
    }

    const cust = await Customer.findOne({ where: byIdWhere(req, req.params.id) });
    if (!cust) return res.status(404).json({ message: 'Customer not found.' });

    if (action === 'redeem') {
      if (cust.loyalty_points < points) {
        return res.status(400).json({ message: 'Insufficient loyalty points.' });
      }
      await cust.update({ loyalty_points: cust.loyalty_points - points });
    } else {
      await cust.update({ loyalty_points: cust.loyalty_points + points });
    }

    return res.json({ loyalty_points: cust.loyalty_points, action, points });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, getOne, create, update, remove, loyalty };
