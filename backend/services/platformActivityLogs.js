'use strict';

const { Op } = require('sequelize');
const {
  MaintenanceLog,
  PlanChangeLog,
  NotificationLog,
  SupportTicket,
  Payment,
  Appointment,
  Customer,
  Subscription,
  Tenant,
  User,
  Staff,
  Branch,
} = require('../models');

const SYSTEM_SOURCES = ['maintenance', 'plan'];
const TENANT_SOURCES = ['tenant', 'subscription', 'payment', 'appointment', 'customer', 'user', 'notification', 'support'];
const ALL_SOURCES = [...SYSTEM_SOURCES, ...TENANT_SOURCES];

function parseTenantId(raw) {
  if (raw == null || raw === '' || raw === 'all') return null;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function buildDateFilter(from, to, field = 'createdAt') {
  if (!from && !to) return null;
  const clause = {};
  if (from) clause[Op.gte] = new Date(from);
  if (to) clause[Op.lte] = new Date(`${to}T23:59:59.999`);
  return { [field]: clause };
}

function mergeWhere(...parts) {
  const merged = Object.assign({}, ...parts.filter(Boolean));
  return Object.keys(merged).length ? merged : undefined;
}

function matchesSearch(entry, search) {
  if (!search) return true;
  const q = search.toLowerCase();
  const hay = [
    entry.summary,
    entry.actor,
    entry.tenant_name,
    entry.branch_name,
    entry.source,
    entry.action,
    entry.detail,
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

function resolveTenantId(row, branch) {
  return row.tenant_id || branch?.tenant_id || null;
}

function normalizeMaintenance(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const actor = plain.changedBy?.name || plain.changedBy?.username || 'Platform admin';
  return {
    id: `maintenance-${plain.id}`,
    source: 'maintenance',
    action: plain.enabled ? 'maintenance_enabled' : 'maintenance_disabled',
    summary: plain.enabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled',
    detail: plain.message || null,
    actor,
    tenant_id: null,
    tenant_name: null,
    branch_name: null,
    status: plain.enabled ? 'active' : 'inactive',
    createdAt: plain.created_at || plain.createdAt,
  };
}

function normalizePlan(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const fields = Array.isArray(plain.changed_fields) ? plain.changed_fields.join(', ') : '';
  return {
    id: `plan-${plain.id}`,
    source: 'plan',
    action: `plan_${plain.action}`,
    summary: `Plan ${plain.action}: ${plain.plan_label} (${plain.plan_key})`,
    detail: fields || null,
    actor: plain.changed_by || 'Platform admin',
    tenant_id: null,
    tenant_name: null,
    branch_name: null,
    status: plain.action,
    createdAt: plain.createdAt,
  };
}

function normalizeTenantRow(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  return {
    id: `tenant-${plain.id}`,
    source: 'tenant',
    action: 'tenant_registered',
    summary: `Salon registered: ${plain.name}`,
    detail: plain.slug ? `/${plain.slug}` : null,
    actor: plain.email || 'Owner',
    tenant_id: plain.id,
    tenant_name: plain.name || plain.slug,
    branch_name: null,
    status: plain.status || 'active',
    createdAt: plain.createdAt,
  };
}

function normalizeSubscription(row, tenantMap) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const tenantName = tenantMap.get(plain.tenant_id) || `Tenant #${plain.tenant_id}`;
  return {
    id: `subscription-${plain.id}`,
    source: 'subscription',
    action: `subscription_${plain.status}`,
    summary: `Subscription ${plain.status}: ${plain.plan} plan`,
    detail: plain.stripe_subscription_id || null,
    actor: 'Billing',
    tenant_id: plain.tenant_id,
    tenant_name: tenantName,
    branch_name: null,
    status: plain.status,
    createdAt: plain.updatedAt || plain.createdAt,
  };
}

function normalizePayment(row, tenantMap) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const tenantId = resolveTenantId(plain, plain.branch);
  const tenantName = tenantId ? tenantMap.get(tenantId) || `Tenant #${tenantId}` : null;
  const amount = parseFloat(plain.total_amount || 0).toFixed(2);
  return {
    id: `payment-${plain.id}`,
    source: 'payment',
    action: `payment_${plain.status}`,
    summary: `Payment Rs. ${amount} — ${plain.customer_name || 'Walk-in'}`,
    detail: plain.branch?.name || null,
    actor: plain.staff?.name || plain.customer_name || 'Staff',
    tenant_id: tenantId,
    tenant_name: tenantName,
    branch_name: plain.branch?.name || null,
    status: plain.status,
    createdAt: plain.createdAt,
  };
}

function normalizeAppointment(row, tenantMap) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const tenantId = resolveTenantId(plain, plain.branch);
  const tenantName = tenantId ? tenantMap.get(tenantId) || `Tenant #${tenantId}` : null;
  const when = [plain.date, plain.time].filter(Boolean).join(' ');
  return {
    id: `appointment-${plain.id}`,
    source: 'appointment',
    action: `appointment_${plain.status}`,
    summary: `Appointment ${plain.status}: ${plain.customer_name}`,
    detail: when || plain.branch?.name || null,
    actor: plain.staff?.name || plain.customer_name || 'Customer',
    tenant_id: tenantId,
    tenant_name: tenantName,
    branch_name: plain.branch?.name || null,
    status: plain.status,
    createdAt: plain.updatedAt || plain.createdAt,
  };
}

