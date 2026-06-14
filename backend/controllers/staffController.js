const { Op, fn, col, literal } = require('sequelize');
const { Staff, Branch, StaffBranch, StaffSpecialization, Service, Appointment, Payment, User, StaffAdvance, CommissionPayout } = require('../models');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');
const { normalizeStaffSpecializations } = require('../utils/commissionCalculator');
const {
  applyServiceWiseCommissionPolicy,
  hasTenantFeature,
  hasServiceWiseCommissionForUser,
  sanitizeStaffRecord,
} = require('../utils/tenantFeatures');
const { breakdownForPayment } = require('../services/paymentCommissionBreakdown');
const { hasFranchiseCommission } = require('../utils/tenantFeatures');

function parseJsonField(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

function managerOversightBreakdown(payment, stored) {
  const parsed = parseJsonField(stored);
  if (parsed && (parsed.lines?.length || parsed.note || parsed.total != null)) {
    return parsed;
  }
  const amt = parseFloat(payment.manager_commission_amount || 0);
  const total = parseFloat(payment.total_amount || 0);
  const pct = parsed?.overridePercent ?? null;
  const rateLabel = pct != null ? `${pct}%` : 'Override %';
  return {
    netTotal: total,
    paidAmount: total,
    loyaltyDiscount: parseFloat(payment.loyalty_discount || 0),
    promoDiscount: parseFloat(payment.promo_discount || 0),
    lines: [{
      serviceName: payment.service?.name || 'Branch services',
      lineBase: total,
      rateLabel,
      source: 'manager_override',
      sourceLabel: 'Manager override',
      commission: amt,
    }],
    total: amt,
    note: pct != null
      ? `Manager override ${pct}% of service amount`
      : 'Manager override % of service amount',
  };
}
const { staffWhereForBranch } = require('../utils/staffBranchFilter');

function resolveSpecItems(req, rawItems, salaryType = 'commission_only') {
  if (!hasServiceWiseCommissionForUser(req.tenant, req) && salaryType !== 'salary_only') {
    return [];
  }
  return applyServiceWiseCommissionPolicy(rawItems, req.tenant);
}

function staffRequiresCommission(salaryType) {
  return salaryType === 'commission_only' || salaryType === 'salary_plus_commission';
}

/** Manager / default-only staff: link all active services with null override (uses staff default). */
async function managerDefaultServiceSpecs(req) {
  const services = await Service.findAll({
    where: { ...tenantWhere(req), is_active: true },
    attributes: ['id'],
  });
  return services.map((s) => ({
    service_id: s.id,
    commission_type: null,
    commission_value: null,
  }));
}

function mapStaff(row, tenant) {
  return row ? sanitizeStaffRecord(row, tenant) : row;
}

function buildSpecRows(staffId, rawSpecs, staffDefaults) {
  return normalizeStaffSpecializations(rawSpecs, staffDefaults).map((s) => ({
    staff_id: staffId,
    service_id: s.service_id,
    commission_type: s.commission_type,
    commission_value: s.commission_value,
  }));
}

function extractSpecializationItems(body = {}) {
  if (Array.isArray(body.specializations)) {
    return body.specializations
      .map((item) => {
        if (item == null) return null;
        const service_id = Number(item.service_id ?? item);
        if (!service_id) return null;
        const hasOverride = item.commission_value != null && item.commission_value !== '';
        return {
          service_id,
          commission_type: hasOverride && item.commission_type ? item.commission_type : null,
          commission_value: hasOverride ? parseFloat(item.commission_value) : null,
        };
      })
      .filter(Boolean);
  }
  if (Array.isArray(body.service_ids)) {
    return body.service_ids
      .map((id) => ({ service_id: Number(id), commission_type: null, commission_value: null }))
      .filter((item) => item.service_id > 0);
  }
  return [];
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

async function replaceStaffSpecializations(staffId, items) {
  await StaffSpecialization.destroy({ where: { staff_id: staffId } });
  if (!items.length) return;
  const rows = items.map((item) => ({
    staff_id: staffId,
    service_id: item.service_id,
    commission_type: item.commission_type,
    commission_value: item.commission_value,
  }));
  await StaffSpecialization.bulkCreate(rows, { ignoreDuplicates: true });
}

async function syncStaffSpecializations(staffId, items) {
  const existing = await StaffSpecialization.findAll({ where: { staff_id: staffId } });
  const existingByService = new Map(existing.map((row) => [Number(row.service_id), row]));
  const nextIds = new Set(items.map((item) => item.service_id));

  const toRemove = existing.filter((row) => !nextIds.has(Number(row.service_id)));
  if (toRemove.length) {
    await StaffSpecialization.destroy({
      where: { staff_id: staffId, service_id: toRemove.map((row) => row.service_id) },
    });
  }

  for (const item of items) {
    const row = existingByService.get(item.service_id);
    const data = {
      commission_type: item.commission_type,
      commission_value: item.commission_value,
    };
    if (row) {
      await row.update(data);
    } else {
      await StaffSpecialization.create({ staff_id: staffId, service_id: item.service_id, ...data });
    }
  }
}

/** Staff on a branch: primary branch_id OR staff_branches link. */
async function buildStaffBranchWhere(req, branchId = null) {
  const scope = tenantWhere(req);
  const bid = branchId != null && branchId !== '' ? Number(branchId) : null;
  if (!bid) return scope;
  const branchClause = await staffWhereForBranch(bid);
  return { ...scope, ...branchClause };
}

// Helper: resolve branch filter from role
const getBranchWhere = async (req) => {
  const branchId = req.userBranchId ?? req.query.branchId ?? null;
  return buildStaffBranchWhere(req, branchId);
};

const list = async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 20, 500);
    const offset = (page - 1) * limit;

    const where = await getBranchWhere(req);
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

    return res.json({
      total: count,
      page,
      limit,
      data: rows.map((row) => mapStaff(row, req.tenant)),
    });
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

    return res.json({
      ...mapStaff(staff, req.tenant),
      apptCount,
      totalCommission: commSum || 0,
    });
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
    if (!role_title || !String(role_title).trim()) {
      return res.status(400).json({ message: 'Staff role is required.' });
    }

    const parsed = parseStaffCommission(req.body, { forCreate: true });
    const salary_type = parsed.salary_type || 'commission_only';
    const commission_type = parsed.commission_type || 'percentage';
    const commission_value = parsed.commission_value;
    const base_salary = parsed.base_salary ?? 0;
    let specItems = resolveSpecItems(req, extractSpecializationItems(req.body), salary_type);

    if (staffRequiresCommission(salary_type) && (commission_value == null || commission_value <= 0)) {
      return res.status(400).json({ message: 'Default commission rate is required for commission-based staff.' });
    }

    if (!hasServiceWiseCommissionForUser(req.tenant, req) && staffRequiresCommission(salary_type)) {
      specItems = await managerDefaultServiceSpecs(req);
    } else if (hasServiceWiseCommissionForUser(req.tenant, req)
      && salary_type !== 'salary_only' && specItems.length && (commission_value == null || commission_value <= 0)) {
      return res.status(400).json({ message: 'Default commission rate is required when services are selected.' });
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

    await replaceStaffSpecializations(staff.id, specItems);
    await syncLinkedUserBranch(staff, tenantId);

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

    return res.status(201).json(mapStaff(created || staff, req.tenant));
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

    const refreshedForRole = await Staff.findOne({ where: { id: staff.id } });
    if (!refreshedForRole?.role_title || !String(refreshedForRole.role_title).trim()) {
      return res.status(400).json({ message: 'Staff role is required.' });
    }

    // Replace branch associations if branch_ids provided
    if (branchIds.length) {
      await StaffBranch.destroy({ where: { staff_id: staff.id } });
      await StaffBranch.bulkCreate(
        branchIds.map((bid) => ({ staff_id: staff.id, branch_id: bid, tenant_id: resolveTenantId(req) })),
        { ignoreDuplicates: true },
      );
    }

    const refreshedStaff = await Staff.findOne({ where: { id: staff.id } });
    const effectiveSalaryType = refreshedStaff.salary_type || 'commission_only';
    const hasServicePayload = Array.isArray(req.body.specializations) || Array.isArray(req.body.service_ids);
    const commissionTouched = updates.commission_value !== undefined || updates.salary_type !== undefined;

    if (commissionTouched && staffRequiresCommission(effectiveSalaryType)) {
      const effectiveCommission = refreshedStaff.commission_value;
      if (effectiveCommission == null || parseFloat(effectiveCommission) <= 0) {
        return res.status(400).json({ message: 'Default commission rate is required for commission-based staff.' });
      }
    }

    if (!hasServiceWiseCommissionForUser(req.tenant, req) && staffRequiresCommission(effectiveSalaryType)) {
      const defaultSpecs = await managerDefaultServiceSpecs(req);
      await replaceStaffSpecializations(staff.id, defaultSpecs);
    } else if (hasServicePayload) {
      const specItems = resolveSpecItems(req, extractSpecializationItems(req.body), effectiveSalaryType);
      const effectiveCommission = refreshedStaff.commission_value;
      if (hasServiceWiseCommissionForUser(req.tenant, req)
        && effectiveSalaryType !== 'salary_only' && specItems.length && (effectiveCommission == null || parseFloat(effectiveCommission) <= 0)) {
        return res.status(400).json({ message: 'Default commission rate is required when services are selected.' });
      }
      await syncStaffSpecializations(staff.id, specItems);
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

    await syncLinkedUserBranch(refreshedStaff || staff, resolveTenantId(req));

    return res.json(mapStaff(refreshed || staff, req.tenant));
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

async function syncLinkedUserBranch(staff, tenantId) {
  if (!staff?.user_id || !staff?.branch_id) return;
  await User.update(
    { branch_id: staff.branch_id },
    { where: { id: staff.user_id, ...(tenantId != null ? { tenant_id: tenantId } : {}) } },
  );
}

const { linkedStaffIdForRequest } = require('../utils/resolveUserBranch');

async function linkedStaffIdForUser(req) {
  return linkedStaffIdForRequest(req);
}

const myCommission = async (req, res) => {
  try {
    const { resolveStaffRecordForRequest } = require('../utils/resolveUserBranch');
    const staff = await resolveStaffRecordForRequest(req);
    const staffId = staff?.id;
    if (!staffId) {
      const salon = req.tenant?.name || req.tenant?.slug || 'this salon';
      const slug = req.tenant?.slug ? ` (login salon: ${req.tenant.slug})` : '';
      return res.status(404).json({
        message:
          `No staff profile linked in ${salon}${slug}. `
          + 'Web admin → Staff: add a staff member with the same name as this login, or link user_id.',
        tenant_slug: req.tenant?.slug ?? null,
        tenant_name: req.tenant?.name ?? null,
      });
    }
    req.params.id = String(staffId);
    return commissionReport(req, res);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const commissionSummary = async (req, res) => {
  try {
    const role = (req.user?.role || '').toLowerCase();
    if (role === 'staff') {
      return res.status(403).json({ message: 'Not authorized to view all staff commission.' });
    }
    const { month, year, branchId } = req.query;
    const effectiveBranchId = req.userBranchId ?? branchId ?? null;
    const staffWhere = await buildStaffBranchWhere(req, effectiveBranchId);

    const paymentWhere = tenantWhere(req);
    if (month && year) {
      const m = String(month).padStart(2, '0');
      const start = `${year}-${m}-01`;
      const last = new Date(year, month, 0).getDate();
      const end = `${year}-${m}-${last}`;
      paymentWhere.date = { [Op.between]: [start, end] };
    }

    // All staff for branch (including zero commission this period)
    const staffRows = await Staff.findAll({
      where: staffWhere,
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
        { model: Branch, as: 'branches', attributes: ['id', 'name'], through: { attributes: [] } },
      ],
      order: [['name', 'ASC']],
    });

    if (!staffRows.length) return res.json([]);

    const staffIds = staffRows.map((s) => s.id);
    const workerAgg = await Payment.findAll({
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

    let managerAgg = [];
    if (hasFranchiseCommission(req.tenant)) {
      try {
        managerAgg = await Payment.findAll({
          where: { ...paymentWhere, manager_staff_id: { [Op.in]: staffIds } },
          attributes: [
            'manager_staff_id',
            [fn('SUM', col('total_amount')), 'totalRevenue'],
            [fn('SUM', col('manager_commission_amount')), 'totalCommission'],
            [fn('COUNT', col('id')), 'appointmentCount'],
          ],
          group: ['manager_staff_id'],
          raw: true,
        });
      } catch (mgrErr) {
        console.warn('commissionSummary manager_agg skipped:', mgrErr.message);
      }
    }

    const aggMap = {};
    const mergeAgg = (row, idKey) => {
      const id = row[idKey];
      if (!id) return;
      const prev = aggMap[id] || {
        totalRevenue: 0,
        totalCommission: 0,
        appointmentCount: 0,
      };
      aggMap[id] = {
        totalRevenue: (parseFloat(prev.totalRevenue) || 0) + (parseFloat(row.totalRevenue) || 0),
        totalCommission: (parseFloat(prev.totalCommission) || 0) + (parseFloat(row.totalCommission) || 0),
        appointmentCount: (parseInt(prev.appointmentCount, 10) || 0) + (parseInt(row.appointmentCount, 10) || 0),
      };
    };
    for (const row of workerAgg) mergeAgg(row, 'staff_id');
    for (const row of managerAgg) mergeAgg(row, 'manager_staff_id');

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
        branchName:       staff.branch?.name || staff.branches?.[0]?.name || '',
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
    const role = (req.user?.role || '').toLowerCase();
    if (role === 'staff') {
      const ownId = await linkedStaffIdForUser(req);
      if (!ownId || String(ownId) !== String(req.params.id)) {
        return res.status(403).json({ message: 'You can only view your own commission.' });
      }
    }
    const staffId = req.params.id;
    const dateFilter = {};
    if (req.query.month) {
      const [year, month] = req.query.month.split('-');
      const start = `${year}-${month}-01`;
      const last  = new Date(year, month, 0).getDate();
      const end   = `${year}-${month}-${last}`;
      dateFilter.date = { [Op.between]: [start, end] };
    }

    const paymentInclude = [
      { model: Service,     as: 'service',     attributes: ['id', 'name'] },
      { model: Appointment, as: 'appointment', attributes: ['id', 'date', 'time', 'customer_name'] },
      { model: Staff,       as: 'staff',       attributes: ['id', 'name'] },
    ];

    const [workerPayments, oversightPayments] = await Promise.all([
      Payment.findAll({
        where: { staff_id: staffId, ...tenantWhere(req), ...dateFilter },
        include: paymentInclude,
        order: [['date', 'DESC']],
      }),
      hasFranchiseCommission(req.tenant)
        ? Payment.findAll({
          where: { manager_staff_id: staffId, ...tenantWhere(req), ...dateFilter },
          include: paymentInclude,
          order: [['date', 'DESC']],
        })
        : Promise.resolve([]),
    ]);

    const seenPaymentIds = new Set();
    const payments = [...workerPayments, ...oversightPayments]
      .filter((p) => {
        if (seenPaymentIds.has(p.id)) return false;
        seenPaymentIds.add(p.id);
        return true;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date) || (b.id - a.id));

    const totalCommission = payments.reduce((acc, p) => {
      if (Number(p.manager_staff_id) === Number(staffId)) {
        return acc + parseFloat(p.manager_commission_amount || 0);
      }
      return acc + parseFloat(p.commission_amount || 0);
    }, 0);

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

    const paymentRows = await Promise.all(payments.map(async (payment) => {
      const json = payment.toJSON();
      const isOversight = Number(payment.manager_staff_id) === Number(staffId);
      json.commission_role = isOversight ? 'manager_oversight' : 'worker';
      json.display_commission_amount = isOversight
        ? parseFloat(payment.manager_commission_amount || 0)
        : parseFloat(payment.commission_amount || 0);
      if (isOversight) {
        json.commission_breakdown = managerOversightBreakdown(
          payment,
          payment.manager_commission_breakdown,
        );
      } else {
        json.commission_breakdown = parseJsonField(payment.commission_breakdown)
          || await breakdownForPayment(payment, req.tenant, req);
      }
      if (isOversight) {
        json.oversight_performer = payment.staff
          ? { id: payment.staff.id, name: payment.staff.name }
          : null;
      }
      return json;
    }));

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
      staff: staffRecord ? { id: staffRecord.id, name: staffRecord.name } : null,
      data: paymentRows,
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

    const specItems = resolveSpecItems(req, extractSpecializationItems({
      specializations: req.body.specializations,
      service_ids: serviceIds,
    }), staff.salary_type || 'commission_only');
    await replaceStaffSpecializations(staff.id, specItems);

    const updated = await StaffSpecialization.findAll({
      where: { staff_id: staff.id },
      include: [{ model: Service, as: 'service', attributes: ['id', 'name'] }],
    });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, getOne, create, update, remove, myCommission, commissionSummary, commissionReport, setSpecializations };
