const { Op } = require('sequelize');
const { Customer, Branch, Appointment, Service } = require('../models');
const { notifyCustomerRegistered } = require('../services/notificationService');

const handleCustomerWriteError = (err, res) => {
  if (!err) return false;

  if (err.name === 'SequelizeValidationError') {
    const message = err.errors?.[0]?.message || 'Validation failed.';
    res.status(400).json({ message });
    return true;
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    const conflictField = err.errors?.[0]?.path;
    if (conflictField === 'phone') {
      res.status(409).json({ message: 'A customer with this phone already exists for this branch.' });
      return true;
    }
    res.status(409).json({ message: 'Customer already exists.' });
    return true;
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    res.status(400).json({ message: 'Invalid branch selected.' });
    return true;
  }

  return false;
};

const getBranchWhere = (req) => {
  const where = {};
  if (req.userBranchId)    where.branch_id = req.userBranchId;
  else if (req.query.branchId) where.branch_id = req.query.branchId;
  return where;
};

const list = async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const where = getBranchWhere(req);
    if (req.query.search) {
      where[Op.or] = [
        { name:  { [Op.like]: `%${req.query.search}%` } },
        { phone: { [Op.like]: `%${req.query.search}%` } },
      ];
    }

    const { count, rows } = await Customer.findAndCountAll({
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

const getOne = async (req, res) => {
  try {
    const cust = await Customer.findByPk(req.params.id, {
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

    const cust = await Customer.create({ name, phone, email, branch_id });

    // Fire-and-forget welcome notification
    const branch = branch_id ? await Branch.findByPk(branch_id, { attributes: ['id', 'name', 'phone'] }) : null;
    notifyCustomerRegistered(cust, branch).catch(e => console.error('[notifyCustomerRegistered]', e.message));

    return res.status(201).json(cust);
  } catch (err) {
    if (handleCustomerWriteError(err, res)) return;
    return res.status(500).json({ message: 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const cust = await Customer.findByPk(req.params.id);
    if (!cust) return res.status(404).json({ message: 'Customer not found.' });

    const allowed = ['name', 'phone', 'email', 'branch_id'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    await cust.update(updates);
    return res.json(cust);
  } catch (err) {
    if (handleCustomerWriteError(err, res)) return;
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const cust = await Customer.findByPk(req.params.id);
    if (!cust) return res.status(404).json({ message: 'Customer not found.' });

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

    const cust = await Customer.findByPk(req.params.id);
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
