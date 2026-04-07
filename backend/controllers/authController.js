const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { User, Branch, Tenant } = require('../models');

// ─── POST /api/auth/register ─────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { username, password, name, role, branch_id, color } = req.body;

    if (!username || !password || !name) {
      return res.status(400).json({ message: 'Username, password, and name are required.' });
    }

    // Scope username uniqueness to this tenant
    const tenantId = req.tenant?.id ?? req.user?.tenantId ?? null;
    const existing = await User.findOne({ where: { username, tenant_id: tenantId } });
    if (existing) {
      return res.status(409).json({ message: 'Username already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Only allow valid roles; prevent privilege escalation
    const ALLOWED_ROLES = ['staff', 'manager', 'admin'];
    // Only superadmin can create other superadmins
    if (role === 'superadmin' && req.user?.role !== 'superadmin' && req.user?.role !== 'platform_admin') {
      return res.status(403).json({ message: 'Only superadmins can create superadmin accounts.' });
    }
    const assignedRole = ALLOWED_ROLES.includes(role) || role === 'superadmin' ? role : 'staff';

    const user = await User.create({
      username,
      password:  hashedPassword,
      name,
      role:      assignedRole,
      branch_id: branch_id || null,
      color:     color || '#6366f1',
      tenant_id: tenantId,
    });

    const payload = {
      id:         user.id,
      username:   user.username,
      role:       user.role,
      branchId:   user.branch_id,
      name:       user.name,
      tenantId:   user.tenant_id,
      tenantSlug: req.tenant?.slug ?? null,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      user: {
        id:       user.id,
        name:     user.name,
        username: user.username,
        role:     user.role,
        branchId: user.branch_id,
        avatar:   user.avatar,
        color:    user.color,
        tenantId: user.tenant_id,
      },
    });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ─── POST /api/auth/login ────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const whereClause = { username, is_active: true };

    if (req.tenant) {
      // Normal tenant login — scope to this tenant
      whereClause.tenant_id = req.tenant.id;
    } else {
      // No tenant slug — only platform_admin accounts can log in this way
      whereClause.role = 'platform_admin';
    }

    const user = await User.findOne({
      where:   whereClause,
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'color'] },
        { model: Tenant, as: 'tenant', attributes: ['id', 'slug', 'name', 'plan', 'status', 'trial_ends_at'] },
      ],
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const payload = {
      id:         user.id,
      username:   user.username,
      role:       user.role,
      branchId:   user.branch_id,
      name:       user.name,
      tenantId:   user.tenant_id,
      tenantSlug: user.tenant?.slug ?? null,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({
      user: {
        id:       user.id,
        name:     user.name,
        username: user.username,
        role:     user.role,
        branchId: user.branch_id,
        avatar:   user.avatar,
        color:    user.color,
        branch:   user.branch,
        tenant:   user.tenant,
        tenantId: user.tenant_id,
      },
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
const logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  return res.json({ message: 'Logged out.' });
};

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] },
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'color'] },
        { model: Tenant, as: 'tenant', attributes: ['id', 'slug', 'name', 'plan', 'status', 'trial_ends_at'] },
      ],
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.json({ user });
  } catch (err) {
    console.error('getMe error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { register, login, logout, getMe };
