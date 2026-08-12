const fs = require('fs').promises;
const path = require('path');
const { Op, fn, col, literal } = require('sequelize');
const { sequelize } = require('../config/database');
const {
  Staff, Branch, StaffBranch, StaffSpecialization, StaffOffDay, Service,
  Appointment, Payment, User, StaffAdvance, CommissionPayout,
  Attendance, WalkIn, Waitlist, CommissionTransaction, InvConsumption, StaffFcmToken,
  PackageRedemption, Tenant,
} = require('../models');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');
const {
  DEFAULT_STAFF_ROLE_TITLES,
  normalizeRoleTitle,
  mergeRoleTitles,
  parseStoredRoleTitles,
} = require('../constants/staffRoleTitles');
const { normalizeStaffSpecializations } = require('../utils/commissionCalculator');
const {
  applyServiceWiseCommissionPolicy,
  hasTenantFeature,
  hasServiceWiseCommissionForUser,
  sanitizeStaffRecord,
} = require('../utils/tenantFeatures');
const { breakdownForPayment } = require('../services/paymentCommissionBreakdown');
const { hasFranchiseCommission } = require('../utils/tenantFeatures');
const { staffCommissionShares, shareForStaff } = require('../utils/paymentCommissionTotals');
const {
  defaultWorkingHours,
  normalizeWorkingHours,
  normalizeOffDayDates,
} = require('../utils/staffSchedule');

function staffPhotoLocalPath(photoUrl) {
  if (!photoUrl || typeof photoUrl !== 'string') return null;
  const rel = photoUrl.replace(/^https?:\/\/[^/]+/i, '');
  if (!rel.startsWith('/uploads/staff/')) return null;
  return path.join(__dirname, '..', rel.replace(/^\//, ''));
}

async function unlinkStaffPhotoFile(photoUrl) {
  const abs = staffPhotoLocalPath(photoUrl);
  if (!abs) return;
  try { await fs.unlink(abs); } catch { /* ignore missing file */ }
}

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

function parseBoolFlag(raw, fallback = true) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  return raw === true || raw === 'true' || raw === 1 || raw === '1';
}

function staffRequiresCommission(salaryType) {
  return salaryType === 'commission_only'
    || salaryType === 'salary_plus_commission'
    || salaryType === 'daily_salary_plus_commission';
}

function staffUsesBaseSalary(salaryType) {
  return salaryType === 'salary_only'
    || salaryType === 'salary_plus_commission'
    || salaryType === 'daily_salary_plus_commission';
}

/** Present or late days count toward per-day salary (unique dates).
 *  Staff IDs are already tenant-scoped; do not require attendance.tenant_id
 *  so legacy rows with null tenant_id still count.
 */
async function presentDaysMapForMonth(req, staffIds, year, month) {
  const map = {};
  if (!staffIds?.length || !year || !month) return map;
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const start = `${ym}-01`;
  const last = new Date(Number(year), Number(month), 0).getDate();
  const end = `${ym}-${String(last).padStart(2, '0')}`;
  const ids = staffIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  if (!ids.length) return map;
  const rows = await Attendance.findAll({
    where: {
      staff_id: { [Op.in]: ids },
      date: { [Op.between]: [start, end] },
      status: { [Op.in]: ['present', 'late'] },
    },
    attributes: [
      'staff_id',
      [fn('COUNT', fn('DISTINCT', col('Attendance.date'))), 'days'],
    ],
    group: ['staff_id'],
    raw: true,
  });
  for (const row of rows) {
    // Normalize keys so Number / string staff ids both resolve
    const sid = Number(row.staff_id);
    const days = parseInt(row.days, 10) || 0;
    if (Number.isFinite(sid)) map[sid] = days;
  }
  return map;
}

function computeGrossPayable(salaryType, baseSalary, totalCommission, presentDays = 0) {
  if (salaryType === 'salary_only') return baseSalary;
  if (salaryType === 'salary_plus_commission') return baseSalary + totalCommission;
  if (salaryType === 'daily_salary_plus_commission') {
    return (baseSalary * (presentDays || 0)) + totalCommission;
  }
  return totalCommission;
}

async function resolveTenantForRoles(req) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) return null;
  return Tenant.findByPk(tenantId);
}

