'use strict';

const { Op, fn, col, literal } = require('sequelize');
const {
  CrmAutomation,
  CrmAutomationExecution,
  CrmAuditLog,
  Customer,
  Appointment,
  Tenant,
} = require('../models');
const { AUTOMATION_CATALOG, interpolate } = require('./crmAutomationCatalog');
const { enqueue, QUEUE_NAMES } = require('./queue');

async function ensureDefaults(tenantId) {
  const existing = await CrmAutomation.findAll({
    where: { tenant_id: tenantId },
    attributes: ['id', 'type', 'name'],
  });
  const have = new Set(existing.map((r) => `${r.type}::${r.name}`));
  const created = [];
  for (const def of AUTOMATION_CATALOG) {
    const key = `${def.type}::${def.name}`;
    if (have.has(key)) continue;
    const row = await CrmAutomation.create({
      tenant_id: tenantId,
      name: def.name,
      type: def.type,
      enabled: !!def.enabled,
      trigger: def.trigger,
      channel: def.channel,
      delay: def.delay,
      schedule: def.schedule,
      template_id: null,
      settings_json: def.settings_json || {},
    });
    created.push(row);
  }
  return created;
}

async function listAutomations(tenantId) {
  await ensureDefaults(tenantId);
  return CrmAutomation.findAll({
    where: { tenant_id: tenantId },
    order: [['id', 'ASC']],
  });
}

async function getAutomation(tenantId, id) {
  return CrmAutomation.findOne({ where: { id, tenant_id: tenantId } });
}

async function createAutomation(tenantId, body, actorId = null) {
  const type = String(body.type || '').trim();
  if (!CrmAutomation.TYPES.includes(type)) {
    const err = new Error(`Invalid type. Use: ${CrmAutomation.TYPES.join(', ')}`);
    err.status = 400;
    throw err;
  }
  const row = await CrmAutomation.create({
    tenant_id: tenantId,
    name: String(body.name || type).slice(0, 120),
    type,
    enabled: body.enabled !== false && body.enabled !== 'false',
    trigger: body.trigger || null,
    channel: body.channel || 'whatsapp',
    delay: body.delay || null,
    schedule: body.schedule || null,
    template_id: body.template_id || null,
    settings_json: body.settings_json || body.settings || {},
  });
  await audit(tenantId, actorId, 'automation_created', row.id, { type: row.type });
  return row;
}

async function updateAutomation(tenantId, id, body, actorId = null) {
  const row = await getAutomation(tenantId, id);
  if (!row) {
    const err = new Error('Automation not found');
    err.status = 404;
    throw err;
  }
  const patch = {};
  for (const k of ['name', 'enabled', 'trigger', 'channel', 'delay', 'schedule', 'template_id']) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (body.settings_json !== undefined) patch.settings_json = body.settings_json;
  if (body.settings !== undefined) patch.settings_json = body.settings;
  if (patch.enabled !== undefined) patch.enabled = !!patch.enabled && patch.enabled !== 'false';
  await row.update(patch);
  await audit(tenantId, actorId, 'automation_updated', row.id, { fields: Object.keys(patch) });
  return row;
}

