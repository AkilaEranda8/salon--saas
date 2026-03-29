const { Op, fn, col, literal, where: sequelizeWhere } = require('sequelize');
const fs = require('fs');
const path = require('path');
const {
  Staff,
  StaffBranch,
  Branch,
  StaffSpecialization,
  Service,
  Appointment,
  Payment,
  User,
} = require('../models');
const { staffWhereForBranch, staffBelongsToBranch } = require('../utils/staffBranchFilter');

function safeUnlinkUpload(relPath = '') {
  if (!relPath || typeof relPath !== 'string') return;
  if (!relPath.startsWith('/uploads/')) return;
  const abs = path.join(__dirname, '..', relPath.replace(/^\//, ''));
  fs.unlink(abs, () => {});
}

function toPublicUrl(req, relPath = '') {
  if (!relPath || typeof relPath !== 'string') return relPath;
  if (/^https?:\/\//i.test(relPath)) return relPath;
  const storageBase = String(process.env.STORAGE_BASE_URL || '').trim().replace(/\/+$/, '');
  if (storageBase) return `${storageBase}${relPath.startsWith('/') ? relPath : `/${relPath}`}`;
  const host = req.get('x-forwarded-host') || req.get('host');
  const protoHdr = String(req.get('x-forwarded-proto') || req.protocol || 'http');
  const proto = protoHdr.split(',')[0].trim() || 'http';
  if (!host) return relPath;
  return `${proto}://${host}${relPath.startsWith('/') ? relPath : `/${relPath}`}`;
}

function presentStaffRow(row, req) {
  if (!row) return row;
  const out = typeof row.toJSON === 'function' ? row.toJSON() : { ...row };
  if (out.photo_url) out.photo_url = toPublicUrl(req, out.photo_url);
  return out;
}

function normalizeBranchIds(body) {
  if (Array.isArray(body.branch_ids) && body.branch_ids.length) {
    return [...new Set(body.branch_ids.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n)))];
  }
  if (body.branch_id != null && body.branch_id !== '') {
    const n = parseInt(body.branch_id, 10);
    return Number.isFinite(n) ? [n] : [];
  }
  return [];
}

async function setStaffBranches(staffId, branchIds) {
  await StaffBranch.destroy({ where: { staff_id: staffId } });
  if (branchIds.length) {
    await StaffBranch.bulkCreate(
      branchIds.map((bid) => ({ staff_id: staffId, branch_id: bid })),
      { ignoreDuplicates: true },
    );
  }
}

const staffIncludeList = () => [
  { model: Branch, as: 'branch', attributes: ['id', 'name', 'color'] },
  {
    model: StaffSpecialization,
    as: 'specializations',
    separate: true,
    include: [{ model: Service, as: 'service', attributes: ['id', 'name', 'category'] }],
  },
];

const staffIncludeDetail = () => [
  { model: Branch, as: 'branch', attributes: ['id', 'name', 'color'] },
  {
    model: Branch,
    as: 'branches',
    attributes: ['id', 'name', 'color'],
    through: { attributes: [] },
  },
  {
    model: StaffSpecialization,
    as: 'specializations',
    separate: true,
    include: [{ model: Service, as: 'service', attributes: ['id', 'name', 'category'] }],
  },
];

async function attachBranchesForStaffRows(rows) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const links = await StaffBranch.findAll({
    where: { staff_id: { [Op.in]: ids } },
    include: [{ model: Branch, as: 'branch', attributes: ['id', 'name', 'color'] }],
  });
  const byStaff = {};
  for (const l of links) {
    const b = l.branch;
    if (!b) continue;
    if (!byStaff[l.staff_id]) byStaff[l.staff_id] = [];
    byStaff[l.staff_id].push(b.toJSON());
  }
  return rows.map((row) => {
    const j = row.toJSON();
    j.branches =
      byStaff[row.id] && byStaff[row.id].length ? byStaff[row.id] : j.branch ? [j.branch] : [];
    return j;
  });
}

async function getStaffListBranchWhere(req) {
  const branchFilter = req.userBranchId || req.query.branchId;
  if (!branchFilter) return {};
  return staffWhereForBranch(branchFilter);
}

