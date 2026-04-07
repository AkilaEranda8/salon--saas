const { Op, fn, col, literal } = require('sequelize');
const { Tenant, Subscription, Branch, Staff, User, Customer, Appointment, Payment } = require('../models');
const { invalidateTenantCache } = require('../middleware/tenantScope');
const bcrypt = require('bcryptjs');

// ── GET /api/platform/tenants ─────────────────────────────────────────────────
const listTenants = async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const where = {};
    if (req.query.plan)   where.plan   = req.query.plan;
    if (req.query.status) where.status = req.query.status;
    if (req.query.search) {
      where[Op.or] = [
        { name:  { [Op.like]: `%${req.query.search}%` } },
        { slug:  { [Op.like]: `%${req.query.search}%` } },
        { email: { [Op.like]: `%${req.query.search}%` } },
      ];
    }

    const { count, rows } = await Tenant.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['stripe_customer_id', 'stripe_subscription_id'] },
    });

    return res.json({ total: count, page, limit, tenants: rows });
  } catch (err) {
    console.error('platform.listTenants error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/platform/tenants/:id ─────────────────────────────────────────────
const getTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id, {
      include: [
        { model: Subscription, as: 'subscriptions', order: [['createdAt', 'DESC']], limit: 1 },
      ],
    });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

    const [branchCount, staffCount, customerCount] = await Promise.all([
      Branch.count({ where: { tenant_id: tenant.id } }),
      Staff.count({  where: { tenant_id: tenant.id, is_active: true } }),
      Customer.count({ where: { tenant_id: tenant.id } }),
    ]);

    return res.json({
      ...tenant.toJSON(),
      stats: { branches: branchCount, staff: staffCount, customers: customerCount },
    });
  } catch (err) {
    console.error('platform.getTenant error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── PATCH /api/platform/tenants/:id ──────────────────────────────────────────
const updateTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

    const allowed = ['status', 'plan', 'trial_ends_at', 'max_branches', 'max_staff', 'name', 'email'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    await tenant.update(updates);
    invalidateTenantCache(tenant.slug);
    return res.json(tenant);
  } catch (err) {
    console.error('platform.updateTenant error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── DELETE /api/platform/tenants/:id ─────────────────────────────────────────
const deleteTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

    // Soft-delete by suspending + marking cancelled
    await tenant.update({ status: 'cancelled' });
    invalidateTenantCache(tenant.slug);
    return res.json({ message: `Tenant ${tenant.slug} cancelled.` });
  } catch (err) {
    console.error('platform.deleteTenant error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/platform/tenants/:id/stats ──────────────────────────────────────
const tenantStats = async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

    const [branchCount, staffCount, userCount, customerCount] = await Promise.all([
      Branch.count({ where: { tenant_id: tenant.id } }),
      Staff.count({  where: { tenant_id: tenant.id, is_active: true } }),
      User.count({   where: { tenant_id: tenant.id, is_active: true } }),
      Customer.count({ where: { tenant_id: tenant.id } }),
    ]);

    return res.json({ branches: branchCount, staff: staffCount, users: userCount, customers: customerCount });
  } catch (err) {
    console.error('platform.tenantStats error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/platform/stats ───────────────────────────────────────────────────
const platformStats = async (req, res) => {
  try {
    const [totalTenants, activePaid, activeTrials, suspended] = await Promise.all([
      Tenant.count(),
      Tenant.count({ where: { status: 'active', plan: { [Op.ne]: 'trial' } } }),
      Tenant.count({ where: { plan: 'trial',  status: 'active' } }),
      Tenant.count({ where: { status: 'suspended' } }),
    ]);

    // Plan distribution
    const planRows = await Tenant.findAll({
      attributes: ['plan', [fn('COUNT', col('id')), 'cnt']],
      group: ['plan'], raw: true,
    });
    const byPlan = {};
    for (const r of planRows) byPlan[r.plan] = Number(r.cnt);

    // Status distribution
    const statusRows = await Tenant.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'cnt']],
      group: ['status'], raw: true,
    });
    const byStatus = {};
    for (const r of statusRows) byStatus[r.status] = Number(r.cnt);

    // Rough MRR estimate (basic=$29, pro=$79, enterprise=$299 — adjust as needed)
    const MRR_MAP = { basic: 29, pro: 79, enterprise: 299 };
    let estimatedMrr = 0;
    for (const [plan, price] of Object.entries(MRR_MAP)) {
      estimatedMrr += (byPlan[plan] || 0) * price;
    }

    // Recent sign-ups (last 10)
    const recentTenants = await Tenant.findAll({
      order: [['createdAt', 'DESC']],
      limit: 10,
      attributes: ['id', 'name', 'slug', 'plan', 'status', 'createdAt', 'trial_ends_at'],
    });

    return res.json({
      totalTenants, activePaid, activeTrials, suspended,
      estimatedMrr, byPlan, byStatus,
      recentTenants,
    });
  } catch (err) {
    console.error('platform.platformStats error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/platform/admins ──────────────────────────────────────────────────
const listAdmins = async (req, res) => {
  try {
    const admins = await User.findAll({
      where: { role: 'platform_admin' },
      attributes: ['id', 'name', 'username', 'email', 'createdAt', 'is_active'],
      order: [['createdAt', 'DESC']],
    });
    return res.json(admins);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/platform/admins ─────────────────────────────────────────────────
const createAdmin = async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username and password required.' });
    const exists = await User.findOne({ where: { username } });
    if (exists) return res.status(409).json({ message: 'Username already taken.' });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, username, email, password: hash, role: 'platform_admin', tenant_id: null });
    return res.status(201).json({ id: user.id, name: user.name, username: user.username, email: user.email });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── DELETE /api/platform/admins/:id ──────────────────────────────────────────
const deleteAdmin = async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ message: 'Cannot delete yourself.' });
    }
    const user = await User.findOne({ where: { id: req.params.id, role: 'platform_admin' } });
    if (!user) return res.status(404).json({ message: 'Admin not found.' });
    await user.destroy();
    return res.json({ message: 'Deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { listTenants, getTenant, updateTenant, deleteTenant, tenantStats, platformStats };
