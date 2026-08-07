'use strict';

const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const engine = require('../services/accountingEngine');
const {
  AcctAccount,
  AcctPeriod,
  AcctJournal,
  AcctTaxSetting,
  AcctBankAccount,
  AcctBankTxn,
  AcctPettyCashTxn,
  AcctArInvoice,
  AcctApBill,
  AcctAuditLog,
  CommissionPayout,
  StaffAdvance,
} = require('../models');
const { money } = require('../services/accountingEngine/balance');
const { nextBankGlCode } = require('../services/accountingEngine/coa');

function tid(req) {
  return req.userTenantId ?? req.tenant?.id;
}

function uid(req) {
  return req.user?.id || null;
}

async function ensure(req) {
  const tenantId = tid(req);
  if (!tenantId) {
    const err = new Error('Tenant context required.');
    err.status = 403;
    throw err;
  }
  await engine.ensureTenantBooks(tenantId);
  return tenantId;
}

function handle(res, err) {
  console.error('[accounting]', err);
  return res.status(err.status || 500).json({ message: err.message || 'Server error.' });
}

// ── Overview ────────────────────────────────────────────────────────────────
const overview = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const settings = await engine.getSettings(tenantId);
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const to = now.toISOString().slice(0, 10);
    const pl = await engine.profitAndLoss({ tenantId, from, to });

    const bankRows = await AcctBankAccount.findAll({
      where: { tenant_id: tenantId, is_active: true },
    });
    let cashBal = 0;
    let bankBal = 0;
    const seenGl = new Set();
    for (const row of bankRows) {
      if (seenGl.has(row.gl_account_id)) continue;
      seenGl.add(row.gl_account_id);
      const bal = await engine.getAccountBalance({
        tenantId,
        accountId: row.gl_account_id,
        asOf: to,
      });
      if (row.is_cash) cashBal = money(cashBal + bal);
      else bankBal = money(bankBal + bal);
    }
    // Fallback to defaults if no bank-account rows yet
    if (!bankRows.length) {
      cashBal = settings.default_cash_account_id
        ? await engine.getAccountBalance({ tenantId, accountId: settings.default_cash_account_id, asOf: to })
        : 0;
      bankBal = settings.default_bank_account_id
        ? await engine.getAccountBalance({ tenantId, accountId: settings.default_bank_account_id, asOf: to })
        : 0;
    }

    const arOpen = await AcctArInvoice.sum('amount', {
      where: { tenant_id: tenantId, status: 'open' },
    }) || 0;
    const apOpen = await AcctApBill.sum('amount', {
      where: { tenant_id: tenantId, status: 'open' },
    }) || 0;
    const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const period = await AcctPeriod.findOne({ where: { tenant_id: tenantId, period_key: periodKey } });
    const recent = await AcctJournal.findAll({
      where: { tenant_id: tenantId },
      include: [{ association: 'lines' }],
      order: [['id', 'DESC']],
      limit: 8,
    });
    return res.json({
      cashBalance: money(cashBal),
      bankBalance: money(bankBal),
      arOpen: money(arOpen),
      apOpen: money(apOpen),
      mtdRevenue: pl.revenueTotal,
      mtdExpense: pl.expenseTotal,
      mtdNetIncome: pl.netIncome,
      period,
      recentJournals: recent,
    });
  } catch (err) {
    return handle(res, err);
  }
};

// ── Accounts ────────────────────────────────────────────────────────────────
const listAccounts = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const rows = await AcctAccount.findAll({
      where: { tenant_id: tenantId },
      order: [['code', 'ASC']],
    });
    return res.json(rows);
  } catch (err) {
    return handle(res, err);
  }
};

const createAccount = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const { code, name, type, parent_id } = req.body || {};
    if (!code || !name || !type) {
      return res.status(400).json({ message: 'code, name, and type are required.' });
    }
    const row = await AcctAccount.create({
      tenant_id: tenantId,
      code: String(code).trim(),
      name: String(name).trim(),
      type,
      parent_id: parent_id || null,
      is_system: false,
      is_active: true,
    });
    return res.status(201).json(row);
  } catch (err) {
    return handle(res, err);
  }
};

