const { Op, fn, col, literal } = require('sequelize');
const { Expense, Branch, User, Payment, Service } = require('../models');
const { tenantWhere } = require('../utils/tenantScope');

// ── Branch-scope helper (mirrors pattern used across controllers) ──────────────
const getBranchWhere = (req) => {
  const where = tenantWhere(req);
  if (req.userBranchId)        where.branch_id = req.userBranchId;
  else if (req.query.branchId) where.branch_id = req.query.branchId;
  return where;
};

const applyMonthFilter = (where, month) => {
  if (!month) return;
  const [year, mon] = month.split('-');
  const lastDay = new Date(year, parseInt(mon), 0).getDate();
  where.date = { [Op.between]: [`${year}-${mon}-01`, `${year}-${mon}-${lastDay}`] };
};

// ── GET /api/expenses ─────────────────────────────────────────────────────────
const list = async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const where = getBranchWhere(req);
    applyMonthFilter(where, req.query.month);
    if (req.query.category) where.category = req.query.category;

    const { count, rows } = await Expense.findAndCountAll({
      where,
      limit,
      offset,
      order: [['date', 'DESC'], ['createdAt', 'DESC']],
      include: [
        { model: Branch, as: 'branch',  attributes: ['id', 'name'] },
        { model: User,   as: 'creator', attributes: ['id', 'name'] },
      ],
    });

    const [totRow] = await Expense.findAll({
      where,
      attributes: [[literal('COALESCE(SUM(`amount`), 0)'), 'totalAmount']],
      raw: true,
    });

    return res.json({
      total: count,
      page,
      limit,
      totalAmount: parseFloat(totRow?.totalAmount || 0),
      data: rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/expenses/summary ─────────────────────────────────────────────────
const summary = async (req, res) => {
  try {
    const where = getBranchWhere(req);
    const year  = parseInt(req.query.year) || new Date().getFullYear();
    where.date  = { [Op.between]: [`${year}-01-01`, `${year}-12-31`] };

    const rows = await Expense.findAll({
      where,
      attributes: [
        [fn('DATE_FORMAT', col('date'), '%Y-%m'), 'month'],
        'category',
        [fn('SUM', col('amount')), 'total'],
      ],
      group: [literal("DATE_FORMAT(`date`, '%Y-%m')"), 'category'],
      order: [[literal("DATE_FORMAT(`date`, '%Y-%m')"), 'ASC']],
      raw: true,
    });

    // Merge into { month → { category → amount } }
    const map = {};
    for (const row of rows) {
      if (!map[row.month]) map[row.month] = {};
      map[row.month][row.category] = parseFloat(row.total);
    }

    const result = Object.entries(map).map(([month, totals]) => ({ month, totals }));
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/expenses/profit-loss ─────────────────────────────────────────────
const profitLoss = async (req, res) => {
  try {
    const payWhere = {};
    const expWhere = {};
    if (req.userBranchId) {
      payWhere.branch_id = req.userBranchId;
      expWhere.branch_id = req.userBranchId;
    } else if (req.query.branchId) {
      payWhere.branch_id = req.query.branchId;
      expWhere.branch_id = req.query.branchId;
    }
    applyMonthFilter(payWhere, req.query.month);
    applyMonthFilter(expWhere, req.query.month);

    // Revenue + commission from payments
    const [payTotals] = await Payment.findAll({
      where: payWhere,
      attributes: [
        [literal('COALESCE(SUM(`total_amount`),    0)'), 'revenue'],
        [literal('COALESCE(SUM(`commission_amount`), 0)'), 'commission'],
      ],
      raw: true,
    });

    // Total expenses
    const [expTotals] = await Expense.findAll({
      where: expWhere,
      attributes: [[literal('COALESCE(SUM(`amount`), 0)'), 'totalExpenses']],
      raw: true,
    });

    // Expense breakdown by category
    const expBreakdown = await Expense.findAll({
      where: expWhere,
      attributes: ['category', [fn('SUM', col('amount')), 'total']],
      group: ['category'],
      raw: true,
    });

    // Revenue by service (for paid payments tied to a service)
    const serviceRevenue = await Payment.findAll({
      where: { ...payWhere, service_id: { [Op.not]: null } },
      attributes: [
        'service_id',
        [fn('SUM', col('Payment.total_amount')), 'revenue'],
      ],
      group: ['service_id', 'service.id', 'service.name'],
      include: [{ model: Service, as: 'service', attributes: ['id', 'name'] }],
    });

    const revenue    = parseFloat(payTotals?.revenue    || 0);
    const commission = parseFloat(payTotals?.commission || 0);
    const expenses   = parseFloat(expTotals?.totalExpenses || 0);

    const expenseBreakdown = {};
    for (const r of expBreakdown) {
      expenseBreakdown[r.category] = parseFloat(r.total);
    }

    const revenueByService = {};
    for (const r of serviceRevenue) {
      const name = r.service?.name || `Service #${r.service_id}`;
      revenueByService[name] = parseFloat(r.get('revenue'));
    }

    return res.json({
      revenue,
      expenses,
      commission,
      grossProfit: revenue - expenses,
      netProfit:   revenue - expenses - commission,
      expenseBreakdown,
      revenueByService,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/expenses/:id ─────────────────────────────────────────────────────
const getOne = async (req, res) => {
  try {
    const expense = await Expense.findByPk(req.params.id, {
      include: [
        { model: Branch, as: 'branch',  attributes: ['id', 'name'] },
        { model: User,   as: 'creator', attributes: ['id', 'name'] },
      ],
    });
    if (!expense) return res.status(404).json({ message: 'Expense not found.' });
    return res.json(expense);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/expenses ────────────────────────────────────────────────────────
const create = async (req, res) => {
  try {
    const { branch_id, category, title, amount, date, paid_to, payment_method, receipt_number, notes } = req.body;
    if (!branch_id || !category || !title || !amount || !date) {
      return res.status(400).json({ message: 'branch_id, category, title, amount, and date are required.' });
    }
    const expense = await Expense.create({
      branch_id, category, title, amount, date,
      paid_to:        paid_to        || null,
      payment_method: payment_method || null,
      receipt_number: receipt_number || null,
      notes:          notes          || null,
      created_by:     req.user?.id   || null,
    });
    return res.status(201).json(expense);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── PUT /api/expenses/:id ─────────────────────────────────────────────────────
const update = async (req, res) => {
  try {
    const expense = await Expense.findByPk(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found.' });

    // Branch-scoped users may only update their own branch's records
    if (req.userBranchId && expense.branch_id !== req.userBranchId) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const allowed = ['category', 'title', 'amount', 'date', 'paid_to', 'payment_method', 'receipt_number', 'notes'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) expense[field] = req.body[field];
    }
    await expense.save();
    return res.json(expense);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── DELETE /api/expenses/:id ──────────────────────────────────────────────────
const remove = async (req, res) => {
  try {
    const expense = await Expense.findByPk(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found.' });
    await expense.destroy();
    return res.json({ message: 'Expense deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, summary, profitLoss, getOne, create, update, remove };
