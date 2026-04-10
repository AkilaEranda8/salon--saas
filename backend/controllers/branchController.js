const { Op } = require('sequelize');
const { Branch, User, Staff, Customer } = require('../models');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');

const list = async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    const { count, rows } = await Branch.findAndCountAll({
      where:  tenantWhere(req),
      limit,
      offset,
      order: [['name', 'ASC']],
    });

    return res.json({ total: count, page, limit, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const getOne = async (req, res) => {
  try {
    const branch = await Branch.findOne({ where: byIdWhere(req, req.params.id) });
    if (!branch) return res.status(404).json({ message: 'Branch not found.' });
    return res.json(branch);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const { name, address, phone, manager_name, color } = req.body;
    if (!name) return res.status(400).json({ message: 'Branch name is required.' });

    const branch = await Branch.create({
      name,
      address,
      phone,
      manager_name,
      color,
      tenant_id: resolveTenantId(req),
    });
    return res.status(201).json(branch);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const branch = await Branch.findOne({ where: byIdWhere(req, req.params.id) });
    if (!branch) return res.status(404).json({ message: 'Branch not found.' });

    const allowed = ['name', 'address', 'phone', 'email', 'color', 'open_time', 'close_time'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    await branch.update(updates);
    return res.json(branch);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const branch = await Branch.findOne({ where: byIdWhere(req, req.params.id) });
    if (!branch) return res.status(404).json({ message: 'Branch not found.' });

    await branch.destroy();
    return res.json({ message: 'Branch deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const toggleStatus = async (req, res) => {
  try {
    const branch = await Branch.findOne({ where: byIdWhere(req, req.params.id) });
    if (!branch) return res.status(404).json({ message: 'Branch not found.' });

    const newStatus = branch.status === 'active' ? 'inactive' : 'active';
    await branch.update({ status: newStatus });
    return res.json(branch);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, getOne, create, update, remove, toggleStatus };
