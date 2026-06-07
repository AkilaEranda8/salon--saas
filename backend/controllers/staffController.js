const { Op, fn, col, literal } = require('sequelize');
const { Staff, Branch, StaffBranch, StaffSpecialization, Service, Appointment, Payment, User, StaffAdvance, CommissionPayout } = require('../models');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');
const { normalizeStaffSpecializations } = require('../utils/commissionCalculator');

function buildSpecRows(staffId, rawSpecs, staffDefaults) {
  return normalizeStaffSpecializations(rawSpecs, staffDefaults).map((s) => ({
    staff_id: staffId,
    service_id: s.service_id,
    commission_type: s.commission_type,
    commission_value: s.commission_value,
  }));
}

function parseCommissionValue(raw) {
  if (raw === '' || raw == null || Number.isNaN(parseFloat(raw))) return null;
  return parseFloat(raw);
}

function parseStaffCommission(body = {}, { forCreate = false } = {}) {
  const salary_type = ['commission_only', 'salary_only', 'salary_plus_commission'].includes(body.salary_type)
    ? body.salary_type
    : (forCreate ? 'commission_only' : undefined);
  const commission_type = ['percentage', 'fixed'].includes(body.commission_type)
    ? body.commission_type
    : (forCreate ? 'percentage' : undefined);
  const commission_value = body.commission_value !== undefined
    ? parseCommissionValue(body.commission_value)
    : (forCreate ? null : undefined);
  const base_salary = body.base_salary !== undefined
    ? (parseCommissionValue(body.base_salary) ?? 0)
    : (forCreate ? 0 : undefined);

  const out = {};
  if (salary_type !== undefined) out.salary_type = salary_type;
  if (commission_type !== undefined) out.commission_type = commission_type;
  if (commission_value !== undefined) out.commission_value = commission_value;
  if (base_salary !== undefined) out.base_salary = base_salary;
  return out;
}

function extractServiceIds(body = {}) {
  if (Array.isArray(body.service_ids) && body.service_ids.length) {
    return [...new Set(body.service_ids.map(Number).filter((id) => id > 0))];
  }
  if (!Array.isArray(body.specializations)) return [];
  return [...new Set(
    body.specializations
      .map((item) => (item != null && typeof item === 'object' ? Number(item.service_id) : Number(item)))
      .filter((id) => id > 0),
  )];
}

async function replaceStaffSpecializations(staffId, serviceIds, staffDefaults) {
  await StaffSpecialization.destroy({ where: { staff_id: staffId } });
  if (!serviceIds.length) return;
  const specs = buildSpecRows(staffId, serviceIds, staffDefaults);
  if (specs.length) await StaffSpecialization.bulkCreate(specs, { ignoreDuplicates: true });
}

/** Keep existing per-service commission; only add/remove rows and optionally refresh rates when commission changed. */
async function syncStaffSpecializations(staffId, serviceIds, staffDefaults, { forceCommissionSync = false } = {}) {
  const existing = await StaffSpecialization.findAll({ where: { staff_id: staffId } });
  const existingByService = new Map(existing.map((row) => [Number(row.service_id), row]));
  const nextIds = new Set(serviceIds);

  const toRemove = existing.filter((row) => !nextIds.has(Number(row.service_id)));
  if (toRemove.length) {
    await StaffSpecialization.destroy({
      where: { staff_id: staffId, service_id: toRemove.map((row) => row.service_id) },
    });
  }

  const toAdd = serviceIds.filter((id) => !existingByService.has(id));
  if (toAdd.length) {
    const specs = buildSpecRows(staffId, toAdd, staffDefaults);
    if (specs.length) await StaffSpecialization.bulkCreate(specs, { ignoreDuplicates: true });
  }

  if (forceCommissionSync && serviceIds.length) {
    await StaffSpecialization.update(
      {
        commission_type: staffDefaults.commission_type,
        commission_value: staffDefaults.commission_value,
      },
      { where: { staff_id: staffId, service_id: serviceIds } },
    );
  }
}