const updateAccount = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const row = await AcctAccount.findOne({ where: { id: req.params.id, tenant_id: tenantId } });
    if (!row) return res.status(404).json({ message: 'Account not found.' });
    const patch = {};
    if (req.body.name != null) patch.name = req.body.name;
    if (req.body.is_active != null) patch.is_active = !!req.body.is_active;
    if (!row.is_system && req.body.code != null) patch.code = req.body.code;
    if (!row.is_system && req.body.type != null) patch.type = req.body.type;
    await row.update(patch);
    return res.json(row);
  } catch (err) {
    return handle(res, err);
  }
};

// ── Journals ────────────────────────────────────────────────────────────────
const listJournals = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const data = await engine.listJournals(tenantId, {
      limit: req.query.limit,
      offset: req.query.offset,
      status: req.query.status,
      from: req.query.from,
      to: req.query.to,
    });
    return res.json(data);
  } catch (err) {
    return handle(res, err);
  }
};

const getJournal = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const row = await AcctJournal.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
      include: [{ association: 'lines', include: [{ association: 'account' }] }],
    });
    if (!row) return res.status(404).json({ message: 'Journal not found.' });
    return res.json(row);
  } catch (err) {
    return handle(res, err);
  }
};

const createJournal = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const { date, memo, lines } = req.body || {};
    if (!date || !Array.isArray(lines)) {
      return res.status(400).json({ message: 'date and lines are required.' });
    }
    const journal = await engine.postJournal({
      tenantId,
      date,
      memo,
      lines,
      userId: uid(req),
    });
    return res.status(201).json(journal);
  } catch (err) {
    return handle(res, err);
  }
};

const voidJournalCtrl = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const result = await engine.voidJournal({
      tenantId,
      journalId: req.params.id,
      userId: uid(req),
      reason: req.body?.reason,
    });
    return res.json(result);
  } catch (err) {
    return handle(res, err);
  }
};

// ── Reports ─────────────────────────────────────────────────────────────────
const trialBalance = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    return res.json(await engine.trialBalance({
      tenantId,
      from: req.query.from,
      to: req.query.to,
    }));
  } catch (err) {
    return handle(res, err);
  }
};

const profitAndLoss = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    return res.json(await engine.profitAndLoss({
      tenantId,
      from: req.query.from,
      to: req.query.to,
    }));
  } catch (err) {
    return handle(res, err);
  }
};

const balanceSheet = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    return res.json(await engine.balanceSheet({
      tenantId,
      asOf: req.query.asOf || new Date().toISOString().slice(0, 10),
    }));
  } catch (err) {
    return handle(res, err);
  }
};

const generalLedger = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    if (!req.query.account_id) {
      return res.status(400).json({ message: 'account_id is required.' });
    }
    return res.json(await engine.generalLedger({
      tenantId,
      accountId: req.query.account_id,
      from: req.query.from,
      to: req.query.to,
    }));
  } catch (err) {
    return handle(res, err);
  }
};

// ── Tax / Settings ──────────────────────────────────────────────────────────
const getTax = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const settings = await engine.getSettings(tenantId);
    return res.json(settings);
  } catch (err) {
    return handle(res, err);
  }
};

const updateTax = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const settings = await engine.getSettings(tenantId);
    const allowed = [
      'vat_enabled', 'vat_rate', 'registration_no',
      'output_vat_account_id', 'input_vat_account_id',
      'default_cash_account_id', 'default_bank_account_id',
      'default_revenue_account_id', 'default_expense_account_id',
      'default_payroll_account_id', 'default_ar_account_id',
      'default_ap_account_id', 'default_petty_account_id',
      'default_advance_account_id', 'default_package_liability_id',
      'default_loyalty_liability_id', 'default_equity_account_id',
      'auto_post_payments', 'auto_post_expenses', 'auto_post_payroll',
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    await settings.update(patch);
    return res.json(settings);
  } catch (err) {
    return handle(res, err);
  }
};