function normalizeCustomer(row, tenantMap, branchMap) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const branch = plain.branch_id ? branchMap.get(plain.branch_id) : null;
  const tenantId = resolveTenantId(plain, branch);
  const tenantName = tenantId ? tenantMap.get(tenantId) || `Tenant #${tenantId}` : null;
  return {
    id: `customer-${plain.id}`,
    source: 'customer',
    action: 'customer_created',
    summary: `New customer: ${plain.name}`,
    detail: plain.phone || plain.email || null,
    actor: plain.name,
    tenant_id: tenantId,
    tenant_name: tenantName,
    branch_name: branch?.name || null,
    status: 'created',
    createdAt: plain.createdAt,
  };
}

function normalizeUser(row, tenantMap) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const tenantName = plain.tenant_id ? tenantMap.get(plain.tenant_id) || `Tenant #${plain.tenant_id}` : null;
  return {
    id: `user-${plain.id}`,
    source: 'user',
    action: `user_${plain.role}`,
    summary: `User added: ${plain.name} (${plain.role})`,
    detail: plain.username || null,
    actor: plain.name,
    tenant_id: plain.tenant_id || null,
    tenant_name: tenantName,
    branch_name: plain.branch?.name || null,
    status: plain.is_active ? 'active' : 'inactive',
    createdAt: plain.createdAt,
  };
}

function normalizeNotification(row, tenantMap) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const tenantName = plain.tenant_id ? tenantMap.get(plain.tenant_id) || `Tenant #${plain.tenant_id}` : null;
  return {
    id: `notification-${plain.id}`,
    source: 'notification',
    action: `${plain.channel}_${plain.event_type}`,
    summary: `${plain.channel.toUpperCase()} ${plain.event_type.replace(/_/g, ' ')} — ${plain.status}`,
    detail: plain.message_preview || plain.error_message || plain.customer_name || null,
    actor: plain.customer_name || plain.email || plain.phone || 'System',
    tenant_id: plain.tenant_id || null,
    tenant_name: tenantName,
    branch_name: plain.branch?.name || null,
    status: plain.status,
    createdAt: plain.createdAt,
  };
}

function normalizeSupportTicket(row, tenantMap, userMap) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const actor = userMap.get(plain.created_by_user_id) || 'User';
  const tenantName = plain.tenant_id ? tenantMap.get(plain.tenant_id) || `Tenant #${plain.tenant_id}` : null;
  return {
    id: `support-${plain.id}`,
    source: 'support',
    action: `ticket_${plain.status}`,
    summary: `Support ticket ${plain.ticket_no}: ${plain.subject}`,
    detail: `${plain.category} · ${plain.priority} priority`,
    actor,
    tenant_id: plain.tenant_id || null,
    tenant_name: tenantName,
    branch_name: null,
    status: plain.status,
    createdAt: plain.updatedAt || plain.createdAt,
  };
}

async function fetchMaintenanceLogs(createdAt, cap) {
  try {
    return await MaintenanceLog.findAll({
      where: createdAt || {},
      order: [['created_at', 'DESC']],
      limit: cap,
      include: [{ model: User, as: 'changedBy', attributes: ['id', 'name', 'username', 'role'], required: false }],
    });
  } catch {
    return MaintenanceLog.findAll({
      where: createdAt || {},
      order: [['created_at', 'DESC']],
      limit: cap,
    });
  }
}