async function deleteAutomation(tenantId, id, actorId = null) {
  const row = await getAutomation(tenantId, id);
  if (!row) {
    const err = new Error('Automation not found');
    err.status = 404;
    throw err;
  }
  // Keep catalog defaults: soft-disable instead of hard-delete for seeded types
  const isCatalog = AUTOMATION_CATALOG.some((d) => d.type === row.type && d.name === row.name);
  if (isCatalog) {
    await row.update({ enabled: false });
    await audit(tenantId, actorId, 'automation_disabled', row.id, { reason: 'catalog_protected' });
    return { disabled: true, id: row.id };
  }
  await CrmAutomationExecution.destroy({ where: { automation_id: row.id, tenant_id: tenantId } });
  await row.destroy();
  await audit(tenantId, actorId, 'automation_deleted', id, {});
  return { deleted: true, id };
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getDashboard(tenantId) {
  await ensureDefaults(tenantId);
  const since = startOfToday();
  const [
    totalActive,
    todayRows,
    pending,
    failed,
    lastExec,
    avgDuration,
    byType,
  ] = await Promise.all([
    CrmAutomation.count({ where: { tenant_id: tenantId, enabled: true } }),
    CrmAutomationExecution.findAll({
      where: {
        tenant_id: tenantId,
        executed_at: { [Op.gte]: since },
      },
      attributes: ['status'],
      raw: true,
    }),
    CrmAutomationExecution.count({
      where: { tenant_id: tenantId, status: { [Op.in]: ['pending', 'running'] } },
    }),
    CrmAutomationExecution.count({
      where: {
        tenant_id: tenantId,
        status: 'failed',
        executed_at: { [Op.gte]: since },
      },
    }),
    CrmAutomationExecution.findOne({
      where: { tenant_id: tenantId, executed_at: { [Op.ne]: null } },
      order: [['executed_at', 'DESC']],
      include: [{ model: CrmAutomation, as: 'automation', attributes: ['id', 'name', 'type'] }],
    }),
    CrmAutomationExecution.findOne({
      where: {
        tenant_id: tenantId,
        status: 'success',
        duration: { [Op.ne]: null },
        executed_at: { [Op.gte]: since },
      },
      attributes: [[fn('AVG', col('duration')), 'avg_ms']],
      raw: true,
    }),
    CrmAutomationExecution.findAll({
      where: {
        tenant_id: tenantId,
        status: 'success',
        executed_at: { [Op.gte]: since },
      },
      attributes: [
        'automation_id',
        [fn('COUNT', col('id')), 'cnt'],
      ],
      group: ['automation_id'],
      order: [[literal('cnt'), 'DESC']],
      limit: 1,
      raw: true,
    }),
  ]);

  const todayExecuted = todayRows.length;
  const todaySuccess = todayRows.filter((r) => r.status === 'success').length;
  const successRate = todayExecuted
    ? Math.round((todaySuccess / todayExecuted) * 1000) / 10
    : 0;

  let mostUsed = null;
  if (byType[0]?.automation_id) {
    mostUsed = await CrmAutomation.findOne({
      where: { id: byType[0].automation_id, tenant_id: tenantId },
      attributes: ['id', 'name', 'type'],
    });
  }

  return {
    total_active: totalActive,
    today_executed: todayExecuted,
    pending_jobs: pending,
    failed_jobs: failed,
    success_rate: successRate,
    last_execution: lastExec,
    avg_execution_ms: avgDuration?.avg_ms != null
      ? Math.round(Number(avgDuration.avg_ms))
      : null,
    most_used: mostUsed,
    catalog: AUTOMATION_CATALOG.map((c) => ({
      type: c.type,
      name: c.name,
      description: c.description,
    })),
  };
}

async function listHistory(tenantId, { page = 1, limit = 40, automationId = null, status = null } = {}) {
  const where = { tenant_id: tenantId };
  if (automationId) where.automation_id = automationId;
  if (status) where.status = status;
  const lim = Math.min(Number(limit) || 40, 100);
  const pg = Math.max(Number(page) || 1, 1);
  const { rows, count } = await CrmAutomationExecution.findAndCountAll({
    where,
    include: [{ model: CrmAutomation, as: 'automation', attributes: ['id', 'name', 'type'] }],
    order: [['id', 'DESC']],
    limit: lim,
    offset: (pg - 1) * lim,
  });
  return { total: count, page: pg, limit: lim, data: rows };
}

/**
 * Enqueue a manual / immediate run (worker executes).
 */
async function enqueueRun(tenantId, automationId, opts = {}) {
  const row = await getAutomation(tenantId, automationId);
  if (!row) {
    const err = new Error('Automation not found');
    err.status = 404;
    throw err;
  }
  const exec = await CrmAutomationExecution.create({
    automation_id: row.id,
    tenant_id: tenantId,
    customer_id: opts.customerId || null,
    status: 'pending',
    meta: { source: opts.source || 'manual', segment: opts.segment || null },
  });
  const jobId = await enqueue(QUEUE_NAMES.FOLLOWUP, {
    job: 'automation_run',
    tenantId,
    automationId: row.id,
    executionId: exec.id,
    customerId: opts.customerId || null,
  }, {
    name: 'automation-run',
    jobId: `auto-run-${tenantId}-${row.id}-${exec.id}`,
  });
  await audit(tenantId, opts.actorId || null, 'automation_run_enqueued', row.id, {
    execution_id: exec.id,
    job_id: jobId,
  });
  return { automation: row, execution: exec, jobId };
}

/**
 * Whether a catalog automation type is enabled for tenant (default true if no row).
 */
async function isTypeEnabled(tenantId, type) {
  const row = await CrmAutomation.findOne({
    where: { tenant_id: tenantId, type },
    order: [['id', 'ASC']],
  });
  if (!row) return true; // backward compatible until seed
  return !!row.enabled;
}

async function getEnabledByType(tenantId, type) {
  return CrmAutomation.findOne({
    where: { tenant_id: tenantId, type, enabled: true },
    order: [['id', 'ASC']],
  });
}

async function audit(tenantId, actorId, action, entityId, meta) {
  await CrmAuditLog.create({
    tenant_id: tenantId,
    actor_type: actorId ? 'user' : 'system',
    actor_id: actorId || null,
    action,
    entity_type: 'automation',
    entity_id: entityId || null,
    meta: meta || null,
  }).catch(() => {});
}

module.exports = {
  ensureDefaults,
  listAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  getDashboard,
  listHistory,
  enqueueRun,
  isTypeEnabled,
  getEnabledByType,
  AUTOMATION_CATALOG,
  interpolate,
};