async function collectStaffRoleTitles(req) {
  const tenant = await resolveTenantForRoles(req);
  const custom = parseStoredRoleTitles(tenant?.staff_role_titles);
  let used = [];
  try {
    const rows = await Staff.findAll({
      where: {
        ...tenantWhere(req),
        role_title: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] },
      },
      attributes: ['role_title'],
      group: ['role_title'],
      raw: true,
    });
    used = rows.map((r) => r.role_title);
  } catch (err) {
    console.warn('listStaffRoles used-titles skipped:', err.message);
  }
  return {
    tenant,
    titles: mergeRoleTitles(DEFAULT_STAFF_ROLE_TITLES, custom, used),
    custom,
  };
}

async function ensureRoleTitleSaved(req, roleTitle) {
  const title = normalizeRoleTitle(roleTitle);
  if (!title) return;
  const tenant = await resolveTenantForRoles(req);
  if (!tenant) return;
  const custom = parseStoredRoleTitles(tenant.staff_role_titles);
  const merged = mergeRoleTitles(DEFAULT_STAFF_ROLE_TITLES, custom);
  if (merged.some((t) => t.toLowerCase() === title.toLowerCase())) {
    // Already known via defaults or custom — still persist custom if not default
    if (!DEFAULT_STAFF_ROLE_TITLES.some((t) => t.toLowerCase() === title.toLowerCase())
      && !custom.some((t) => t.toLowerCase() === title.toLowerCase())) {
      await tenant.update({ staff_role_titles: mergeRoleTitles(custom, [title]) });
    }
    return;
  }
  await tenant.update({ staff_role_titles: mergeRoleTitles(custom, [title]) });
}

