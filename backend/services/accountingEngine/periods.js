'use strict';

function periodKeyFromDate(dateInput) {
  const s = String(dateInput instanceof Date
    ? `${dateInput.getFullYear()}-${String(dateInput.getMonth() + 1).padStart(2, '0')}-${String(dateInput.getDate()).padStart(2, '0')}`
    : dateInput).slice(0, 10);
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}`;
  const err = new Error('Invalid accounting date.');
  err.status = 400;
  throw err;
}

async function resolveOpenPeriod(tenantId, dateInput, { transaction } = {}) {
  const { AcctPeriod } = require('../../models');
  const key = periodKeyFromDate(dateInput);
  let period = await AcctPeriod.findOne({
    where: { tenant_id: Number(tenantId), period_key: key },
    transaction,
  });
  if (!period) {
    period = await AcctPeriod.create({
      tenant_id: Number(tenantId),
      period_key: key,
      status: 'open',
    }, { transaction });
  }
  if (period.status === 'closed') {
    const err = new Error(`Accounting period ${key} is closed.`);
    err.status = 400;
    err.code = 'PERIOD_CLOSED';
    throw err;
  }
  return period;
}

async function closePeriod({ tenantId, periodId, userId, transaction }) {
  const { AcctPeriod } = require('../../models');
  const { writeAudit } = require('./audit');
  const period = await AcctPeriod.findOne({
    where: { id: periodId, tenant_id: Number(tenantId) },
    transaction,
  });
  if (!period) {
    const err = new Error('Period not found.');
    err.status = 404;
    throw err;
  }
  if (period.status === 'closed') return period;
  await period.update({
    status: 'closed',
    closed_at: new Date(),
    closed_by: userId || null,
  }, { transaction });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: 'period.close',
    entityType: 'period',
    entityId: period.id,
    meta: { period_key: period.period_key },
    transaction,
  });
  return period;
}

async function reopenPeriod({ tenantId, periodId, userId, transaction }) {
  const { AcctPeriod } = require('../../models');
  const { writeAudit } = require('./audit');
  const period = await AcctPeriod.findOne({
    where: { id: periodId, tenant_id: Number(tenantId) },
    transaction,
  });
  if (!period) {
    const err = new Error('Period not found.');
    err.status = 404;
    throw err;
  }
  await period.update({
    status: 'open',
    closed_at: null,
    closed_by: null,
  }, { transaction });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: 'period.reopen',
    entityType: 'period',
    entityId: period.id,
    meta: { period_key: period.period_key },
    transaction,
  });
  return period;
}

module.exports = {
  periodKeyFromDate,
  resolveOpenPeriod,
  closePeriod,
  reopenPeriod,
};