// Helper: resolve branch filter from role
const getBranchWhere = (req) => {
  const where = tenantWhere(req);
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
    const limit  = Math.min(parseInt(req.query.limit) || 20, 500);
    const offset = (page - 1) * limit;

    const where = getBranchWhere(req);
    if (req.query.active !== undefined) where.is_active = req.query.active !== 'false';

    const { count, rows } = await Staff.findAndCountAll({
      where,
      limit,
      offset,
      order: [['name', 'ASC']],
      include: [
        { model: Branch, as: 'branch',   attributes: ['id', 'name', 'color'] },
        { model: Branch, as: 'branches', attributes: ['id', 'name', 'color'], through: { attributes: [] } },
        {
          model: StaffSpecialization,
          as: 'specializations',
          include: [{ model: Service, as: 'service', attributes: ['id', 'name', 'category'] }],
        },
        { model: User, as: 'user', attributes: ['id', 'username', 'name', 'role'], required: false },
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
    const staff = await Staff.findOne({
      where: byIdWhere(req, req.params.id),
      include: [
        { model: Branch, as: 'branch',   attributes: ['id', 'name', 'color'] },
        { model: Branch, as: 'branches', attributes: ['id', 'name', 'color'], through: { attributes: [] } },
        {
          model: StaffSpecialization,
          as: 'specializations',
          include: [{ model: Service, as: 'service', attributes: ['id', 'name', 'category'] }],
        },
        { model: User, as: 'user', attributes: ['id', 'username', 'name', 'role'], required: false },
      ],
    });

    if (!staff) return res.status(404).json({ message: 'Staff not found.' });

    // Appointment count & total commission
    const scope = tenantWhere(req);
    const apptCount = await Appointment.count({ where: { staff_id: staff.id, ...scope } });
    const commSum   = await Payment.sum('commission_amount', { where: { staff_id: staff.id, ...scope } });

    return res.json({ ...staff.toJSON(), apptCount, totalCommission: commSum || 0 });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const { name, phone, email, role_title, join_date, user_id } = req.body;
    // Accept branch_ids (array from frontend) or fallback to branch_id (single)
    const branchIds = (req.body.branch_ids || []).map(Number).filter(Boolean);
    const branch_id = branchIds[0] || Number(req.body.branch_id) || null;

    if (!name || !branch_id) {
      return res.status(400).json({ message: 'Name and branch are required.' });
    }

    const parsed = parseStaffCommission(req.body, { forCreate: true });
    const salary_type = parsed.salary_type || 'commission_only';
    const commission_type = parsed.commission_type || 'percentage';
    const commission_value = parsed.commission_value;
    const base_salary = parsed.base_salary ?? 0;
    const serviceIds = extractServiceIds(req.body);

    if (salary_type !== 'salary_only' && serviceIds.length && (commission_value == null || commission_value <= 0)) {
      return res.status(400).json({ message: 'Commission rate is required when services are selected.' });
    }

    const tenantId = resolveTenantId(req);
    const staff = await Staff.create({
      name,
      phone,
      email: email || null,
      role_title,
      branch_id,
      commission_type,
      commission_value: commission_value ?? 0,
      salary_type,
      base_salary,
      join_date,
      user_id: user_id || null,
      tenant_id: tenantId,
    });

    // Save all branch associations
    if (branchIds.length) {
      await StaffBranch.bulkCreate(
        branchIds.map((bid) => ({ staff_id: staff.id, branch_id: bid, tenant_id: tenantId })),
        { ignoreDuplicates: true },
      );
    }

    await replaceStaffSpecializations(staff.id, serviceIds, {
      commission_type,
      commission_value: commission_value ?? 0,
    });

    const created = await Staff.findOne({
      where: { id: staff.id },
      include: [
        {
          model: StaffSpecialization,
          as: 'specializations',
          include: [{ model: Service, as: 'service', attributes: ['id', 'name', 'category'] }],
        },
      ],
    });

    return res.status(201).json(created || staff);
  } catch (err) {
    console.error('Staff create error:', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const staff = await Staff.findOne({ where: byIdWhere(req, req.params.id) });
    if (!staff) return res.status(404).json({ message: 'Staff not found.' });

    // Prevent cross-branch updates for non-superadmin/admin
    if (req.userBranchId && staff.branch_id !== req.userBranchId) {
      return res.status(403).json({ message: 'Access denied. Staff belongs to a different branch.' });
    }

    const allowed = ['name', 'phone', 'email', 'role_title', 'commission_type', 'commission_value', 'salary_type', 'base_salary', 'join_date', 'is_active', 'user_id'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    const nextCommissionType = req.body.commission_type !== undefined
      ? (['percentage', 'fixed'].includes(req.body.commission_type) ? req.body.commission_type : staff.commission_type)
      : staff.commission_type;
    const nextCommissionValue = req.body.commission_value !== undefined
      ? parseCommissionValue(req.body.commission_value)
      : parseFloat(staff.commission_value);
    const commissionChanged = (
      (req.body.commission_type !== undefined && nextCommissionType !== staff.commission_type)
      || (req.body.commission_value !== undefined && nextCommissionValue !== parseFloat(staff.commission_value))
    );

    const parsed = parseStaffCommission(req.body);
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== undefined) updates[key] = value;
    }

    // Handle branch_ids array or single branch_id
    const branchIds = (req.body.branch_ids || []).map(Number).filter(Boolean);
    if (branchIds.length) {
      updates.branch_id = branchIds[0];
    } else if (req.body.branch_id !== undefined) {
      updates.branch_id = Number(req.body.branch_id);
    }

    await staff.update(updates);

    // Replace branch associations if branch_ids provided
    if (branchIds.length) {
      await StaffBranch.destroy({ where: { staff_id: staff.id } });
      await StaffBranch.bulkCreate(
        branchIds.map((bid) => ({ staff_id: staff.id, branch_id: bid, tenant_id: resolveTenantId(req) })),
        { ignoreDuplicates: true },
      );
    }

    const refreshedStaff = await Staff.findOne({ where: { id: staff.id } });
    const specDefaults = {
      commission_type: refreshedStaff.commission_type || 'percentage',
      commission_value: refreshedStaff.commission_value,
    };
    const effectiveSalaryType = refreshedStaff.salary_type || 'commission_only';
    const hasServicePayload = Array.isArray(req.body.specializations) || Array.isArray(req.body.service_ids);

    if (hasServicePayload) {
      const serviceIds = extractServiceIds(req.body);
      const effectiveCommission = commissionChanged ? updates.commission_value : specDefaults.commission_value;
      if (effectiveSalaryType !== 'salary_only' && serviceIds.length && (effectiveCommission == null || effectiveCommission <= 0)) {
        return res.status(400).json({ message: 'Commission rate is required when services are selected.' });
      }
      await syncStaffSpecializations(staff.id, serviceIds, specDefaults, {
        forceCommissionSync: commissionChanged,
      });
    } else if (commissionChanged) {
      await StaffSpecialization.update(
        {
          commission_type: specDefaults.commission_type,
          commission_value: specDefaults.commission_value,
        },
        { where: { staff_id: staff.id } },
      );
    }

    const refreshed = await Staff.findOne({
      where: { id: staff.id },
      include: [
        {
          model: StaffSpecialization,
          as: 'specializations',
          include: [{ model: Service, as: 'service', attributes: ['id', 'name', 'category'] }],
        },
      ],
    });

    return res.json(refreshed || staff);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const staff = await Staff.findOne({ where: byIdWhere(req, req.params.id) });
    if (!staff) return res.status(404).json({ message: 'Staff not found.' });

    await staff.destroy();
    return res.json({ message: 'Staff deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const commissionSummary = async (req, res) => {
  try {
    const { month, year, branchId } = req.query;
    const staffWhere = tenantWhere(req);
    if (req.userBranchId) staffWhere.branch_id = req.userBranchId;
    else if (branchId) staffWhere.branch_id = branchId;

    const paymentWhere = tenantWhere(req);
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

    // Fetch pending advance totals + paid payout totals for the same month
    const advMap  = {};
    const paidMap = {};
    if (month && year) {
      const ym = `${year}-${String(month).padStart(2, '0')}`;

      const advancesAgg = await StaffAdvance.findAll({
        where: { staff_id: { [Op.in]: staffIds }, month: ym, status: 'pending', ...tenantWhere(req) },
        attributes: ['staff_id', [fn('SUM', col('amount')), 'totalAdvances']],
        group: ['staff_id'],
        raw: true,
      });
      for (const row of advancesAgg) advMap[row.staff_id] = parseFloat(row.totalAdvances) || 0;

      const payoutsAgg = await CommissionPayout.findAll({
        where: { staff_id: { [Op.in]: staffIds }, month: ym, ...tenantWhere(req) },
        attributes: ['staff_id', [fn('SUM', col('amount')), 'totalPaid']],
        group: ['staff_id'],
        raw: true,
      });
      for (const row of payoutsAgg) paidMap[row.staff_id] = parseFloat(row.totalPaid) || 0;
    }

    const results = staffRows.map((staff) => {
      const agg             = aggMap[staff.id] || { totalRevenue: 0, totalCommission: 0, appointmentCount: 0 };
      const totalCommission = parseFloat(agg.totalCommission) || 0;
      const totalAdvances   = advMap[staff.id]  || 0;
      const totalPaid       = paidMap[staff.id] || 0;
      const baseSalary      = parseFloat(staff.base_salary) || 0;
      const salaryType      = staff.salary_type || 'commission_only';

      // Net payable depends on salary_type:
      //  commission_only          → commission - advances
      //  salary_only              → base_salary - advances
      //  salary_plus_commission   → base_salary + commission - advances
      let grossPayable;
      if (salaryType === 'salary_only') {
        grossPayable = baseSalary;
      } else if (salaryType === 'salary_plus_commission') {
        grossPayable = baseSalary + totalCommission;
      } else {
        grossPayable = totalCommission;
      }
      const netPayable = Math.max(0, grossPayable - totalAdvances);

      return {
        staffId:          staff.id,
        staffName:        staff.name,
        role:             staff.role_title,
        branchName:       staff.branch?.name || '',
        branchId:         staff.branch_id,
        commissionType:   staff.commission_type,
        commissionValue:  staff.commission_value,
        salaryType,
        baseSalary,
        appointmentCount: parseInt(agg.appointmentCount) || 0,
        totalRevenue:     parseFloat(agg.totalRevenue) || 0,
        totalCommission,
        grossPayable,
        totalAdvances,
        netCommission:    netPayable,
        totalPaid,
        balanceDue: Math.max(0, netPayable - totalPaid),
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
    const where = { staff_id: req.params.id, ...tenantWhere(req) };
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

    const totalCommission = payments.reduce((acc, p) => acc + parseFloat(p.commission_amount || 0), 0);

    // Fetch staff salary info for correct gross calculation
    const staffRecord = await Staff.findOne({ where: { id: req.params.id, ...tenantWhere(req) } });
    const salaryType  = staffRecord?.salary_type || 'commission_only';
    const baseSalary  = parseFloat(staffRecord?.base_salary) || 0;

    let grossPayable;
    if (salaryType === 'salary_only') {
      grossPayable = baseSalary;
    } else if (salaryType === 'salary_plus_commission') {
      grossPayable = baseSalary + totalCommission;
    } else {
      grossPayable = totalCommission;
    }

    // Pending advances + commission payouts for this staff for the same month
    let totalAdvances = 0;
    let totalPaid     = 0;
    if (req.query.month) {
      const [advRows, payoutRows] = await Promise.all([
        StaffAdvance.findAll({
          where: { staff_id: req.params.id, month: req.query.month, status: 'pending', ...tenantWhere(req) },
          raw: true,
        }),
        CommissionPayout.findAll({
          where: { staff_id: req.params.id, month: req.query.month, ...tenantWhere(req) },
          raw: true,
        }),
      ]);
      totalAdvances = advRows.reduce((s, a) => s + parseFloat(a.amount || 0), 0);
      totalPaid     = payoutRows.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    }

    const netPayable = Math.max(0, grossPayable - totalAdvances);
    return res.json({
      total: totalCommission,
      totalCommission,
      baseSalary,
      salaryType,
      grossPayable,
      totalAdvances,
      netCommission: netPayable,
      totalPaid,
      balanceDue: Math.max(0, netPayable - totalPaid),
      data: payments,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const setSpecializations = async (req, res) => {
  try {
    const { serviceIds } = req.body;

    if (!Array.isArray(serviceIds)) {
      return res.status(400).json({ message: 'serviceIds must be an array.' });
    }

    const staff = await Staff.findOne({ where: byIdWhere(req, req.params.id) });
    if (!staff) return res.status(404).json({ message: 'Staff not found.' });

    // Replace all existing specializations
    await StaffSpecialization.destroy({ where: { staff_id: staff.id } });

    const rawSpecs = Array.isArray(req.body.specializations) ? req.body.specializations : serviceIds;
    const specs = buildSpecRows(staff.id, rawSpecs, {
      commission_type: staff.commission_type,
      commission_value: staff.commission_value,
    });
    if (specs.length) await StaffSpecialization.bulkCreate(specs);

    const updated = await StaffSpecialization.findAll({
      where: { staff_id: staff.id },
      include: [{ model: Service, as: 'service', attributes: ['id', 'name'] }],
    });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, getOne, create, update, remove, commissionSummary, commissionReport, setSpecializations };