const listRoles = async (req, res) => {
  try {
    const { titles, custom } = await collectStaffRoleTitles(req);
    return res.json({
      data: titles,
      defaults: DEFAULT_STAFF_ROLE_TITLES,
      custom,
    });
  } catch (err) {
    console.error('listStaffRoles error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const addRole = async (req, res) => {
  try {
    const title = normalizeRoleTitle(req.body?.title ?? req.body?.role_title);
    if (!title) return res.status(400).json({ message: 'Role title is required.' });

    const tenant = await resolveTenantForRoles(req);
    if (!tenant) return res.status(400).json({ message: 'Tenant not found.' });

    const custom = parseStoredRoleTitles(tenant.staff_role_titles);
    const all = mergeRoleTitles(DEFAULT_STAFF_ROLE_TITLES, custom);
    if (all.some((t) => t.toLowerCase() === title.toLowerCase())) {
      const { titles } = await collectStaffRoleTitles(req);
      return res.json({ message: 'Role already exists.', title, data: titles });
    }

    const next = mergeRoleTitles(custom, [title]);
    await tenant.update({ staff_role_titles: next });
    const { titles } = await collectStaffRoleTitles(req);
    return res.status(201).json({ message: 'Role added.', title, data: titles });
  } catch (err) {
    console.error('addStaffRole error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const removeRole = async (req, res) => {
  try {
    const title = normalizeRoleTitle(req.params.title || req.body?.title);
    if (!title) return res.status(400).json({ message: 'Role title is required.' });

    if (DEFAULT_STAFF_ROLE_TITLES.some((t) => t.toLowerCase() === title.toLowerCase())) {
      return res.status(400).json({ message: 'Default system roles cannot be removed.' });
    }

    const tenant = await resolveTenantForRoles(req);
    if (!tenant) return res.status(400).json({ message: 'Tenant not found.' });

    const custom = parseStoredRoleTitles(tenant.staff_role_titles)
      .filter((t) => t.toLowerCase() !== title.toLowerCase());
    await tenant.update({ staff_role_titles: custom });
    const { titles } = await collectStaffRoleTitles(req);
    return res.json({ message: 'Role removed.', data: titles });
  } catch (err) {
    console.error('removeStaffRole error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

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
  const salary_type = ['commission_only', 'salary_only', 'salary_plus_commission', 'daily_salary_plus_commission'].includes(body.salary_type)
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

async function replaceStaffOffDays(staffId, tenantId, items) {
  await StaffOffDay.destroy({ where: { staff_id: staffId } });
  if (!items.length) return;
  await StaffOffDay.bulkCreate(
    items.map((item) => ({
      staff_id: staffId,
      date: item.date,
      reason: item.reason || null,
      tenant_id: tenantId || null,
    })),
    { ignoreDuplicates: true },
  );
}

const staffDetailInclude = [
  { model: Branch, as: 'branch', attributes: ['id', 'name', 'color'] },
  { model: Branch, as: 'branches', attributes: ['id', 'name', 'color'], through: { attributes: [] } },
  {
    model: StaffSpecialization,
    as: 'specializations',
    include: [{ model: Service, as: 'service', attributes: ['id', 'name', 'category'] }],
  },
  {
    model: StaffOffDay,
    as: 'offDays',
    attributes: ['id', 'date', 'reason'],
    required: false,
  },
  { model: User, as: 'user', attributes: ['id', 'username', 'name', 'role'], required: false },
];

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

const staffListInclude = staffDetailInclude.filter((inc) => inc.as !== 'offDays');

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
      distinct: true,
      include: staffListInclude,
    });

    return res.json({
      total: count,
      page,
      limit,
      data: rows.map((row) => {
        const mapped = mapStaff(row, req.tenant);
        if (!mapped.working_hours) mapped.working_hours = defaultWorkingHours();
        return mapped;
      }),
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
      include: staffDetailInclude,
    });

    if (!staff) return res.status(404).json({ message: 'Staff not found.' });

    // Appointment count & total commission
    const scope = tenantWhere(req);
    const apptCount = await Appointment.count({ where: { staff_id: staff.id, ...scope } });
    const commSum   = await Payment.sum('commission_amount', { where: { staff_id: staff.id, ...scope } });

    const mapped = mapStaff(staff, req.tenant);
    if (!mapped.working_hours) mapped.working_hours = defaultWorkingHours();

    return res.json({
      ...mapped,
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
    const hasServicePayload = Array.isArray(req.body.specializations) || Array.isArray(req.body.service_ids);
    let specItems = resolveSpecItems(req, extractSpecializationItems(req.body), salary_type);

    if (staffRequiresCommission(salary_type) && (commission_value == null || commission_value <= 0)) {
      return res.status(400).json({ message: 'Default commission rate is required for commission-based staff.' });
    }

    // Only link services the caller sent. Empty / omitted = no assignable services
    // (online booking shows staff only for explicitly assigned services).
    if (!hasServicePayload) {
      specItems = [];
    } else if (hasServiceWiseCommissionForUser(req.tenant, req)
      && salary_type !== 'salary_only' && specItems.length && (commission_value == null || commission_value <= 0)) {
      return res.status(400).json({ message: 'Default commission rate is required when services are selected.' });
    }

    const tenantId = resolveTenantId(req);
    const available_online = parseBoolFlag(req.body.available_online, false);
    const working_hours = req.body.working_hours !== undefined
      ? normalizeWorkingHours(req.body.working_hours)
      : defaultWorkingHours();
    const offDayItems = normalizeOffDayDates(req.body.off_days ?? req.body.offDays);

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
      available_online,
      working_hours,
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
    await replaceStaffOffDays(staff.id, tenantId, offDayItems);
    await syncLinkedUserBranch(staff, tenantId);
    await ensureRoleTitleSaved(req, role_title);

    const created = await Staff.findOne({
      where: { id: staff.id },
      include: staffDetailInclude,
    });

    const mapped = mapStaff(created || staff, req.tenant);
    if (!mapped.working_hours) mapped.working_hours = defaultWorkingHours();
    return res.status(201).json(mapped);
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
    if (req.body.available_online !== undefined) {
      updates.available_online = parseBoolFlag(req.body.available_online, true);
    }
    if (req.body.working_hours !== undefined) {
      updates.working_hours = normalizeWorkingHours(req.body.working_hours);
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
    await ensureRoleTitleSaved(req, refreshedForRole.role_title);

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

    if (hasServicePayload) {
      const specItems = resolveSpecItems(req, extractSpecializationItems(req.body), effectiveSalaryType);
      const effectiveCommission = refreshedStaff.commission_value;
      if (hasServiceWiseCommissionForUser(req.tenant, req)
        && effectiveSalaryType !== 'salary_only' && specItems.length && (effectiveCommission == null || parseFloat(effectiveCommission) <= 0)) {
        return res.status(400).json({ message: 'Default commission rate is required when services are selected.' });
      }
      await syncStaffSpecializations(staff.id, specItems);
    }

    if (req.body.off_days !== undefined || req.body.offDays !== undefined) {
      const offDayItems = normalizeOffDayDates(req.body.off_days ?? req.body.offDays);
      await replaceStaffOffDays(staff.id, resolveTenantId(req), offDayItems);
    }

    const refreshed = await Staff.findOne({
      where: { id: staff.id },
      include: staffDetailInclude,
    });

    await syncLinkedUserBranch(refreshedStaff || staff, resolveTenantId(req));

    const mapped = mapStaff(refreshed || staff, req.tenant);
    if (!mapped.working_hours) mapped.working_hours = defaultWorkingHours();
    return res.json(mapped);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const staff = await Staff.findOne({ where: byIdWhere(req, req.params.id), transaction: t });
    if (!staff) {
      await t.rollback();
      return res.status(404).json({ message: 'Staff not found.' });
    }

    const staffId = staff.id;
    const photoUrl = staff.photo_url;

    // Child rows that require this staff (NOT NULL FKs) — remove first
    await StaffSpecialization.destroy({ where: { staff_id: staffId }, transaction: t });
    await StaffOffDay.destroy({ where: { staff_id: staffId }, transaction: t });
    await StaffBranch.destroy({ where: { staff_id: staffId }, transaction: t });
    await Attendance.destroy({ where: { staff_id: staffId }, transaction: t });
    await StaffAdvance.destroy({ where: { staff_id: staffId }, transaction: t });
    await CommissionPayout.destroy({ where: { staff_id: staffId }, transaction: t });
    if (staff.user_id) {
      await StaffFcmToken.destroy({ where: { user_id: staff.user_id }, transaction: t }).catch(() => 0);
    }

    // Historical records — keep rows, clear staff link
    await Appointment.update({ staff_id: null }, { where: { staff_id: staffId }, transaction: t });
    await Payment.update({ staff_id: null }, { where: { staff_id: staffId }, transaction: t });
    await Payment.update({ manager_staff_id: null }, { where: { manager_staff_id: staffId }, transaction: t });
    await WalkIn.update({ staff_id: null }, { where: { staff_id: staffId }, transaction: t });
    await Waitlist.update({ staff_id: null }, { where: { staff_id: staffId }, transaction: t });
    try {
      await PackageRedemption.update({ redeemed_by: null }, { where: { redeemed_by: staffId }, transaction: t });
    } catch { /* optional */ }
    try {
      await InvConsumption.update({ staff_id: null }, { where: { staff_id: staffId }, transaction: t });
    } catch { /* column/table may be absent on older DBs */ }
    try {
      await CommissionTransaction.update(
        { worker_staff_id: null },
        { where: { worker_staff_id: staffId }, transaction: t },
      );
      await CommissionTransaction.update(
        { manager_staff_id: null },
        { where: { manager_staff_id: staffId }, transaction: t },
      );
    } catch { /* franchise table optional */ }

    await staff.destroy({ transaction: t });
    await t.commit();

    unlinkStaffPhotoFile(photoUrl).catch(() => {});
    return res.json({ message: 'Staff deleted.' });
  } catch (err) {
    await t.rollback().catch(() => {});
    console.error('staff.remove error:', err);
    const isFk = /foreign key|ER_ROW_IS_REFERENCED|1451/i.test(err.message || '');
    return res.status(isFk ? 409 : 500).json({
      message: isFk
        ? 'Cannot delete this staff — still linked to other records. Deactivate them instead.'
        : (err.message || 'Failed to delete staff.'),
    });
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

    const staffIds = staffRows.map((s) => Number(s.id));
    const staffIdSet = new Set(staffIds);

    const periodPayments = await Payment.findAll({
      where: paymentWhere,
      attributes: [
        'id', 'staff_id', 'total_amount', 'commission_amount', 'commission_breakdown',
        'helper_commission', 'manager_staff_id', 'manager_commission_amount',
      ],
      raw: true,
    });

    const aggMap = {};
    const bump = (id, { commission = 0, revenue = 0, count = 0 } = {}) => {
      const prev = aggMap[id] || { totalRevenue: 0, totalCommission: 0, appointmentCount: 0 };
      aggMap[id] = {
        totalRevenue: prev.totalRevenue + (parseFloat(revenue) || 0),
        totalCommission: prev.totalCommission + (parseFloat(commission) || 0),
        appointmentCount: prev.appointmentCount + (parseInt(count, 10) || 0),
      };
    };

    for (const p of periodPayments) {
      for (const share of staffCommissionShares(p)) {
        if (!staffIdSet.has(Number(share.staff_id))) continue;
        bump(Number(share.staff_id), {
          commission: share.amount,
          revenue: share.revenue,
          count: 1,
        });
      }
    }

    if (hasFranchiseCommission(req.tenant)) {
      try {
        for (const p of periodPayments) {
          const mid = Number(p.manager_staff_id);
          const mamt = parseFloat(p.manager_commission_amount) || 0;
          if (!staffIdSet.has(mid) || !(mamt > 0)) continue;
          bump(mid, { commission: mamt, count: 1 });
        }
      } catch (mgrErr) {
        console.warn('commissionSummary manager_agg skipped:', mgrErr.message);
      }
    }

    // Fetch pending advance totals + paid payout totals for the same month
    const advMap  = {};
    const paidMap = {};
    let presentMap = {};
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

      try {
        presentMap = await presentDaysMapForMonth(req, staffIds, year, month);
      } catch (attErr) {
        console.warn('commissionSummary attendance days skipped:', attErr.message);
      }
    }

    const results = staffRows.map((staff) => {
      const agg             = aggMap[Number(staff.id)] || aggMap[staff.id] || { totalRevenue: 0, totalCommission: 0, appointmentCount: 0 };
      const totalCommission = Math.round((parseFloat(agg.totalCommission) || 0) * 100) / 100;
      const totalAdvances   = advMap[staff.id]  || 0;
      const totalPaid       = paidMap[staff.id] || 0;
      const baseSalary      = parseFloat(staff.base_salary) || 0;
      const salaryType      = staff.salary_type || 'commission_only';
      const presentDays     = presentMap[Number(staff.id)] || 0;
      const dailySalaryEarned = salaryType === 'daily_salary_plus_commission'
        ? baseSalary * presentDays
        : 0;

      // Net payable depends on salary_type:
      //  commission_only                 → commission - advances
      //  salary_only                     → base_salary - advances
      //  salary_plus_commission          → base_salary + commission - advances
      //  daily_salary_plus_commission    → (daily × present/late days) + commission - advances
      const grossPayable = computeGrossPayable(salaryType, baseSalary, totalCommission, presentDays);
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
        presentDays,
        dailySalaryEarned,
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

    const [periodPayments, oversightPayments] = await Promise.all([
      Payment.findAll({
        where: { ...tenantWhere(req), ...dateFilter },
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

    const sid = Number(staffId);
    const paymentRows = [];
    let totalCommission = 0;
    const seenKeys = new Set();

    const pushRow = (json, role, amount, extra = {}) => {
      const key = `${role}-${json.id}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      totalCommission += parseFloat(amount) || 0;
      paymentRows.push({
        ...json,
        commission_role: role,
        display_commission_amount: parseFloat(amount) || 0,
        ...extra,
      });
    };

    for (const payment of periodPayments) {
      const json = payment.toJSON();
      const share = shareForStaff(json, sid);
      if (share) {
        if (share.role === 'helper') {
          const hc = parseJsonField(payment.helper_commission);
          const line = share.helper || (hc?.helpers || []).find((h) => Number(h.staff_id) === sid);
          pushRow(json, 'helper', share.amount, {
            commission_breakdown: {
              total: share.amount,
              note: 'Helper commission from main staff',
              lines: line ? [{
                serviceName: payment.service?.name || 'Helper share',
                lineBase: hc?.grossMain || 0,
                rateLabel: line.rateLabel || `${line.commission_value}${line.commission_type === 'fixed' ? '' : '%'}`,
                source: 'helper',
                sourceLabel: 'Helper commission',
                commission: share.amount,
              }] : [],
            },
            helper_main_staff: payment.staff
              ? { id: payment.staff.id, name: payment.staff.name }
              : null,
          });
        } else {
          const bd = share.breakdown
            || parseJsonField(payment.commission_breakdown)
            || await breakdownForPayment(payment, req.tenant, req);
          pushRow(json, Number(json.staff_id) === sid ? 'worker' : 'co_worker', share.amount, {
            commission_breakdown: bd,
          });
        }
      }
    }

    for (const payment of oversightPayments) {
      const json = payment.toJSON();
      pushRow(json, 'manager_oversight', payment.manager_commission_amount, {
        commission_breakdown: managerOversightBreakdown(
          payment,
          payment.manager_commission_breakdown,
        ),
        oversight_performer: payment.staff
          ? { id: payment.staff.id, name: payment.staff.name }
          : null,
      });
    }

    paymentRows.sort((a, b) => new Date(b.date) - new Date(a.date) || (b.id - a.id));
    totalCommission = Math.round(totalCommission * 100) / 100;

    // Fetch staff salary info for correct gross calculation
    const staffRecord = await Staff.findOne({ where: { id: req.params.id, ...tenantWhere(req) } });
    const salaryType  = staffRecord?.salary_type || 'commission_only';
    const baseSalary  = parseFloat(staffRecord?.base_salary) || 0;

    // Pending advances + commission payouts for this staff for the same month
    let totalAdvances = 0;
    let totalPaid     = 0;
    let presentDays   = 0;
    if (req.query.month) {
      const [yStr, mStr] = String(req.query.month).split('-');
      const [advRows, payoutRows, dayMap] = await Promise.all([
        StaffAdvance.findAll({
          where: { staff_id: req.params.id, month: req.query.month, status: 'pending', ...tenantWhere(req) },
          raw: true,
        }),
        CommissionPayout.findAll({
          where: { staff_id: req.params.id, month: req.query.month, ...tenantWhere(req) },
          raw: true,
        }),
        presentDaysMapForMonth(req, [Number(req.params.id)], yStr, mStr).catch(() => ({})),
      ]);
      totalAdvances = advRows.reduce((s, a) => s + parseFloat(a.amount || 0), 0);
      totalPaid     = payoutRows.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
      presentDays   = dayMap[Number(req.params.id)] || 0;
    }

    const grossPayable = computeGrossPayable(salaryType, baseSalary, totalCommission, presentDays);
    const dailySalaryEarned = salaryType === 'daily_salary_plus_commission'
      ? baseSalary * presentDays
      : 0;
    const netPayable = Math.max(0, grossPayable - totalAdvances);

    return res.json({
      total: totalCommission,
      totalCommission,
      baseSalary,
      salaryType,
      presentDays,
      dailySalaryEarned,
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

const uploadPhoto = async (req, res) => {
  try {
    const staff = await Staff.findOne({ where: byIdWhere(req, req.params.id) });
    if (!staff) {
      if (req.file?.path) {
        try { await fs.unlink(req.file.path); } catch { /* ignore */ }
      }
      return res.status(404).json({ message: 'Staff not found.' });
    }
    if (!req.file) return res.status(400).json({ message: 'No photo uploaded.' });

    const tenantId = resolveTenantId(req) || staff.tenant_id || 'shared';
    const photo_url = `/uploads/staff/${tenantId}/${req.file.filename}`;
    await unlinkStaffPhotoFile(staff.photo_url);
    await staff.update({ photo_url });

    return res.json(mapStaff(staff, req.tenant));
  } catch (err) {
    console.error('staff.uploadPhoto error:', err);
    return res.status(500).json({ message: err.message || 'Failed to upload photo.' });
  }
};

const deletePhoto = async (req, res) => {
  try {
    const staff = await Staff.findOne({ where: byIdWhere(req, req.params.id) });
    if (!staff) return res.status(404).json({ message: 'Staff not found.' });

    await unlinkStaffPhotoFile(staff.photo_url);
    await staff.update({ photo_url: null });

    return res.json(mapStaff(staff, req.tenant));
  } catch (err) {
    console.error('staff.deletePhoto error:', err);
    return res.status(500).json({ message: err.message || 'Failed to remove photo.' });
  }
};

module.exports = {
  list, getOne, create, update, remove,
  myCommission, commissionSummary, commissionReport, setSpecializations,
  uploadPhoto, deletePhoto,
  listRoles, addRole, removeRole,
};