const taxSummary = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const settings = await engine.getSettings(tenantId);
    const from = req.query.from;
    const to = req.query.to;
    let output = 0;
    let input = 0;
    if (settings.output_vat_account_id) {
      const gl = await engine.generalLedger({
        tenantId,
        accountId: settings.output_vat_account_id,
        from,
        to,
      });
      output = gl.closingBalance;
    }
    if (settings.input_vat_account_id) {
      const gl = await engine.generalLedger({
        tenantId,
        accountId: settings.input_vat_account_id,
        from,
        to,
      });
      input = gl.closingBalance;
    }
    return res.json({
      vat_rate: settings.vat_rate,
      vat_enabled: settings.vat_enabled,
      outputVat: output,
      inputVat: input,
      netVatPayable: money(output - input),
      from,
      to,
    });
  } catch (err) {
    return handle(res, err);
  }
};

// ── Periods ─────────────────────────────────────────────────────────────────
const listPeriods = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const rows = await AcctPeriod.findAll({
      where: { tenant_id: tenantId },
      order: [['period_key', 'DESC']],
    });
    return res.json(rows);
  } catch (err) {
    return handle(res, err);
  }
};

const closePeriod = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const row = await engine.closePeriod({
      tenantId,
      periodId: req.params.id,
      userId: uid(req),
    });
    return res.json(row);
  } catch (err) {
    return handle(res, err);
  }
};

const reopenPeriod = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const row = await engine.reopenPeriod({
      tenantId,
      periodId: req.params.id,
      userId: uid(req),
    });
    return res.json(row);
  } catch (err) {
    return handle(res, err);
  }
};

// ── Bank ────────────────────────────────────────────────────────────────────
const listBankAccounts = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const rows = await AcctBankAccount.findAll({
      where: { tenant_id: tenantId },
      include: [{ association: 'glAccount' }],
      order: [['id', 'ASC']],
    });
    const withBal = [];
    for (const r of rows) {
      // Balance is GL only — opening_balance is posted into GL on create
      const bal = await engine.getAccountBalance({
        tenantId,
        accountId: r.gl_account_id,
      });
      withBal.push({ ...r.toJSON(), balance: money(bal) });
    }
    return res.json(withBal);
  } catch (err) {
    return handle(res, err);
  }
};

const createBankAccount = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const settings = await engine.getSettings(tenantId);
    const {
      name, account_number, bank_name, gl_account_id, is_cash, opening_balance,
    } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Account name is required.' });
    }

    const opening = money(opening_balance);
    const cashFlag = !!is_cash;

    const result = await sequelize.transaction(async (transaction) => {
      let glId = gl_account_id ? Number(gl_account_id) : null;

      if (glId) {
        const taken = await AcctBankAccount.findOne({
          where: { tenant_id: tenantId, gl_account_id: glId, is_active: true },
          transaction,
        });
        if (taken) {
          const err = new Error('That GL account is already linked to another cash/bank account. Leave GL blank to auto-create one.');
          err.status = 400;
          throw err;
        }
        const gl = await AcctAccount.findOne({ where: { id: glId, tenant_id: tenantId }, transaction });
        if (!gl) {
          const err = new Error('GL account not found.');
          err.status = 400;
          throw err;
        }
      } else {
        const code = await nextBankGlCode(tenantId, { isCash: cashFlag, transaction });
        const gl = await AcctAccount.create({
          tenant_id: tenantId,
          code,
          name: String(name).trim(),
          type: 'asset',
          is_system: false,
          is_active: true,
        }, { transaction });
        glId = gl.id;
      }

      const row = await AcctBankAccount.create({
        tenant_id: tenantId,
        name: String(name).trim(),
        account_number: account_number || null,
        bank_name: bank_name || null,
        gl_account_id: glId,
        is_cash: cashFlag,
        opening_balance: opening,
        is_active: true,
      }, { transaction });

      if (opening > 0) {
        const equityId = settings.default_equity_account_id
          || (await engine.getAccountByCode(tenantId, '3000', { transaction }))?.id;
        if (!equityId) {
          const err = new Error('Owner Equity account missing — cannot post opening balance.');
          err.status = 400;
          throw err;
        }
        await engine.postJournal({
          tenantId,
          date: new Date().toISOString().slice(0, 10),
          memo: `Opening balance · ${row.name}`,
          lines: [
            { account_id: glId, debit: opening, credit: 0, memo: 'Opening' },
            { account_id: equityId, debit: 0, credit: opening, memo: 'Opening equity' },
          ],
          userId: uid(req),
          sourceType: 'bank_opening',
          sourceId: row.id,
          transaction,
        });
      }

      return row;
    });

    return res.status(201).json(result);
  } catch (err) {
    return handle(res, err);
  }
};

