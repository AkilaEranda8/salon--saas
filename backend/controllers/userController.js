const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, Branch } = require('../models');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');
const kc     = require('../utils/keycloakAdmin');

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
    const { username, password, name, role, branch_id, is_active, email } = req.body;
    const tenantId = resolveTenantId(req);

    if (!username || !password || !name) {
      return res.status(400).json({ message: 'Username, password and name are required.' });
    }

    const existing = await User.findOne({
      where: {
        username,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
    });
    if (existing) {
      return res.status(409).json({ message: 'Username already exists.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username, password: hash, name,
      email:                email || null,
      role:                 role || 'staff',
      branch_id:            branch_id || null,
      is_active:            is_active !== false,
      tenant_id:            tenantId,
      must_change_password: true,
    });

    const result = user.toJSON();
    delete result.password;

    // Sync to Keycloak — group MUST exist before user is created inside it
    if (process.env.KEYCLOAK_URL) {
      (async () => {
        try {
          const tenantSlug = req.tenant?.slug ?? '';
          const tenantName = req.tenant?.name  ?? tenantSlug;

          // Step 1: ensure tenant group exists (idempotent — safe to call every time)
          if (tenantSlug) {
            await kc.createOrGetGroup(tenantSlug, tenantName);
          }

          // Step 2: create user and add them to the group
          await kc.createUser({
            dbUserId:   user.id,
            username:   user.username,
            name:       user.name,
            email:      user.email,
            role:       user.role || 'staff',
            tenantId:   tenantId,
            tenantSlug: tenantSlug,
            branchId:   user.branch_id,
            password,
            temporary:  false,
          });
        } catch (err) {
          console.error('[KC] user.create sync failed (non-fatal):', err.message);
        }
      })();
    }

    return res.status(201).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const user = await User.findOne({ where: byIdWhere(req, req.params.id) });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const { name, username, role, branch_id, is_active, password, email } = req.body;
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
    if (email !== undefined)     updates.email      = email || null;
    if (password)                updates.password   = await bcrypt.hash(password, 10);

    // Check username uniqueness before updating
    if (username !== undefined && username !== user.username) {
      const existing = await User.findOne({
        where: {
          username,
          ...(tenantId ? { tenant_id: tenantId } : {}),
          id: { [Op.ne]: user.id },
        },
      });
      if (existing) return res.status(409).json({ message: 'Username already exists.' });
    }

    await user.update(updates);
    const result = user.toJSON();
    delete result.password;

    // Sync profile + role changes to Keycloak (non-fatal)
    if (process.env.KEYCLOAK_URL) {
      const kcUpdates = {};
      if (updates.name      !== undefined) kcUpdates.name     = updates.name;
      if (updates.email     !== undefined) kcUpdates.email    = updates.email;
      if (updates.role      !== undefined) kcUpdates.role     = updates.role;
      if (updates.branch_id !== undefined) kcUpdates.branchId = updates.branch_id;
      if (updates.is_active !== undefined) kcUpdates.isActive = updates.is_active;
      if (updates.password) {
        // Password was changed — update in Keycloak too
        kc.updatePassword(user.id, password, false)
          .catch((err) => console.error('[KC] user.update password sync failed (non-fatal):', err.message));
      }
      if (Object.keys(kcUpdates).length) {
        kc.updateUser(user.id, kcUpdates)
          .catch((err) => console.error('[KC] user.update sync failed (non-fatal):', err.message));
      }
    }

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const changePassword = async (req, res) => {
  try {
    const user = await User.findOne({ where: byIdWhere(req, req.params.id) });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    const hash = await bcrypt.hash(password, 10);
    await user.update({ password: hash });

    // Sync password to Keycloak (non-fatal)
    if (process.env.KEYCLOAK_URL) {
      kc.updatePassword(user.id, password, false)
        .catch((err) => console.error('[KC] changePassword sync failed (non-fatal):', err.message));
    }

    return res.json({ message: 'Password updated.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const user = await User.findOne({ where: byIdWhere(req, req.params.id) });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.role === 'superadmin') {
      return res.status(403).json({ message: 'Cannot delete superadmin.' });
    }
    const userId = user.id;
    await user.destroy();

    // Remove from Keycloak (non-fatal)
    if (process.env.KEYCLOAK_URL) {
      kc.deleteUser(userId)
        .catch((err) => console.error('[KC] user.delete sync failed (non-fatal):', err.message));
    }

    return res.json({ message: 'User deleted.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, create, update, changePassword, remove };
