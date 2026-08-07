'use strict';

const { Op } = require('sequelize');
const { money } = require('./balance');
const { ensureTenantBooks } = require('./coa');

async function postedLinesQuery(tenantId, { from, to, accountId, asOf } = {}) {
  const { AcctJournal, AcctJournalLine, AcctAccount } = require('../../models');
  const journalWhere = {
    tenant_id: Number(tenantId),
    status: 'posted',
  };
  if (from || to || asOf) {
    journalWhere.date = {};
    if (from) journalWhere.date[Op.gte] = from;
    if (to) journalWhere.date[Op.lte] = to;
    if (asOf) journalWhere.date[Op.lte] = asOf;
  }

  const lineWhere = { tenant_id: Number(tenantId) };
  if (accountId) lineWhere.account_id = Number(accountId);

  return AcctJournalLine.findAll({
    where: lineWhere,
    include: [
      {
        model: AcctJournal,
        as: 'journal',
        where: journalWhere,
        required: true,
      },
      {
        model: AcctAccount,
        as: 'account',
        required: true,
      },
    ],
    order: [[{ model: AcctJournal, as: 'journal' }, 'date', 'ASC'], ['id', 'ASC']],
  });
}

function naturalSign(type, debit, credit) {
  // asset/expense increase with debit; liability/equity/revenue with credit
  if (type === 'asset' || type === 'expense') {
    return money(debit - credit);
  }
  return money(credit - debit);
}

async function getAccountBalance({ tenantId, accountId, asOf }) {
  await ensureTenantBooks(tenantId);
  const lines = await postedLinesQuery(tenantId, { accountId, asOf });
  if (!lines.length) return 0;
  const type = lines[0].account.type;
  let bal = 0;
  for (const l of lines) {
    bal = money(bal + naturalSign(type, parseFloat(l.debit), parseFloat(l.credit)));
  }
  return bal;
}

async function trialBalance({ tenantId, from, to }) {
  await ensureTenantBooks(tenantId);
  const { AcctAccount } = require('../../models');
  const accounts = await AcctAccount.findAll({
    where: { tenant_id: Number(tenantId), is_active: true },
    order: [['code', 'ASC']],
  });
  const lines = await postedLinesQuery(tenantId, { from, to });
  const map = new Map();
  for (const a of accounts) {
    map.set(a.id, {
      account_id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      debit: 0,
      credit: 0,
    });
  }
  for (const l of lines) {
    const row = map.get(l.account_id);
    if (!row) continue;
    row.debit = money(row.debit + parseFloat(l.debit));
    row.credit = money(row.credit + parseFloat(l.credit));
  }
  const rows = [...map.values()].filter((r) => r.debit || r.credit);
  const totals = rows.reduce(
    (acc, r) => ({
      debit: money(acc.debit + r.debit),
      credit: money(acc.credit + r.credit),
    }),
    { debit: 0, credit: 0 },
  );
  return { rows, totals, from, to };
}

async function profitAndLoss({ tenantId, from, to }) {
  const tb = await trialBalance({ tenantId, from, to });
  const revenue = [];
  const expense = [];
  let revenueTotal = 0;
  let expenseTotal = 0;
  for (const r of tb.rows) {
    if (r.type === 'revenue') {
      const amt = money(r.credit - r.debit);
      revenue.push({ ...r, amount: amt });
      revenueTotal = money(revenueTotal + amt);
    } else if (r.type === 'expense') {
      const amt = money(r.debit - r.credit);
      expense.push({ ...r, amount: amt });
      expenseTotal = money(expenseTotal + amt);
    }
  }
  return {
    from,
    to,
    revenue,
    expense,
    revenueTotal,
    expenseTotal,
    netIncome: money(revenueTotal - expenseTotal),
  };
}

async function balanceSheet({ tenantId, asOf }) {
  const tb = await trialBalance({ tenantId, to: asOf });
  const assets = [];
  const liabilities = [];
  const equity = [];
  let assetTotal = 0;
  let liabilityTotal = 0;
  let equityTotal = 0;
  for (const r of tb.rows) {
    if (r.type === 'asset') {
      const amt = money(r.debit - r.credit);
      assets.push({ ...r, amount: amt });
      assetTotal = money(assetTotal + amt);
    } else if (r.type === 'liability') {
      const amt = money(r.credit - r.debit);
      liabilities.push({ ...r, amount: amt });
      liabilityTotal = money(liabilityTotal + amt);
    } else if (r.type === 'equity') {
      const amt = money(r.credit - r.debit);
      equity.push({ ...r, amount: amt });
      equityTotal = money(equityTotal + amt);
    }
  }
  // Fold YTD net income into equity for BS
  const pl = await profitAndLoss({ tenantId, to: asOf });
  equityTotal = money(equityTotal + pl.netIncome);
  equity.push({
    account_id: null,
    code: 'NI',
    name: 'Net Income (current)',
    type: 'equity',
    amount: pl.netIncome,
  });
  return {
    asOf,
    assets,
    liabilities,
    equity,
    assetTotal,
    liabilityTotal,
    equityTotal,
    balanced: assetTotal === money(liabilityTotal + equityTotal),
  };
}

async function generalLedger({ tenantId, accountId, from, to }) {
  await ensureTenantBooks(tenantId);
  const lines = await postedLinesQuery(tenantId, { accountId, from, to });
  if (!lines.length) {
    return { accountId, from, to, entries: [], closingBalance: 0 };
  }
  const type = lines[0].account.type;
  let running = 0;
  const entries = lines.map((l) => {
    const move = naturalSign(type, parseFloat(l.debit), parseFloat(l.credit));
    running = money(running + move);
    return {
      id: l.id,
      journal_id: l.journal_id,
      date: l.journal.date,
      memo: l.memo || l.journal.memo,
      debit: money(l.debit),
      credit: money(l.credit),
      balance: running,
    };
  });
  return {
    accountId,
    account: lines[0].account,
    from,
    to,
    entries,
    closingBalance: running,
  };
}

module.exports = {
  getAccountBalance,
  trialBalance,
  profitAndLoss,
  balanceSheet,
  generalLedger,
};