const listBankTxns = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const where = { tenant_id: tenantId };
    if (req.query.bank_account_id) where.bank_account_id = req.query.bank_account_id;
    const rows = await AcctBankTxn.findAll({
      where,
      order: [['date', 'DESC'], ['id', 'DESC']],
      limit: 200,
    });
    return res.json(rows);
  } catch (err) {
    return handle(res, err);
  }
};

const createBankTxn = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const settings = await engine.getSettings(tenantId);
    const {
      bank_account_id, date, type, amount, memo,
      counterparty_gl_account_id, transfer_bank_account_id,
    } = req.body || {};
    const bank = await AcctBankAccount.findOne({
      where: { id: bank_account_id, tenant_id: tenantId },
    });
    if (!bank) return res.status(404).json({ message: 'Bank account not found.' });
    const amt = money(amount);
    if (!(amt > 0) || !date || !type) {
      return res.status(400).json({ message: 'date, type, and amount required.' });
    }

    const equityDefault = settings.default_equity_account_id
      || (await engine.getAccountByCode(tenantId, '3000'))?.id;

    const out = await sequelize.transaction(async (transaction) => {
      let otherBank = null;
      let lines = [];
      let counterparty = counterparty_gl_account_id ? Number(counterparty_gl_account_id) : null;

      if (type === 'deposit') {
        const other = counterparty || equityDefault || settings.default_revenue_account_id;
        if (!other) {
          const err = new Error('Select a counterparty GL (or configure Owner Equity).');
          err.status = 400;
          throw err;
        }
        counterparty = other;
        lines = [
          { account_id: bank.gl_account_id, debit: amt, credit: 0 },
          { account_id: other, debit: 0, credit: amt },
        ];
      } else if (type === 'withdrawal') {
        const other = counterparty || settings.default_expense_account_id;
        if (!other) {
          const err = new Error('Select a counterparty GL (or configure default expense).');
          err.status = 400;
          throw err;
        }
        counterparty = other;
        lines = [
          { account_id: other, debit: amt, credit: 0 },
          { account_id: bank.gl_account_id, debit: 0, credit: amt },
        ];
      } else if (type === 'transfer') {
        otherBank = await AcctBankAccount.findOne({
          where: { id: transfer_bank_account_id, tenant_id: tenantId },
          transaction,
        });
        if (!otherBank) {
          const err = new Error('Select the destination bank account.');
          err.status = 400;
          throw err;
        }
        if (otherBank.id === bank.id) {
          const err = new Error('Cannot transfer to the same account.');
          err.status = 400;
          throw err;
        }
        lines = [
          { account_id: otherBank.gl_account_id, debit: amt, credit: 0 },
          { account_id: bank.gl_account_id, debit: 0, credit: amt },
        ];
      } else {
        const err = new Error('Invalid type.');
        err.status = 400;
        throw err;
      }

      const txn = await AcctBankTxn.create({
        tenant_id: tenantId,
        bank_account_id: bank.id,
        date,
        type,
        amount: amt,
        memo: memo || null,
        counterparty_gl_account_id: counterparty || null,
        transfer_bank_account_id: otherBank?.id || null,
        journal_id: null,
        created_by: uid(req),
      }, { transaction });

      const journal = await engine.postJournal({
        tenantId,
        date,
        memo: memo || `Bank ${type}`,
        lines,
        userId: uid(req),
        sourceType: 'bank_txn',
        sourceId: txn.id,
        transaction,
      });
      await txn.update({ journal_id: journal.id }, { transaction });

      if (type === 'transfer' && otherBank) {
        await AcctBankTxn.create({
          tenant_id: tenantId,
          bank_account_id: otherBank.id,
          date,
          type: 'deposit',
          amount: amt,
          memo: memo || `Transfer from ${bank.name}`,
          counterparty_gl_account_id: null,
          transfer_bank_account_id: bank.id,
          journal_id: journal.id,
          created_by: uid(req),
        }, { transaction });
      }

      return { txn, journal };
    });

    return res.status(201).json(out);
  } catch (err) {
    return handle(res, err);
  }
};

