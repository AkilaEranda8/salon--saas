const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { User, Branch, Staff } = require('../models');

/**
 * Portal `User.branch_id` may be unset while the linked `Staff` row has a branch.
 * Mobile + JWT need a single effective branch for scoping.
 */
async function resolveEffectiveBranchId(user) {
  if (user.branch_id != null && user.branch_id !== '') {
    return user.branch_id;
  }
  if (!user.staff_id) return null;
  const st = await Staff.findByPk(user.staff_id, { attributes: ['branch_id'] });
  return st?.branch_id ?? null;
}

async function branchPayloadFor(effectiveBranchId, existingBranch) {
  if (!effectiveBranchId) return null;
  if (existingBranch && Number(existingBranch.id) === Number(effectiveBranchId)) {
    return existingBranch;
  }
  return Branch.findByPk(effectiveBranchId, { attributes: ['id', 'name', 'color'] });
}

// ─── POST /api/auth/register ─────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { username, password, name, role, branch_id, color } = req.body;

    if (!username || !password || !name) {
      return res.status(400).json({ message: 'Username, password, and name are required.' });
    }

    const existing = await User.findOne({ where: { username } });
    if (existing) {
      return res.status(409).json({ message: 'Username already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Only allow valid roles; prevent privilege escalation
    const ALLOWED_ROLES = ['staff', 'manager', 'admin'];
    // Only superadmin can create other superadmins
    if (role === 'superadmin' && req.user?.role !== 'superadmin') {
      return res.status(403).json({ message: 'Only superadmins can create superadmin accounts.' });
    }
    const assignedRole = ALLOWED_ROLES.includes(role) || role === 'superadmin' ? role : 'staff';

    const user = await User.create({
      username,
      password: hashedPassword,
      name,
      role:      assignedRole,
      branch_id: branch_id || null,
      color:     color || '#6366f1',
    });

    const payload = {
      id:       user.id,
      username: user.username,
      role:     user.role,
      branchId: user.branch_id,
      name:     user.name,
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

    const user = await User.findOne({
      where: { username, is_active: true },
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name', 'color'] }],
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const effectiveBranchId = await resolveEffectiveBranchId(user);
    const branchJson = await branchPayloadFor(effectiveBranchId, user.branch);

    const payload = {
      id:       user.id,
      username: user.username,
      role:     user.role,
      branchId: effectiveBranchId,
      name:     user.name,
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
        branchId: effectiveBranchId,
        avatar:   user.avatar,
        color:    user.color,
        branch:   branchJson,
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
      include:    [{ model: Branch, as: 'branch', attributes: ['id', 'name', 'color'] }],
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const effectiveBranchId = await resolveEffectiveBranchId(user);
    const branchJson = await branchPayloadFor(effectiveBranchId, user.branch);

    const plain = user.get({ plain: true });
    plain.branchId = effectiveBranchId;
    plain.branch = branchJson;

    return res.json({ user: plain });
  } catch (err) {
    console.error('getMe error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { register, login, logout, getMe };
