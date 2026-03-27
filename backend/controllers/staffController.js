const { Op, fn, col, literal, where: sequelizeWhere } = require('sequelize');
const { Staff, Branch, StaffSpecialization, Service, Appointment, Payment, User } = require('../models');

// Helper: resolve branch filter from role
const getBranchWhere = (req) => {
  const where = {};
  if (req.userBranchId) {
    where.branch_id = req.userBranchId;
  } else if (req.query.branchId) {
    where.branch_id = req.query.branchId;
  }
  return where;
};

const list = async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const where = getBranchWhere(req);
    if (req.query.active !== undefined) where.is_active = req.query.active !== 'false';

    // If the staff table is empty for the selected scope, bootstrap from active users
    // so mobile clients can still load assignable staff members.
    const existingCount = await Staff.count({ where });
    if (existingCount === 0) {
      const userWhere = {
        is_active: true,
        role: { [Op.in]: ['staff', 'manager', 'admin'] },
      };
      if (where.branch_id !== undefined) {
        userWhere.branch_id = where.branch_id;
      }

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
      }
    }

    const { count, rows } = await Staff.findAndCountAll({
      where,
      limit,
      offset,
      order: [['name', 'ASC']],
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'color'] },
        {
          model: StaffSpecialization,
          as: 'specializations',
          include: [{ model: Service, as: 'service', attributes: ['id', 'name', 'category'] }],
        },
      ],
    });

    return res.json({ total: count, page, limit, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const getOne = async (req, res) => {
  try {
    const staff = await Staff.findByPk(req.params.id, {
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'color'] },
        {
          model: StaffSpecialization,
          as: 'specializations',
          include: [{ model: Service, as: 'service', attributes: ['id', 'name', 'category'] }],
        },
      ],
    });

    if (!staff) return res.status(404).json({ message: 'Staff not found.' });
    if (req.userBranchId && staff.branch_id !== req.userBranchId) {
      return res.status(403).json({ message: 'Access denied. Staff belongs to a different branch.' });
    }

    // Appointment count & total commission
    const apptCount = await Appointment.count({ where: { staff_id: staff.id } });
    const commSum   = await Payment.sum('commission_amount', { where: { staff_id: staff.id } });

    return res.json({ ...staff.toJSON(), apptCount, totalCommission: commSum || 0 });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const { name, phone, role_title, branch_id, commission_type, commission_value, join_date, specializations } = req.body;

    if (!name || !branch_id) {
      return res.status(400).json({ message: 'Name and branch_id are required.' });
    }
    if (req.userBranchId && Number(branch_id) !== Number(req.userBranchId)) {
      return res.status(403).json({ message: 'Access denied. You can only create staff for your own branch.' });
    }

    const staff = await Staff.create({ name, phone, role_title, branch_id, commission_type, commission_value, join_date });

    if (Array.isArray(specializations) && specializations.length) {
      const specs = specializations.map((sid) => ({ staff_id: staff.id, service_id: sid }));
      await StaffSpecialization.bulkCreate(specs, { ignoreDuplicates: true });
    }

    return res.status(201).json(staff);
  } catch (err) {
    console.error('Staff create error:', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const staff = await Staff.findByPk(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found.' });

    // Prevent cross-branch updates for non-superadmin/admin
    if (req.userBranchId && staff.branch_id !== req.userBranchId) {
      return res.status(403).json({ message: 'Access denied. Staff belongs to a different branch.' });
    }

    const allowed = ['name', 'phone', 'role_title', 'commission_type', 'commission_value', 'join_date', 'is_active'];
    // Only superadmin/admin can reassign to a different branch
    if (['superadmin', 'admin'].includes(req.user?.role)) allowed.push('branch_id');
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    await staff.update(updates);
    return res.json(staff);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const staff = await Staff.findByPk(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found.' });
    if (req.userBranchId && staff.branch_id !== req.userBranchId) {
      return res.status(403).json({ message: 'Access denied. Staff belongs to a different branch.' });
    }

    await staff.destroy();
    return res.json({ message: 'Staff deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const commissionSummary = async (req, res) => {
  try {
    const { month, year, branchId } = req.query;
    const staffWhere = {};
    if (req.userBranchId) staffWhere.branch_id = req.userBranchId;
    else if (branchId) staffWhere.branch_id = branchId;

    const paymentWhere = {};
    if (month && year) {
      const m = String(month).padStart(2, '0');
      const start = `${year}-${m}-01`;
      const last = new Date(year, month, 0).getDate();
      const end = `${year}-${m}-${last}`;
      paymentWhere.date = { [Op.between]: [start, end] };
    }

    // Fetch all staff first
    const staffRows = await Staff.findAll({
      where: staffWhere,
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
    });

    if (!staffRows.length) return res.json([]);

    // Single aggregated query for payment totals (avoids N+1)
    const staffIds = staffRows.map((s) => s.id);
    const paymentsAgg = await Payment.findAll({
      where: { ...paymentWhere, staff_id: { [Op.in]: staffIds } },
      attributes: [
        'staff_id',
        [fn('SUM', col('total_amount')),     'totalRevenue'],
        [fn('SUM', col('commission_amount')), 'totalCommission'],
        [fn('COUNT', col('id')),             'appointmentCount'],
      ],
      group: ['staff_id'],
      raw: true,
    });

    // Build lookup map
    const aggMap = {};
    for (const row of paymentsAgg) {
      aggMap[row.staff_id] = row;
    }

    const results = staffRows.map((staff) => {
      const agg = aggMap[staff.id] || { totalRevenue: 0, totalCommission: 0, appointmentCount: 0 };
      return {
        staffId:         staff.id,
        staffName:       staff.name,
        role:            staff.role_title,
        branchName:      staff.branch?.name || '',
        commissionType:  staff.commission_type,
        commissionValue: staff.commission_value,
        appointmentCount: parseInt(agg.appointmentCount) || 0,
        totalRevenue:    parseFloat(agg.totalRevenue)    || 0,
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
      const last  = new Date(year, month, 0).getDate();
      const end   = `${year}-${month}-${last}`;
      where.date  = { [Op.between]: [start, end] };
    }

    const payments = await Payment.findAll({
      where,
      include: [
        { model: Service,     as: 'service',     attributes: ['id', 'name'] },
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

    const staffWhere = {};
    if (branchId) staffWhere.branch_id = branchId;

    let staff = await Staff.findOne({
      where: {
        ...staffWhere,
        [Op.and]: [sequelizeWhere(fn('LOWER', col('name')), staffName.toLowerCase())],
      },
    });

    if (!staff && req.user?.id) {
      const user = await User.findByPk(req.user.id, { attributes: ['name', 'branch_id'] });
      if (user?.name) {
        staff = await Staff.findOne({
          where: {
            ...(user.branch_id ? { branch_id: user.branch_id } : {}),
            [Op.and]: [sequelizeWhere(fn('LOWER', col('name')), String(user.name).trim().toLowerCase())],
          },
        });
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

    // Replace all existing specializations
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

module.exports = { list, getOne, create, update, remove, commissionSummary, commissionReport, myCommission, setSpecializations };