// ── Petty cash ──────────────────────────────────────────────────────────────
const listPetty = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const rows = await AcctPettyCashTxn.findAll({
      where: { tenant_id: tenantId },
      order: [['date', 'DESC'], ['id', 'DESC']],
      limit: 200,
    });
    const settings = await engine.getSettings(tenantId);
    const balance = settings.default_petty_account_id
      ? await engine.getAccountBalance({ tenantId, accountId: settings.default_petty_account_id })
      : 0;
    return res.json({ balance, rows });
  } catch (err) {
    return handle(res, err);
  }
};

const createPetty = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const settings = await engine.getSettings(tenantId);
    const pettyId = settings.default_petty_account_id;
    const cashId = settings.default_cash_account_id;
    const expenseId = settings.default_expense_account_id;
    if (!pettyId || !cashId) {
      return res.status(400).json({ message: 'Petty cash accounts not configured.' });
    }
    const { date, type, amount, memo, expense_gl_account_id } = req.body || {};
    const amt = money(amount);
    if (!date || !type || !(amt > 0)) {
      return res.status(400).json({ message: 'date, type, amount required.' });
    }
    let lines = [];
    if (type === 'float_in') {
      lines = [
        { account_id: pettyId, debit: amt, credit: 0 },
        { account_id: cashId, debit: 0, credit: amt },
      ];
    } else if (type === 'float_out') {
      lines = [
        { account_id: cashId, debit: amt, credit: 0 },
        { account_id: pettyId, debit: 0, credit: amt },
      ];
    } else if (type === 'expense') {
      const exp = expense_gl_account_id || expenseId;
      lines = [
        { account_id: exp, debit: amt, credit: 0 },
        { account_id: pettyId, debit: 0, credit: amt },
      ];
    } else {
      return res.status(400).json({ message: 'Invalid type.' });
    }

    const out = await sequelize.transaction(async (transaction) => {
      const row = await AcctPettyCashTxn.create({
        tenant_id: tenantId,
        date,
        type,
        amount: amt,
        memo: memo || null,
        expense_gl_account_id: expense_gl_account_id || null,
        journal_id: null,
        created_by: uid(req),
      }, { transaction });

      const journal = await engine.postJournal({
        tenantId,
        date,
        memo: memo || `Petty ${type}`,
        lines,
        userId: uid(req),
        sourceType: 'petty_cash',
        sourceId: row.id,
        transaction,
      });
      await row.update({ journal_id: journal.id }, { transaction });
      return { row, journal };
    });

    return res.status(201).json(out);
  } catch (err) {
    return handle(res, err);
  }
};

// ── AR / AP ─────────────────────────────────────────────────────────────────
const listAr = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const rows = await AcctArInvoice.findAll({
      where: { tenant_id: tenantId },
      order: [['date', 'DESC']],
      limit: 200,
    });
    return res.json(rows);
  } catch (err) {
    return handle(res, err);
  }
};

