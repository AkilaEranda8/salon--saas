const { Op, fn, col, literal } = require('sequelize');
const {
  CommissionTransaction,
  Payment,
  Branch,
  Staff,
} = require('../models');
const { tenantWhere } = require('../utils/tenantScope');
const { hasFranchiseCommission } = require('../utils/tenantFeatures');

function requireFranchise(req, res) {
  if (!hasFranchiseCommission(req.tenant)) {
    res.status(403).json({ message: 'Franchise commission is not enabled for this salon.' });
    return false;
  }
  return true;
}

function branchFilter(req) {
  const where = tenantWhere(req);
  if (req.userBranchId) where.branch_id = req.userBranchId;
  else if (req.query.branchId) where.branch_id = req.query.branchId;
  return where;
}

function dateRangeWhere(month, year, date) {
  if (date) return { date };
  if (month && year) {
    const m = String(month).padStart(2, '0');
    const start = `${year}-${m}-01`;
    const last = new Date(year, month, 0).getDate();
    return { date: { [Op.between]: [start, `${year}-${m}-${last}`] } };
  }
  return {};
}

/** GET /api/reports/franchise/manager-daily-range?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId= */
const managerDailyByDay = async (req, res) => {
  try {
    if (!requireFranchise(req, res)) return;
    const { from, to, branchId } = req.query;
    if (!from || !to) {
      return res.status(400).json({ message: 'from and to are required (YYYY-MM-DD).' });
    }

    const where = {
      ...branchFilter(req),
      transaction_type: 'manager_override',
      date: { [Op.between]: [from, to] },
    };
    if (branchId && !req.userBranchId) where.branch_id = branchId;

    const agg = await CommissionTransaction.findAll({
      where,
      attributes: [
        'date',
        [fn('COUNT', col('id')), 'transactionCount'],
        [fn('SUM', col('service_amount')), 'totalServiceAmount'],
        [fn('SUM', col('commission_amount')), 'totalCommission'],
      ],
      group: ['date'],
      order: [['date', 'DESC']],
      raw: true,
    });

    return res.json({
      from,
      to,
      days: agg.map((r) => ({
        date: String(r.date).slice(0, 10),
        transactionCount: parseInt(r.transactionCount, 10) || 0,
        totalServiceAmount: parseFloat(r.totalServiceAmount) || 0,
        totalCommission: parseFloat(r.totalCommission) || 0,
      })),
    });
  } catch (err) {
    console.error('managerDailyByDay:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/** GET /api/reports/franchise/manager-daily?date=YYYY-MM-DD&branchId= */
const dailyManagerCommission = async (req, res) => {
  try {
    if (!requireFranchise(req, res)) return;
    const { date, branchId } = req.query;
    if (!date) return res.status(400).json({ message: 'date is required (YYYY-MM-DD).' });

    const day = String(date).slice(0, 10);
    const where = {
      ...branchFilter(req),
      transaction_type: 'manager_override',
      date: day,
    };
    if (branchId && !req.userBranchId) where.branch_id = branchId;

    const rows = await CommissionTransaction.findAll({
      where,
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
        { model: Staff, as: 'managerStaff', attributes: ['id', 'name', 'role_title'] },
        { model: Staff, as: 'workerStaff', attributes: ['id', 'name', 'role_title'] },
        { model: Payment, as: 'payment', attributes: ['id', 'customer_name', 'total_amount', 'date'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    const summary = rows.reduce((acc, r) => {
      const mid = r.manager_staff_id;
      if (!acc[mid]) {
        acc[mid] = {
          managerId: mid,
          managerName: r.managerStaff?.name || '—',
          branchName: r.branch?.name || '—',
          transactionCount: 0,
          totalServiceAmount: 0,
          totalCommission: 0,
        };
      }
      acc[mid].transactionCount += 1;
      acc[mid].totalServiceAmount += parseFloat(r.service_amount) || 0;
      acc[mid].totalCommission += parseFloat(r.commission_amount) || 0;
      return acc;
    }, {});

    return res.json({
      date: day,
      summary: Object.values(summary),
      transactions: rows.map((r) => ({
        id: r.id,
        paymentId: r.payment_id,
        date: String(r.date).slice(0, 10),
        branchName: r.branch?.name || '',
        managerName: r.managerStaff?.name || '',
        workerName: r.workerStaff?.name || '',
        customerName: r.payment?.customer_name || '',
        serviceAmount: parseFloat(r.service_amount) || 0,
        commissionPercent: parseFloat(r.commission_percent) || 0,
        commissionAmount: parseFloat(r.commission_amount) || 0,
      })),
    });
  } catch (err) {
    console.error('dailyManagerCommission:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/** GET /api/reports/franchise/manager-monthly?month=&year=&branchId= */
const monthlyManagerCommission = async (req, res) => {
  try {
    if (!requireFranchise(req, res)) return;
    const { month, year, branchId } = req.query;
    if (!month || !year) return res.status(400).json({ message: 'month and year are required.' });

    const where = {
      ...branchFilter(req),
      transaction_type: 'manager_override',
      ...dateRangeWhere(month, year),
    };
    if (branchId && !req.userBranchId) where.branch_id = branchId;

    const agg = await CommissionTransaction.findAll({
      where,
      attributes: [
        'manager_staff_id',
        'branch_id',
        [fn('SUM', col('service_amount')), 'totalServiceAmount'],
        [fn('SUM', col('commission_amount')), 'totalCommission'],
        [fn('COUNT', col('id')), 'transactionCount'],
        [fn('AVG', col('commission_percent')), 'avgPercent'],
      ],
      group: ['manager_staff_id', 'branch_id'],
      raw: true,
    });

    const managerIds = [...new Set(agg.map((r) => r.manager_staff_id).filter(Boolean))];
    const branchIds = [...new Set(agg.map((r) => r.branch_id).filter(Boolean))];
    const [managers, branches] = await Promise.all([
      managerIds.length
        ? Staff.findAll({ where: { id: { [Op.in]: managerIds }, ...tenantWhere(req) }, attributes: ['id', 'name'] })
        : [],
      branchIds.length
        ? Branch.findAll({ where: { id: { [Op.in]: branchIds }, ...tenantWhere(req) }, attributes: ['id', 'name'] })
        : [],
    ]);
    const managerMap = Object.fromEntries(managers.map((m) => [m.id, m.name]));
    const branchMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));

    return res.json({
      month: Number(month),
      year: Number(year),
      rows: agg.map((r) => ({
        managerId: r.manager_staff_id,
        managerName: managerMap[r.manager_staff_id] || '—',
        branchId: r.branch_id,
        branchName: branchMap[r.branch_id] || '—',
        transactionCount: parseInt(r.transactionCount, 10) || 0,
        totalServiceAmount: parseFloat(r.totalServiceAmount) || 0,
        totalCommission: parseFloat(r.totalCommission) || 0,
        avgPercent: parseFloat(r.avgPercent) || 0,
      })),
    });
  } catch (err) {
    console.error('monthlyManagerCommission:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/** GET /api/reports/franchise/branch-summary?month=&year= */
const branchCommissionSummary = async (req, res) => {
  try {
    if (!requireFranchise(req, res)) return;
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ message: 'month and year are required.' });

    const where = {
      ...branchFilter(req),
      ...dateRangeWhere(month, year),
    };

    const agg = await CommissionTransaction.findAll({
      where,
      attributes: [
        'branch_id',
        'transaction_type',
        [fn('SUM', col('service_amount')), 'totalServiceAmount'],
        [fn('SUM', col('commission_amount')), 'totalCommission'],
        [fn('COUNT', col('id')), 'transactionCount'],
      ],
      group: ['branch_id', 'transaction_type'],
      raw: true,
    });

    const branchIds = [...new Set(agg.map((r) => r.branch_id).filter(Boolean))];
    const branches = branchIds.length
      ? await Branch.findAll({ where: { id: { [Op.in]: branchIds }, ...tenantWhere(req) }, attributes: ['id', 'name', 'manager_commission_percent'] })
      : [];
    const branchMap = Object.fromEntries(branches.map((b) => [b.id, b]));

    const byBranch = {};
    for (const r of agg) {
      const bid = r.branch_id || 0;
      if (!byBranch[bid]) {
        const b = branchMap[bid];
        byBranch[bid] = {
          branchId: bid,
          branchName: b?.name || '—',
          managerCommissionPercent: parseFloat(b?.manager_commission_percent) || null,
          workerCommission: 0,
          managerCommission: 0,
          totalServiceAmount: 0,
          transactionCount: 0,
        };
      }
      const amt = parseFloat(r.totalCommission) || 0;
      const svc = parseFloat(r.totalServiceAmount) || 0;
      byBranch[bid].totalServiceAmount += svc;
      byBranch[bid].transactionCount += parseInt(r.transactionCount, 10) || 0;
      if (r.transaction_type === 'worker') byBranch[bid].workerCommission += amt;
      else if (r.transaction_type === 'manager_override') byBranch[bid].managerCommission += amt;
    }

    return res.json({
      month: Number(month),
      year: Number(year),
      branches: Object.values(byBranch).sort((a, b) => a.branchName.localeCompare(b.branchName)),
    });
  } catch (err) {
    console.error('branchCommissionSummary:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/** GET /api/reports/franchise/staff-contribution?month=&year=&branchId= */
const staffContributionReport = async (req, res) => {
  try {
    if (!requireFranchise(req, res)) return;
    const { month, year, branchId } = req.query;
    if (!month || !year) return res.status(400).json({ message: 'month and year are required.' });

    const where = {
      ...branchFilter(req),
      transaction_type: 'manager_override',
      ...dateRangeWhere(month, year),
    };
    if (branchId && !req.userBranchId) where.branch_id = branchId;

    const agg = await CommissionTransaction.findAll({
      where,
      attributes: [
        'worker_staff_id',
        'branch_id',
        [fn('SUM', col('service_amount')), 'totalServiceAmount'],
        [fn('SUM', col('commission_amount')), 'managerCommissionGenerated'],
        [fn('COUNT', col('id')), 'paymentCount'],
      ],
      group: ['worker_staff_id', 'branch_id'],
      raw: true,
    });

    const workerIds = [...new Set(agg.map((r) => r.worker_staff_id).filter(Boolean))];
    const branchIds = [...new Set(agg.map((r) => r.branch_id).filter(Boolean))];
    const [workers, branches, workerCommAgg] = await Promise.all([
      workerIds.length
        ? Staff.findAll({ where: { id: { [Op.in]: workerIds }, ...tenantWhere(req) }, attributes: ['id', 'name', 'role_title', 'commission_value'] })
        : [],
      branchIds.length
        ? Branch.findAll({ where: { id: { [Op.in]: branchIds }, ...tenantWhere(req) }, attributes: ['id', 'name'] })
        : [],
      workerIds.length
        ? CommissionTransaction.findAll({
          where: {
            ...branchFilter(req),
            ...dateRangeWhere(month, year),
            transaction_type: 'worker',
            worker_staff_id: { [Op.in]: workerIds },
          },
          attributes: [
            'worker_staff_id',
            [fn('SUM', col('commission_amount')), 'workerCommission'],
          ],
          group: ['worker_staff_id'],
          raw: true,
        })
        : [],
    ]);

    const workerMap = Object.fromEntries(workers.map((w) => [w.id, w]));
    const branchMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));
    const workerCommMap = Object.fromEntries(
      workerCommAgg.map((r) => [r.worker_staff_id, parseFloat(r.workerCommission) || 0]),
    );

    return res.json({
      month: Number(month),
      year: Number(year),
      rows: agg.map((r) => ({
        staffId: r.worker_staff_id,
        staffName: workerMap[r.worker_staff_id]?.name || '—',
        role: workerMap[r.worker_staff_id]?.role_title || '',
        branchName: branchMap[r.branch_id] || '—',
        paymentCount: parseInt(r.paymentCount, 10) || 0,
        totalServiceAmount: parseFloat(r.totalServiceAmount) || 0,
        staffCommission: workerCommMap[r.worker_staff_id] || 0,
        managerCommissionGenerated: parseFloat(r.managerCommissionGenerated) || 0,
      })).sort((a, b) => a.staffName.localeCompare(b.staffName)),
    });
  } catch (err) {
    console.error('staffContributionReport:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  managerDailyByDay,
  dailyManagerCommission,
  monthlyManagerCommission,
  branchCommissionSummary,
  staffContributionReport,
};
