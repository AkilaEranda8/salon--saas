const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, Branch } = require('../models');
const { tenantWhere } = require('../utils/tenantScope');

const list = async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const where = tenantWhere(req);
    if (req.query.role)     where.role      = req.query.role;
    if (req.query.branchId) where.branch_id = req.query.branchId;

    const { count, rows } = await User.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['password'] },
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
    });

    return res.json({ total: count, page, limit, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const { username, password, name, role, branch_id, is_active } = req.body;

    if (!username || !password || !name) {
      return res.status(400).json({ message: 'Username, password and name are required.' });
    }

    const existing = await User.findOne({ where: { username } });
    if (existing) {
      return res.status(409).json({ message: 'Username already exists.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username, password: hash, name,
      role: role || 'staff',
      branch_id: branch_id || null,
      is_active: is_active !== false,
    });

    const result = user.toJSON();
    delete result.password;
    return res.status(201).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const { name, username, role, branch_id, is_active, password } = req.body;
    const updates = {};
    if (name !== undefined)      updates.name      = name;
    if (username !== undefined)  updates.username   = username;
    // Only superadmin may change roles to prevent privilege escalation
    if (role !== undefined) {
      if (req.user?.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only superadmins may change user roles.' });
      }
      updates.role = role;
    }
    if (branch_id !== undefined) updates.branch_id  = branch_id || null;
    if (is_active !== undefined) updates.is_active  = is_active;
    if (password)                updates.password   = await bcrypt.hash(password, 10);

    // Check username uniqueness before updating
    if (username !== undefined && username !== user.username) {
      const existing = await User.findOne({ where: { username } });
      if (existing) return res.status(409).json({ message: 'Username already exists.' });
    }

    await user.update(updates);
    const result = user.toJSON();
    delete result.password;
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const changePassword = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    const hash = await bcrypt.hash(password, 10);
    await user.update({ password: hash });
    return res.json({ message: 'Password updated.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.role === 'superadmin') {
      return res.status(403).json({ message: 'Cannot delete superadmin.' });
    }
    await user.destroy();
    return res.json({ message: 'User deleted.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, create, update, changePassword, remove };