const createAr = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const settings = await engine.getSettings(tenantId);
    const {
      customer_id, customer_name, invoice_no, date, due_date, amount, memo,
    } = req.body || {};
    const amt = money(amount);
    if (!invoice_no || !date || !(amt > 0)) {
      return res.status(400).json({ message: 'invoice_no, date, amount required.' });
    }
    const arId = settings.default_ar_account_id;
    const revId = settings.default_revenue_account_id;
    if (!arId || !revId) return res.status(400).json({ message: 'AR/Revenue accounts missing.' });

    const row = await sequelize.transaction(async (transaction) => {
      const created = await AcctArInvoice.create({
        tenant_id: tenantId,
        customer_id: customer_id || null,
        customer_name: customer_name || null,
        invoice_no,
        date,
        due_date: due_date || null,
        amount: amt,
        status: 'open',
        memo: memo || null,
        journal_id: null,
        created_by: uid(req),
      }, { transaction });

      const journal = await engine.postJournal({
        tenantId,
        date,
        memo: memo || `AR ${invoice_no}`,
        lines: [
          { account_id: arId, debit: amt, credit: 0 },
          { account_id: revId, debit: 0, credit: amt },
        ],
        userId: uid(req),
        sourceType: 'ar_invoice',
        sourceId: created.id,
        transaction,
      });
      await created.update({ journal_id: journal.id }, { transaction });
      return created;
    });

    return res.status(201).json(row);
  } catch (err) {
    return handle(res, err);
  }
};

const settleAr = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const settings = await engine.getSettings(tenantId);
    const row = await AcctArInvoice.findOne({ where: { id: req.params.id, tenant_id: tenantId } });
    if (!row) return res.status(404).json({ message: 'Invoice not found.' });
    if (row.status !== 'open') return res.status(400).json({ message: 'Invoice not open.' });
    const settleAcct = Number(req.body?.settlement_gl_account_id)
      || settings.default_cash_account_id
      || settings.default_bank_account_id;
    if (!settleAcct || !settings.default_ar_account_id) {
      return res.status(400).json({ message: 'Cash/Bank or AR account not configured.' });
    }
    const amt = money(row.amount);
    const journal = await engine.postJournal({
      tenantId,
      date: req.body?.date || new Date().toISOString().slice(0, 10),
      memo: `Settle AR ${row.invoice_no}`,
      lines: [
        { account_id: settleAcct, debit: amt, credit: 0 },
        { account_id: settings.default_ar_account_id, debit: 0, credit: amt },
      ],
      userId: uid(req),
      sourceType: 'ar_settle',
      sourceId: row.id,
    });
    await row.update({ status: 'paid', settle_journal_id: journal.id });
    return res.json(row);
  } catch (err) {
    return handle(res, err);
  }
};

const listAp = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const rows = await AcctApBill.findAll({
      where: { tenant_id: tenantId },
      order: [['date', 'DESC']],
      limit: 200,
    });
    return res.json(rows);
  } catch (err) {
    return handle(res, err);
  }
};

const createAp = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const settings = await engine.getSettings(tenantId);
    const {
      supplier_name, bill_no, date, due_date, amount, memo,
    } = req.body || {};
    const amt = money(amount);
    if (!supplier_name || !bill_no || !date || !(amt > 0)) {
      return res.status(400).json({ message: 'supplier_name, bill_no, date, amount required.' });
    }
    const apId = settings.default_ap_account_id;
    const expId = settings.default_expense_account_id;
    if (!apId || !expId) return res.status(400).json({ message: 'AP/Expense accounts missing.' });

    const row = await sequelize.transaction(async (transaction) => {
      const created = await AcctApBill.create({
        tenant_id: tenantId,
        supplier_name,
        bill_no,
        date,
        due_date: due_date || null,
        amount: amt,
        status: 'open',
        memo: memo || null,
        journal_id: null,
        created_by: uid(req),
      }, { transaction });

      const journal = await engine.postJournal({
        tenantId,
        date,
        memo: memo || `AP ${bill_no}`,
        lines: [
          { account_id: expId, debit: amt, credit: 0 },
          { account_id: apId, debit: 0, credit: amt },
        ],
        userId: uid(req),
        sourceType: 'ap_bill',
        sourceId: created.id,
        transaction,
      });
      await created.update({ journal_id: journal.id }, { transaction });
      return created;
    });

    return res.status(201).json(row);
  } catch (err) {
    return handle(res, err);
  }
};

