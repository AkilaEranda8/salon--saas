'use strict';

const { Op } = require('sequelize');
const { sequelize } = require('../../config/database');
const { money, assertBalanced } = require('./balance');
const { resolveOpenPeriod } = require('./periods');
const { writeAudit } = require('./audit');
const { ensureTenantBooks } = require('./coa');

function normalizeLines(lines = []) {
  return lines.map((l) => ({
    account_id: Number(l.account_id),
    debit: money(l.debit),
    credit: money(l.credit),
    memo: l.memo || null,
  })).filter((l) => l.account_id > 0);
}

async function findExistingSourceJournal(tenantId, sourceType, sourceId, { transaction } = {}) {
  if (!sourceType || sourceId == null || sourceId === '') return null;
  const { AcctJournal } = require('../../models');
  return AcctJournal.findOne({
    where: {
      tenant_id: Number(tenantId),
      source_type: String(sourceType),
      source_id: String(sourceId),
      status: { [Op.in]: ['posted', 'draft'] },
    },
    include: [{ association: 'lines' }],
    transaction,
  });
}

async function postJournal({
  tenantId,
  date,
  memo,
  lines,
  userId = null,
  sourceType = null,
  sourceId = null,
  transaction: outerTx = null,
}) {
  const {
    AcctJournal,
    AcctJournalLine,
    AcctAccount,
  } = require('../../models');

  const tid = Number(tenantId);
  const run = async (transaction) => {
    await ensureTenantBooks(tid, { transaction });

    if (sourceType && sourceId != null) {
      const existing = await findExistingSourceJournal(tid, sourceType, sourceId, { transaction });
      if (existing && existing.status === 'posted') {
        return existing;
      }
      if (existing && existing.status === 'draft') {
        await AcctJournalLine.destroy({ where: { journal_id: existing.id }, transaction });
        await existing.destroy({ transaction });
      }
    }

    const normalized = normalizeLines(lines);
    assertBalanced(normalized);

    const accountIds = [...new Set(normalized.map((l) => l.account_id))];
    const accounts = await AcctAccount.findAll({
      where: { tenant_id: tid, id: accountIds, is_active: true },
      transaction,
    });
    if (accounts.length !== accountIds.length) {
      const err = new Error('One or more accounts are invalid or inactive.');
      err.status = 400;
      throw err;
    }

    const period = await resolveOpenPeriod(tid, date, { transaction });
    const journal = await AcctJournal.create({
      tenant_id: tid,
      period_id: period.id,
      date,
      memo: memo || null,
      status: 'posted',
      source_type: sourceType || null,
      source_id: sourceId != null ? String(sourceId) : null,
      created_by: userId || null,
      posted_at: new Date(),
    }, { transaction });

    await AcctJournalLine.bulkCreate(
      normalized.map((l) => ({
        tenant_id: tid,
        journal_id: journal.id,
        account_id: l.account_id,
        debit: l.debit,
        credit: l.credit,
        memo: l.memo,
      })),
      { transaction },
    );

    await writeAudit({
      tenantId: tid,
      actorId: userId,
      action: 'journal.post',
      entityType: 'journal',
      entityId: journal.id,
      meta: { sourceType, sourceId, memo },
      transaction,
    });

    return AcctJournal.findByPk(journal.id, {
      include: [{ association: 'lines', include: [{ association: 'account' }] }],
      transaction,
    });
  };

  if (outerTx) return run(outerTx);
  return sequelize.transaction(run);
}

async function voidJournal({ tenantId, journalId, userId = null, reason = null, transaction: outerTx = null }) {
  const { AcctJournal, AcctJournalLine } = require('../../models');
  const tid = Number(tenantId);

  const run = async (transaction) => {
    const journal = await AcctJournal.findOne({
      where: { id: journalId, tenant_id: tid },
      include: [{ association: 'lines' }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!journal) {
      const err = new Error('Journal not found.');
      err.status = 404;
      throw err;
    }
    if (journal.status === 'voided') {
      const err = new Error('Journal already voided.');
      err.status = 400;
      throw err;
    }
    if (journal.status !== 'posted') {
      const err = new Error('Only posted journals can be voided.');
      err.status = 400;
      throw err;
    }

    const reverseLines = (journal.lines || []).map((l) => ({
      account_id: l.account_id,
      debit: money(l.credit),
      credit: money(l.debit),
      memo: l.memo ? `Void: ${l.memo}` : 'Void',
    }));

    const reversing = await postJournal({
      tenantId: tid,
      date: journal.date,
      memo: reason || `Void of journal #${journal.id}`,
      lines: reverseLines,
      userId,
      sourceType: `void:${journal.source_type || 'manual'}`,
      sourceId: `${journal.id}`,
      transaction,
    });

    await journal.update({
      status: 'voided',
      voided_by_journal_id: reversing.id,
      source_type: journal.source_type ? `voided:${journal.source_type}` : 'voided:manual',
      source_id: journal.source_id != null ? `${journal.source_id}#${journal.id}` : String(journal.id),
    }, { transaction });
    await reversing.update({ voids_journal_id: journal.id }, { transaction });

    await writeAudit({
      tenantId: tid,
      actorId: userId,
      action: 'journal.void',
      entityType: 'journal',
      entityId: journal.id,
      meta: { reversing_id: reversing.id, reason },
      transaction,
    });

    return { original: journal, reversing };
  };

  if (outerTx) return run(outerTx);
  return sequelize.transaction(run);
}

async function listJournals(tenantId, { limit = 50, offset = 0, status, from, to } = {}) {
  const { AcctJournal } = require('../../models');
  const where = { tenant_id: Number(tenantId) };
  if (status) where.status = status;
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = from;
    if (to) where.date[Op.lte] = to;
  }
  return AcctJournal.findAndCountAll({
    where,
    include: [{ association: 'lines', include: [{ association: 'account' }] }],
    order: [['date', 'DESC'], ['id', 'DESC']],
    limit: Math.min(Number(limit) || 50, 200),
    offset: Number(offset) || 0,
  });
}

module.exports = {
  postJournal,
  voidJournal,
  listJournals,
  findExistingSourceJournal,
  normalizeLines,
};