async function loadTenantMap(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await Tenant.findAll({ where: { id: unique }, attributes: ['id', 'name', 'slug'] });
  return new Map(rows.map((t) => [t.id, t.name || t.slug || `Tenant #${t.id}`]));
}

async function loadBranchMap(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await Branch.findAll({ where: { id: unique }, attributes: ['id', 'name', 'tenant_id'] });
  return new Map(rows.map((b) => [b.id, b]));
}

async function loadUserMap(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await User.findAll({ where: { id: unique }, attributes: ['id', 'name', 'username'] });
  return new Map(rows.map((u) => [u.id, u.name || u.username || `User #${u.id}`]));
}

function resolveSources(source, tenantId) {
  if (source !== 'all' && ALL_SOURCES.includes(source)) return [source];
  if (tenantId) return TENANT_SOURCES;
  return ALL_SOURCES;
}

async function fetchActivityLogs(options = {}) {
  const {
    source = 'all',
    tenant_id: tenantIdRaw,
    from,
    to,
    search = '',
    page = 1,
    limit = 50,
  } = options;

  const tenantId = parseTenantId(tenantIdRaw);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const fetchCap = Math.min(safePage * safeLimit * 3, 3000);

  const createdAtMaint = buildDateFilter(from, to, 'created_at');
  const createdAtDefault = buildDateFilter(from, to, 'createdAt');
  const updatedAtSupport = buildDateFilter(from, to, 'updatedAt');
  const tenantClause = tenantId ? { tenant_id: tenantId } : null;

  const sources = resolveSources(source, tenantId);

  const countPromises = {};
  if (sources.includes('maintenance')) {
    countPromises.maintenance = MaintenanceLog.count({ where: createdAtMaint || {} });
  }
  if (sources.includes('plan')) {
    countPromises.plan = PlanChangeLog.count({ where: createdAtDefault || {} });
  }
  if (sources.includes('tenant')) {
    countPromises.tenant = Tenant.count({ where: mergeWhere(createdAtDefault, tenantId ? { id: tenantId } : null) });
  }
  if (sources.includes('subscription')) {
    countPromises.subscription = Subscription.count({ where: mergeWhere(createdAtDefault, tenantClause) });
  }
  if (sources.includes('payment')) {
    countPromises.payment = Payment.count({ where: mergeWhere(createdAtDefault, tenantClause) });
  }
  if (sources.includes('appointment')) {
    countPromises.appointment = Appointment.count({ where: mergeWhere(createdAtDefault, tenantClause) });
  }
  if (sources.includes('customer')) {
    countPromises.customer = Customer.count({ where: mergeWhere(createdAtDefault, tenantClause) });
  }
  if (sources.includes('user')) {
    countPromises.user = User.count({
      where: mergeWhere(createdAtDefault, tenantClause, { role: { [Op.ne]: 'platform_admin' } }),
    });
  }
  if (sources.includes('notification')) {
    countPromises.notification = NotificationLog.count({ where: mergeWhere(createdAtDefault, tenantClause) });
  }
  if (sources.includes('support')) {
    countPromises.support = SupportTicket.count({ where: mergeWhere(updatedAtSupport, tenantClause) });
  }

  const entries = [];

  if (sources.includes('maintenance')) {
    const rows = await fetchMaintenanceLogs(createdAtMaint, fetchCap);
    entries.push(...rows.map(normalizeMaintenance));
  }

  if (sources.includes('plan')) {
    const rows = await PlanChangeLog.findAll({
      where: createdAtDefault || {},
      order: [['createdAt', 'DESC']],
      limit: fetchCap,
    });
    entries.push(...rows.map(normalizePlan));
  }

  if (sources.includes('tenant')) {
    const rows = await Tenant.findAll({
      where: mergeWhere(createdAtDefault, tenantId ? { id: tenantId } : null),
      order: [['createdAt', 'DESC']],
      limit: fetchCap,
      attributes: ['id', 'name', 'slug', 'email', 'status', 'createdAt'],
    });
    entries.push(...rows.map(normalizeTenantRow));
  }

  if (sources.includes('subscription')) {
    const rows = await Subscription.findAll({
      where: mergeWhere(createdAtDefault, tenantClause),
      order: [['updatedAt', 'DESC']],
      limit: fetchCap,
    });
    const tenantMap = await loadTenantMap(rows.map((r) => r.tenant_id));
    entries.push(...rows.map((r) => normalizeSubscription(r, tenantMap)));
  }

  if (sources.includes('payment')) {
    const rows = await Payment.findAll({
      where: mergeWhere(createdAtDefault, tenantClause),
      order: [['createdAt', 'DESC']],
      limit: fetchCap,
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'tenant_id'], required: false },
        { model: Staff, as: 'staff', attributes: ['id', 'name'], required: false },
      ],
    });
    const tenantMap = await loadTenantMap(rows.map((r) => resolveTenantId(r, r.branch)));
    entries.push(...rows.map((r) => normalizePayment(r, tenantMap)));
  }

  if (sources.includes('appointment')) {
    const rows = await Appointment.findAll({
      where: mergeWhere(createdAtDefault, tenantClause),
      order: [['updatedAt', 'DESC']],
      limit: fetchCap,
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'tenant_id'], required: false },
        { model: Staff, as: 'staff', attributes: ['id', 'name'], required: false },
      ],
    });
    const tenantMap = await loadTenantMap(rows.map((r) => resolveTenantId(r, r.branch)));
    entries.push(...rows.map((r) => normalizeAppointment(r, tenantMap)));
  }

  if (sources.includes('customer')) {
    const rows = await Customer.findAll({
      where: mergeWhere(createdAtDefault, tenantClause),
      order: [['createdAt', 'DESC']],
      limit: fetchCap,
    });
    const branchMap = await loadBranchMap(rows.map((r) => r.branch_id));
    const tenantMap = await loadTenantMap([
      ...rows.map((r) => r.tenant_id),
      ...[...branchMap.values()].map((b) => b.tenant_id),
    ]);
    entries.push(...rows.map((r) => normalizeCustomer(r, tenantMap, branchMap)));
  }

  if (sources.includes('user')) {
    const rows = await User.findAll({
      where: mergeWhere(createdAtDefault, tenantClause, { role: { [Op.ne]: 'platform_admin' } }),
      order: [['createdAt', 'DESC']],
      limit: fetchCap,
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'], required: false }],
    });
    const tenantMap = await loadTenantMap(rows.map((r) => r.tenant_id));
    entries.push(...rows.map((r) => normalizeUser(r, tenantMap)));
  }

  if (sources.includes('notification')) {
    const rows = await NotificationLog.findAll({
      where: mergeWhere(createdAtDefault, tenantClause),
      order: [['createdAt', 'DESC']],
      limit: fetchCap,
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'], required: false }],
    });
    const tenantMap = await loadTenantMap(rows.map((r) => r.tenant_id));
    entries.push(...rows.map((r) => normalizeNotification(r, tenantMap)));
  }

  if (sources.includes('support')) {
    const rows = await SupportTicket.findAll({
      where: mergeWhere(updatedAtSupport, tenantClause),
      order: [['updatedAt', 'DESC']],
      limit: fetchCap,
    });
    const tenantMap = await loadTenantMap(rows.map((r) => r.tenant_id));
    const userMap = await loadUserMap(rows.map((r) => r.created_by_user_id));
    entries.push(...rows.map((r) => normalizeSupportTicket(r, tenantMap, userMap)));
  }

  let filtered = entries
    .filter((e) => (tenantId ? e.tenant_id === tenantId : true))
    .filter((e) => matchesSearch(e, search.trim()))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const countResults = await Promise.all(Object.values(countPromises));
  const counts = Object.fromEntries(
    Object.keys(countPromises).map((key, i) => [key, countResults[i]]),
  );
  const totalRaw = Object.values(counts).reduce((s, n) => s + n, 0);
  const total = search.trim() ? filtered.length : totalRaw;

  const offset = (safePage - 1) * safeLimit;
  const data = filtered.slice(offset, offset + safeLimit);

  return {
    total,
    page: safePage,
    limit: safeLimit,
    counts,
    tenant_id: tenantId,
    data,
  };
}

module.exports = { fetchActivityLogs };