const list = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 500);
    const offset = (page - 1) * limit;

    const where = await getStaffListBranchWhere(req);
    if (req.query.active !== undefined) where.is_active = req.query.active !== 'false';

    const branchFilter = req.userBranchId || req.query.branchId;
    const existingCount = await Staff.count({ where });
    if (existingCount === 0 && branchFilter) {
      const userWhere = {
        is_active: true,
        role: { [Op.in]: ['staff', 'manager', 'admin'] },
        branch_id: branchFilter,
      };

      const users = await User.findAll({
        where: userWhere,
        attributes: ['name', 'branch_id', 'role', 'is_active'],
      });

      if (users.length) {
        await Staff.bulkCreate(
          users
            .filter((u) => !!u.branch_id)
            .map((u) => ({
              name: u.name,
              branch_id: u.branch_id,
              role_title: u.role,
              is_active: u.is_active,
            })),
        );
        const scoped = await Staff.findAll({ where: { branch_id: branchFilter } });
        for (const s of scoped) {
          const cnt = await StaffBranch.count({ where: { staff_id: s.id } });
          if (!cnt) await setStaffBranches(s.id, [s.branch_id]);
        }
      }
    }

    const total = await Staff.count({ where });
    const rows = await Staff.findAll({
      where,
      limit,
      offset,
      order: [['name', 'ASC']],
      include: staffIncludeList(),
    });
    const data = await attachBranchesForStaffRows(rows);

    return res.json({ total, page, limit, data: data.map((row) => presentStaffRow(row, req)) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const getOne = async (req, res) => {
  try {
    const staff = await Staff.findByPk(req.params.id, {
      include: staffIncludeDetail(),
    });

    if (!staff) return res.status(404).json({ message: 'Staff not found.' });
    if (req.userBranchId && !(await staffBelongsToBranch(staff.id, req.userBranchId))) {
      return res.status(403).json({ message: 'Access denied. Staff belongs to a different branch.' });
    }

    const apptCount = await Appointment.count({ where: { staff_id: staff.id } });
    const commSum = await Payment.sum('commission_amount', { where: { staff_id: staff.id } });

    const staffOut = presentStaffRow(staff, req);
    return res.json({ ...staffOut, apptCount, totalCommission: commSum || 0 });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const { name, phone, email, role_title, commission_type, commission_value, join_date, specializations } = req.body;

    const branchIds = normalizeBranchIds(req.body);
    if (!name || !branchIds.length) {
      return res.status(400).json({ message: 'Name and at least one branch are required.' });
    }

    if (req.userBranchId) {
      const mb = Number(req.userBranchId);
      if (!branchIds.every((id) => id === mb)) {
        return res.status(403).json({ message: 'Access denied. You can only create staff for your own branch.' });
      }
    }

    const staff = await Staff.create({
      name,
      phone,
      email: email != null && String(email).trim() !== '' ? String(email).trim() : null,
      role_title,
      branch_id: branchIds[0],
      commission_type,
      commission_value,
      join_date,
    });

    await setStaffBranches(staff.id, branchIds);

    if (Array.isArray(specializations) && specializations.length) {
      const specs = specializations.map((sid) => ({ staff_id: staff.id, service_id: sid }));
      await StaffSpecialization.bulkCreate(specs, { ignoreDuplicates: true });
    }

    const full = await Staff.findByPk(staff.id, { include: staffIncludeDetail() });
    return res.status(201).json(presentStaffRow(full, req));
  } catch (err) {
    console.error('Staff create error:', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const staff = await Staff.findByPk(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found.' });

    if (req.userBranchId && !(await staffBelongsToBranch(staff.id, req.userBranchId))) {
      return res.status(403).json({ message: 'Access denied. Staff belongs to a different branch.' });
    }

    const allowed = ['name', 'phone', 'email', 'role_title', 'commission_type', 'commission_value', 'join_date', 'is_active'];
    if (['superadmin', 'admin', 'manager'].includes(req.user?.role)) allowed.push('branch_id');
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'join_date')) {
      const j = updates.join_date;
      updates.join_date = j === '' || j == null ? null : j;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'phone')) {
      if (updates.phone === '') updates.phone = null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'email')) {
      const e = updates.email;
      updates.email = e === '' || e == null ? null : String(e).trim();
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'commission_value')) {
      const raw = updates.commission_value;
      if (raw === '' || raw == null) {
        updates.commission_value = 0;
      } else {
        const n = Number(raw);
        updates.commission_value = Number.isFinite(n) ? n : 0;
      }
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'branch_id') && updates.branch_id != null) {
      const bid = parseInt(updates.branch_id, 10);
      if (Number.isNaN(bid)) {
        return res.status(400).json({ message: 'Invalid branch_id.' });
      }
      if (req.user?.role === 'manager' && Number(req.userBranchId) !== bid) {
        return res.status(403).json({ message: 'Managers can only assign staff to their own branch.' });
      }
      updates.branch_id = bid;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'is_active') && typeof updates.is_active === 'string') {
      updates.is_active = updates.is_active === 'true' || updates.is_active === '1';
    }

    const branchIdsFromBody = normalizeBranchIds(req.body);
    if (branchIdsFromBody.length) {
      if (req.user?.role === 'manager' && req.userBranchId) {
        const mb = Number(req.userBranchId);
        if (!branchIdsFromBody.every((id) => id === mb)) {
          return res.status(403).json({ message: 'Managers can only assign staff to their own branch.' });
        }
      }
      updates.branch_id = branchIdsFromBody[0];
    }

    await staff.update(updates);

    if (branchIdsFromBody.length) {
      await setStaffBranches(staff.id, branchIdsFromBody);
    } else if (Object.prototype.hasOwnProperty.call(updates, 'branch_id') && updates.branch_id != null) {
      const bid = parseInt(updates.branch_id, 10);
      if (Number.isFinite(bid)) await setStaffBranches(staff.id, [bid]);
    }

    const { specializations } = req.body;
    if (Array.isArray(specializations)) {
      await StaffSpecialization.destroy({ where: { staff_id: staff.id } });
      if (specializations.length) {
        const ids = specializations.map((sid) => Number(sid)).filter((n) => Number.isFinite(n));
        const specs = ids.map((service_id) => ({ staff_id: staff.id, service_id }));
        await StaffSpecialization.bulkCreate(specs, { ignoreDuplicates: true });
      }
    }

    const full = await Staff.findByPk(staff.id, { include: staffIncludeDetail() });
    return res.json(presentStaffRow(full, req));
  } catch (err) {
    console.error('Staff update error:', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const staff = await Staff.findByPk(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found.' });
    if (req.userBranchId && !(await staffBelongsToBranch(staff.id, req.userBranchId))) {
      return res.status(403).json({ message: 'Access denied. Staff belongs to a different branch.' });
    }

    await StaffBranch.destroy({ where: { staff_id: staff.id } });
    await staff.destroy();
    return res.json({ message: 'Staff deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const commissionSummary = async (req, res) => {
  try {
    const { month, year, branchId } = req.query;
    const bid = req.userBranchId || branchId;
    const staffWhere = bid ? await staffWhereForBranch(bid) : {};

    const paymentWhere = {};
    if (month && year) {
      const m = String(month).padStart(2, '0');
      const start = `${year}-${m}-01`;
      const last = new Date(year, month, 0).getDate();
      const end = `${year}-${m}-${last}`;
      paymentWhere.date = { [Op.between]: [start, end] };
    }

    const staffRows = await Staff.findAll({
      where: staffWhere,
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
    });

    if (!staffRows.length) return res.json([]);

    const staffIds = staffRows.map((s) => s.id);
    const paymentsAgg = await Payment.findAll({
      where: { ...paymentWhere, staff_id: { [Op.in]: staffIds } },
      attributes: [
        'staff_id',
        [fn('SUM', col('total_amount')), 'totalRevenue'],
        [fn('SUM', col('commission_amount')), 'totalCommission'],
        [fn('COUNT', col('id')), 'appointmentCount'],
      ],
      group: ['staff_id'],
      raw: true,
    });

    const aggMap = {};
    for (const row of paymentsAgg) {
      aggMap[row.staff_id] = row;
    }

    const results = staffRows.map((s) => {
      const agg = aggMap[s.id] || { totalRevenue: 0, totalCommission: 0, appointmentCount: 0 };
      return {
        staffId: s.id,
        staffName: s.name,
        role: s.role_title,
        branchName: s.branch?.name || '',
        commissionType: s.commission_type,
        commissionValue: s.commission_value,
        appointmentCount: parseInt(agg.appointmentCount) || 0,
        totalRevenue: parseFloat(agg.totalRevenue) || 0,
        totalCommission: parseFloat(agg.totalCommission) || 0,
      };
    });

    return res.json(results);
  } catch (err) {
    console.error('Commission summary error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const commissionReport = async (req, res) => {
  try {
    const where = { staff_id: req.params.id };
    if (req.query.month) {
      const [year, month] = req.query.month.split('-');
      const start = `${year}-${month}-01`;
      const last = new Date(year, month, 0).getDate();
      const end = `${year}-${month}-${last}`;
      where.date = { [Op.between]: [start, end] };
    }

    const payments = await Payment.findAll({
      where,
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name'] },
        { model: Appointment, as: 'appointment', attributes: ['id', 'date', 'time', 'customer_name'] },
      ],
      order: [['date', 'DESC']],
    });

    const total = payments.reduce((acc, p) => acc + parseFloat(p.commission_amount || 0), 0);

    return res.json({ total, data: payments });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const myCommission = async (req, res) => {
  try {
    const branchId = req.userBranchId || req.user?.branchId || null;
    const staffName = String(req.user?.name || '').trim();
    if (!staffName) {
      return res.status(400).json({ message: 'Authenticated user name is missing.' });
    }

    const nameCond = sequelizeWhere(fn('LOWER', col('name')), staffName.toLowerCase());
    const branchPart = branchId ? await staffWhereForBranch(branchId) : {};
    const where = Object.keys(branchPart).length ? { [Op.and]: [nameCond, branchPart] } : nameCond;

    let staff = await Staff.findOne({ where });

    if (!staff && req.user?.id) {
      const user = await User.findByPk(req.user.id, { attributes: ['name', 'branch_id'] });
      if (user?.name) {
        const n2 = sequelizeWhere(fn('LOWER', col('name')), String(user.name).trim().toLowerCase());
        const bp = user.branch_id ? await staffWhereForBranch(user.branch_id) : {};
        const w2 = Object.keys(bp).length ? { [Op.and]: [n2, bp] } : n2;
        staff = await Staff.findOne({ where: w2 });
      }
    }

    if (!staff) {
      return res.json({
        total: 0,
        data: [],
        staff: null,
        message: 'No matching staff profile found for this user.',
      });
    }

    const paymentWhere = { staff_id: staff.id };
    if (req.query.month) {
      const [year, month] = String(req.query.month).split('-');
      const start = `${year}-${month}-01`;
      const last = new Date(Number(year), Number(month), 0).getDate();
      const end = `${year}-${month}-${last}`;
      paymentWhere.date = { [Op.between]: [start, end] };
    }

    const payments = await Payment.findAll({
      where: paymentWhere,
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name'] },
        { model: Appointment, as: 'appointment', attributes: ['id', 'date', 'time', 'customer_name'] },
      ],
      order: [['date', 'DESC']],
    });

    const total = payments.reduce((acc, p) => acc + parseFloat(p.commission_amount || 0), 0);
    return res.json({
      total,
      data: payments,
      staff: {
        id: staff.id,
        name: staff.name,
        branch_id: staff.branch_id,
      },
    });
  } catch (err) {
    console.error('my commission error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const setSpecializations = async (req, res) => {
  try {
    const { serviceIds } = req.body;

    if (!Array.isArray(serviceIds)) {
      return res.status(400).json({ message: 'serviceIds must be an array.' });
    }

    await StaffSpecialization.destroy({ where: { staff_id: req.params.id } });

    if (serviceIds.length) {
      const specs = serviceIds.map((sid) => ({ staff_id: parseInt(req.params.id), service_id: sid }));
      await StaffSpecialization.bulkCreate(specs);
    }

    const updated = await StaffSpecialization.findAll({
      where: { staff_id: req.params.id },
      include: [{ model: Service, as: 'service', attributes: ['id', 'name'] }],
    });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const setPhoto = async (req, res) => {
  try {
    const staff = await Staff.findByPk(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found.' });
    if (req.userBranchId && !(await staffBelongsToBranch(staff.id, req.userBranchId))) {
      return res.status(403).json({ message: 'Access denied. Staff belongs to a different branch.' });
    }
    if (!req.file) return res.status(400).json({ message: 'Photo file is required.' });

    const rel = `/uploads/staff/${req.file.filename}`;
    const old = staff.photo_url;
    await staff.update({ photo_url: rel });
    safeUnlinkUpload(old);

    return res.json({
      message: 'Staff photo updated.',
      photo_url: toPublicUrl(req, rel),
      staff: presentStaffRow(staff, req),
    });
  } catch (err) {
    console.error('Staff setPhoto error:', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
};

const removePhoto = async (req, res) => {
  try {
    const staff = await Staff.findByPk(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found.' });
    if (req.userBranchId && !(await staffBelongsToBranch(staff.id, req.userBranchId))) {
      return res.status(403).json({ message: 'Access denied. Staff belongs to a different branch.' });
    }

    const old = staff.photo_url;
    await staff.update({ photo_url: null });
    safeUnlinkUpload(old);

    return res.json({ message: 'Staff photo removed.', staff: presentStaffRow(staff, req) });
  } catch (err) {
    console.error('Staff removePhoto error:', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
};

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
  commissionSummary,
  commissionReport,
  myCommission,
  setSpecializations,
  setPhoto,
  removePhoto,
};