const settleAp = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const settings = await engine.getSettings(tenantId);
    const row = await AcctApBill.findOne({ where: { id: req.params.id, tenant_id: tenantId } });
    if (!row) return res.status(404).json({ message: 'Bill not found.' });
    if (row.status !== 'open') return res.status(400).json({ message: 'Bill not open.' });
    const settleAcct = Number(req.body?.settlement_gl_account_id)
      || settings.default_cash_account_id
      || settings.default_bank_account_id;
    if (!settleAcct || !settings.default_ap_account_id) {
      return res.status(400).json({ message: 'Cash/Bank or AP account not configured.' });
    }
    const amt = money(row.amount);
    const journal = await engine.postJournal({
      tenantId,
      date: req.body?.date || new Date().toISOString().slice(0, 10),
      memo: `Settle AP ${row.bill_no}`,
      lines: [
        { account_id: settings.default_ap_account_id, debit: amt, credit: 0 },
        { account_id: settleAcct, debit: 0, credit: amt },
      ],
      userId: uid(req),
      sourceType: 'ap_settle',
      sourceId: row.id,
    });
    await row.update({ status: 'paid', settle_journal_id: journal.id });
    return res.json(row);
  } catch (err) {
    return handle(res, err);
  }
};

// ── Payroll summary ─────────────────────────────────────────────────────────
const payrollSummary = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const from = req.query.from;
    const to = req.query.to;
    const wherePay = { tenant_id: tenantId };
    const whereAdv = { tenant_id: tenantId };
    if (from || to) {
      wherePay.date = {};
      whereAdv.date = {};
      if (from) { wherePay.date[Op.gte] = from; whereAdv.date[Op.gte] = from; }
      if (to) { wherePay.date[Op.lte] = to; whereAdv.date[Op.lte] = to; }
    }
    const payouts = await CommissionPayout.findAll({ where: wherePay, order: [['date', 'DESC']], limit: 100 });
    const advances = await StaffAdvance.findAll({ where: whereAdv, order: [['date', 'DESC']], limit: 100 });
    const posted = await AcctJournal.findAll({
      where: {
        tenant_id: tenantId,
        source_type: { [Op.in]: ['commission_payout', 'staff_advance'] },
        status: 'posted',
      },
      attributes: ['source_type', 'source_id', 'id'],
    });
    const postedSet = new Set(posted.map((p) => `${p.source_type}:${p.source_id}`));
    return res.json({
      payouts: payouts.map((p) => ({
        ...p.toJSON(),
        gl_posted: postedSet.has(`commission_payout:${p.id}`),
      })),
      advances: advances.map((a) => ({
        ...a.toJSON(),
        gl_posted: postedSet.has(`staff_advance:${a.id}`),
      })),
    });
  } catch (err) {
    return handle(res, err);
  }
};

// ── Audit ───────────────────────────────────────────────────────────────────
const listAudit = async (req, res) => {
  try {
    const tenantId = await ensure(req);
    const rows = await AcctAuditLog.findAll({
      where: { tenant_id: tenantId },
      order: [['id', 'DESC']],
      limit: Math.min(parseInt(req.query.limit, 10) || 100, 500),
    });
    return res.json(rows);
  } catch (err) {
    return handle(res, err);
  }
};

const getSettings = getTax;
const updateSettings = updateTax;

module.exports = {
  overview,
  listAccounts,
  createAccount,
  updateAccount,
  listJournals,
  getJournal,
  createJournal,
  voidJournalCtrl,
  trialBalance,
  profitAndLoss,
  balanceSheet,
  generalLedger,
  getTax,
  updateTax,
  taxSummary,
  listPeriods,
  closePeriod,
  reopenPeriod,
  listBankAccounts,
  createBankAccount,
  listBankTxns,
  createBankTxn,
  listPetty,
  createPetty,
  listAr,
  createAr,
  settleAr,
  listAp,
  createAp,
  settleAp,
  payrollSummary,
  listAudit,
  getSettings,
  updateSettings,
};
