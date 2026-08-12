const { Op, fn, col, literal } = require('sequelize');
const { sequelize } = require('../config/database');
const { Appointment, Payment, PaymentSplit, Branch, Staff, Service, InvProduct, Reminder, Customer, Expense, WalkIn, CommissionTransaction } = require('../models');
const XLSX = require('xlsx');
const { tenantWhere } = require('../utils/tenantScope');
const { paymentTotalCommission } = require('../utils/paymentCommissionTotals');
const { aggregateStaffCommissionFromDb, sumCommissionForPayments, loadPaymentsForCommission } = require('../utils/commissionFromTransactions');

/* ── Sri Lanka timezone helpers (UTC+05:30) ─────────────────── */
const SL_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const slToday = () => new Date(Date.now() + SL_OFFSET_MS).toISOString().slice(0, 10);
const slThisMonth = () => new Date(Date.now() + SL_OFFSET_MS).toISOString().slice(0, 7);

const getBranchWhere = (req) => {
  const where = tenantWhere(req);
  if (req.userBranchId)    where.branch_id = req.userBranchId;
  else if (req.query.branchId) where.branch_id = req.query.branchId;
  return where;
};

const getMonthRange = (monthValue) => {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) return null;
  const [yearStr, monthStr] = monthValue.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (!year || !month || month < 1 || month > 12) return null;
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${yearStr}-${monthStr}-01`,
    end: `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`,
  };
};

/** Resolve payment/appointment date filter: date | from+to | month */
function getReportDateWhere(query = {}) {
  if (query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
    return { date: query.date };
  }
  const fromOk = query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from);
  const toOk = query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to);
  if (fromOk || toOk) {
    const start = fromOk ? query.from : query.to;
    const end = toOk ? query.to : (fromOk ? slToday() : query.from);
    return { date: { [Op.between]: [start, end] } };
  }
  if (query.month) {
    const range = getMonthRange(query.month);
    if (range) return { date: { [Op.between]: [range.start, range.end] } };
  }
  return {};
}

// GET /api/reports/revenue  — last 12 months grouped by month
const revenue = async (req, res) => {
  try {
    const where = getBranchWhere(req);
    const monthRange = getMonthRange(req.query.month);
    const d = monthRange ? new Date(`${monthRange.end}T00:00:00`) : new Date();
    const start = new Date(d.getFullYear(), d.getMonth() - 11, 1).toISOString().slice(0, 10);
    where.date = { [Op.gte]: start };

    const rows = await Payment.findAll({
      where,
      attributes: [
        [fn('DATE_FORMAT', col('date'), '%Y-%m'), 'month'],
        [fn('SUM', col('total_amount')),    'revenue'],
        [fn('SUM', col('commission_amount')), 'commission'],
        [fn('COUNT', col('Payment.id')),    'count'],
      ],
      group: [literal("DATE_FORMAT(`date`, '%Y-%m')")],
      order: [[literal("DATE_FORMAT(`date`, '%Y-%m')"), 'ASC']],
      raw: true,
    });

    let txnByMonth = {};
    try {
      const txnRows = await CommissionTransaction.findAll({
        where,
        attributes: [
          [fn('DATE_FORMAT', col('date'), '%Y-%m'), 'month'],
          [fn('SUM', col('commission_amount')), 'commission'],
        ],
        group: [literal("DATE_FORMAT(`date`, '%Y-%m')")],
        raw: true,
      });
      txnByMonth = Object.fromEntries(
        txnRows.map((r) => [r.month, parseFloat(r.commission) || 0]),
      );
    } catch (txnErr) {
      console.warn('reports/revenue txn overlay skipped:', txnErr.message);
    }

    const data = rows.map((r) => ({
      ...r,
      commission: txnByMonth[r.month] != null ? txnByMonth[r.month] : (parseFloat(r.commission) || 0),
    }));

    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// GET /api/reports/services — revenue per service
const services = async (req, res) => {
  try {
    const where = { ...getBranchWhere(req), ...getReportDateWhere(req.query) };

    const rows = await Payment.findAll({
      where,
      attributes: [
        'service_id',
        [fn('SUM', col('total_amount')),  'revenue'],
        [fn('COUNT', col('Payment.id')), 'count'],
      ],
      group: ['service_id'],
      order: [[fn('SUM', col('total_amount')), 'DESC']],
      include: [{ model: Service, as: 'service', attributes: ['id', 'name', 'category'] }],
    });

    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

// GET /api/reports/staff — staff performance (supports date | from+to | month)
const staffReport = async (req, res) => {
  try {
    const branchWhere = getBranchWhere(req);
    const dateWhere = getReportDateWhere(req.query);

    // 1. All staff (with branch info)
    const staffRows = await Staff.findAll({
      where: { ...branchWhere, is_active: true },
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
    });

    if (!staffRows.length) return res.json([]);

    const staffIds = staffRows.map((s) => Number(s.id));

    // 2. Appointment counts — separate query to avoid cartesian product
    const apptAgg = await Appointment.findAll({
      where: { ...branchWhere, staff_id: { [Op.in]: staffIds }, ...dateWhere },
      attributes: ['staff_id', [fn('COUNT', col('id')), 'apptCount']],
      group: ['staff_id'],
      raw: true,
    });

    // 3. Per-staff commission shares (multi-staff + helpers), not header staff_id only
    const periodPayments = await Payment.findAll({
      where: { ...branchWhere, ...dateWhere },
      attributes: [
        'id', 'staff_id', 'total_amount', 'commission_amount', 'commission_breakdown',
        'helper_commission', 'manager_staff_id', 'manager_commission_amount',
      ],
      raw: true,
    });
    const payIds = periodPayments.map((p) => Number(p.id)).filter((id) => id > 0);
    const payMap = await aggregateStaffCommissionFromDb({
      where: payIds.length ? { payment_id: { [Op.in]: payIds } } : { id: { [Op.in]: [-1] } },
      staffIds,
      payments: periodPayments,
    });

    // Build lookup maps
    const apptMap = {};
    for (const r of apptAgg) apptMap[r.staff_id] = r;

    // Merge and return
    const mergedByUser = new Map();
    for (const staff of staffRows) {
      const pay = payMap[Number(staff.id)] || payMap[staff.id] || { mainCommission: 0, helperCommission: 0, totalRevenue: 0, paymentCount: 0 };
      const mainComm = Math.round((pay.mainCommission || 0) * 100) / 100;
      const helperComm = Math.round((pay.helperCommission || 0) * 100) / 100;
      const row = {
        ...staff.toJSON(),
        apptCount:       parseInt(apptMap[staff.id]?.apptCount || 0, 10),
        paymentCount:    pay.paymentCount || 0,
        mainCommission:  mainComm,
        helperCommission: helperComm,
        totalCommission: Math.round((mainComm + helperComm) * 100) / 100,
        totalRevenue:    Math.round((pay.totalRevenue || 0) * 100) / 100,
      };
      const key = row.user_id ? `user:${row.user_id}` : `staff:${row.id}`;
      const existing = mergedByUser.get(key);
      if (!existing) {
        mergedByUser.set(key, row);
        continue;
      }

      existing.apptCount += row.apptCount;
      existing.paymentCount += row.paymentCount;
      existing.mainCommission += row.mainCommission;
      existing.helperCommission += row.helperCommission;
      existing.totalCommission += row.totalCommission;
      existing.totalRevenue += row.totalRevenue;

      const existingBranch = existing.branch?.name;
      const incomingBranch = row.branch?.name;
      if (existingBranch && incomingBranch && existingBranch !== incomingBranch) {
        existing.branch = { ...existing.branch, name: `${existingBranch}, ${incomingBranch}` };
      }
    }

    const rows = Array.from(mergedByUser.values())
      .sort((a, b) => (b.totalRevenue || 0) - (a.totalRevenue || 0));

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// GET /api/reports/appointments — status breakdown
const appointmentStats = async (req, res) => {
  try {
    const where = { ...getBranchWhere(req), ...getReportDateWhere(req.query) };

    const rows = await Appointment.findAll({
      where,
      attributes: [
        'status',
        [fn('COUNT', col('Appointment.id')), 'count'],
      ],
      group: ['status'],
    });

    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

// GET /api/reports/dashboard — combined summary
const dashboard = async (req, res) => {
  try {
    const branchWhere = getBranchWhere(req);
    const today = slToday();
    const selectedMonthRange = getMonthRange(req.query.month);
    const [yrStr, moStr] = (selectedMonthRange ? selectedMonthRange.start : today).split('-');
    const currentMonthStart = `${yrStr}-${moStr}-01`;
    const currentLastDay = new Date(parseInt(yrStr, 10), parseInt(moStr, 10), 0).getDate();
    const currentMonthEnd = `${yrStr}-${moStr}-${String(currentLastDay).padStart(2, '0')}`;
    const monthStart = selectedMonthRange?.start || currentMonthStart;
    const monthEnd = selectedMonthRange?.end || currentMonthEnd;

    const monthPayWhere = { ...branchWhere, date: { [Op.between]: [monthStart, monthEnd] } };
    const [
      todayAppts,
      todayRevenue,
      monthPayStats,
      totalCustomers,
      lowStockCount,
      pendingReminders,
      branchAppts,
    ] = await Promise.all([
      Appointment.count({ where: { ...branchWhere, date: today } }),
      Payment.sum('total_amount', { where: { ...branchWhere, date: today } }),
      (async () => {
        const monthPayments = await loadPaymentsForCommission(monthPayWhere);
        const monthRevenue = monthPayments.reduce((s, p) => s + (parseFloat(p.total_amount) || 0), 0);
        const monthCommission = await sumCommissionForPayments(monthPayments);
        const byBranch = {};
        for (const p of monthPayments) {
          const bid = Number(p.branch_id);
          if (!byBranch[bid]) byBranch[bid] = [];
          byBranch[bid].push(p);
        }
        const branchRevenue = {};
        const branchCommission = {};
        for (const [bid, rows] of Object.entries(byBranch)) {
          branchRevenue[bid] = rows.reduce((s, p) => s + (parseFloat(p.total_amount) || 0), 0);
          branchCommission[bid] = await sumCommissionForPayments(rows);
        }
        return { monthRevenue, monthCommission, branchRevenue, branchCommission };
      })(),
      Customer.count({ where: branchWhere }),
      InvProduct.count({
        where: {
          ...branchWhere,
          status: 'active',
          current_stock: { [Op.lte]: sequelize.col('min_stock') },
        },
      }),
      Reminder.count({ where: { ...branchWhere, is_done: false } }),
      !req.userBranchId
        ? Appointment.findAll({
            where: { ...tenantWhere(req), date: today },
            attributes: ['branch_id', [fn('COUNT', col('Appointment.id')), 'todayAppts']],
            group: ['branch_id'],
            raw: true,
          })
        : [],
    ]);

    let branchStats = [];
    if (!req.userBranchId) {
      const branchFilter = {
        ...tenantWhere(req),
        ...(req.query.branchId ? { id: req.query.branchId } : {}),
        status: 'active',
      };
      const branches = await Branch.findAll({
        where: branchFilter,
        attributes: ['id', 'name', 'status', 'color'],
        order: [['name', 'ASC']],
      });
      const apptMap = Object.fromEntries(
        (branchAppts || []).map((r) => [Number(r.branch_id), Number(r.todayAppts || 0)])
      );
      branchStats = branches.map((b) => {
        const json = b.toJSON();
        json.todayAppts = apptMap[b.id] || 0;
        json.monthRevenue = monthPayStats.branchRevenue[b.id] || 0;
        json.monthCommission = monthPayStats.branchCommission[b.id] || 0;
        return json;
      });
    }

    return res.json({
      todayAppts,
      todayRevenue:    todayRevenue    || 0,
      monthRevenue:    monthPayStats.monthRevenue || 0,
      monthCommission: monthPayStats.monthCommission || 0,
      totalCustomers,
      lowStockCount,
      pendingReminders,
      branchStats,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// GET /api/reports/export — Excel download with multiple sheets
const exportExcel = async (req, res) => {
  try {
    const branchWhere = getBranchWhere(req);
    const { from, to } = req.query;
    const dateFilter = {};
    if (from && to) dateFilter.date = { [Op.between]: [from, to] };
    else if (from)  dateFilter.date = { [Op.gte]: from };
    else if (to)    dateFilter.date = { [Op.lte]: to };

    const payWhere = { ...branchWhere, ...dateFilter };
    const apptWhere = { ...branchWhere, ...dateFilter };
    const expWhere = { ...branchWhere, ...dateFilter };

    // ── Fetch all data in parallel ──
    const [payments, appointments, expenses, staffRows, customers] = await Promise.all([
      Payment.findAll({
        where: payWhere,
        include: [
          { model: Branch, as: 'branch', attributes: ['name'] },
          { model: Staff, as: 'staff', attributes: ['name'] },
          { model: Customer, as: 'customer', attributes: ['name', 'phone'] },
          { model: Service, as: 'service', attributes: ['name', 'category'] },
          { model: PaymentSplit, as: 'splits', attributes: ['method', 'amount'] },
        ],
        order: [['date', 'DESC']],
      }),
      Appointment.findAll({
        where: apptWhere,
        include: [
          { model: Branch, as: 'branch', attributes: ['name'] },
          { model: Staff, as: 'staff', attributes: ['name'] },
          { model: Service, as: 'service', attributes: ['name'] },
        ],
        order: [['date', 'DESC'], ['time', 'ASC']],
      }),
      Expense.findAll({
        where: expWhere,
        include: [{ model: Branch, as: 'branch', attributes: ['name'] }],
        order: [['date', 'DESC']],
      }),
      Staff.findAll({
        where: branchWhere.branch_id ? { branch_id: branchWhere.branch_id } : {},
        include: [{ model: Branch, as: 'branch', attributes: ['name'] }],
      }),
      Customer.findAll({
        where: branchWhere.branch_id ? { branch_id: branchWhere.branch_id } : {},
        include: [{ model: Branch, as: 'branch', attributes: ['name'] }],
        order: [['total_spent', 'DESC']],
      }),
    ]);

    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Payments ──
    const payData = payments.map(p => ({
      Date: p.date,
      Customer: p.customer?.name || p.customer_name || '',
      Phone: p.customer?.phone || '',
      Service: p.service?.name || '',
      Category: p.service?.category || '',
      Staff: p.staff?.name || '',
      Branch: p.branch?.name || '',
      'Total (Rs)': Number(p.total_amount || 0),
      'Commission (Rs)': paymentTotalCommission(p),
      'Loyalty Discount': Number(p.loyalty_discount || 0),
      'Points Earned': p.points_earned || 0,
      'Payment Methods': (p.splits || []).map(s => `${s.method}: Rs.${s.amount}`).join(', '),
      Status: p.status,
    }));
    const ws1 = XLSX.utils.json_to_sheet(payData);
    ws1['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 30 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Payments');

    // ── Sheet 2: Appointments ──
    const apptData = appointments.map(a => ({
      Date: a.date,
      Time: a.time,
      Customer: a.customer_name || '',
      Phone: a.phone || '',
      Service: a.service?.name || '',
      Staff: a.staff?.name || '',
      Branch: a.branch?.name || '',
      'Amount (Rs)': Number(a.amount || 0),
      Status: a.status,
      Notes: a.notes || '',
    }));
    const ws2 = XLSX.utils.json_to_sheet(apptData);
    ws2['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Appointments');

    // ── Sheet 3: Expenses ──
    const expData = expenses.map(e => ({
      Date: e.date,
      Category: e.category,
      Title: e.title,
      'Amount (Rs)': Number(e.amount || 0),
      'Paid To': e.paid_to || '',
      'Payment Method': e.payment_method || '',
      'Receipt #': e.receipt_number || '',
      Branch: e.branch?.name || '',
      Notes: e.notes || '',
    }));
    const ws3 = XLSX.utils.json_to_sheet(expData);
    ws3['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 25 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Expenses');

    // ── Sheet 4: Staff Performance ──
    const staffAgg = await aggregateStaffCommissionFromDb({
      where: payWhere,
      staffIds: staffRows.map((s) => Number(s.id)),
      payments,
    });
    const staffData = staffRows.map(s => {
      const sp = staffAgg[Number(s.id)] || staffAgg[s.id] || { totalRevenue: 0, mainCommission: 0, helperCommission: 0, paymentCount: 0 };
      return {
        Name: s.name,
        Role: s.role_title || '',
        Branch: s.branch?.name || '',
        'Commission Type': s.commission_type,
        'Commission Rate': Number(s.commission_value || 0),
        'Total Revenue (Rs)': sp.totalRevenue,
        'Main Commission (Rs)': sp.mainCommission,
        'Helper Commission (Rs)': sp.helperCommission,
        'Total Commission (Rs)': (sp.mainCommission || 0) + (sp.helperCommission || 0),
        'Payments Count': sp.paymentCount,
        'Active': s.is_active ? 'Yes' : 'No',
        'Joined': s.join_date || '',
      };
    });
    const ws4 = XLSX.utils.json_to_sheet(staffData);
    ws4['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 8 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Staff');

    // ── Sheet 5: Customers ──
    const custData = customers.map(c => ({
      Name: c.name,
      Phone: c.phone || '',
      Email: c.email || '',
      Branch: c.branch?.name || '',
      Visits: c.visits || 0,
      'Total Spent (Rs)': Number(c.total_spent || 0),
      'Loyalty Points': c.loyalty_points || 0,
      'Last Visit': c.last_visit || '',
    }));
    const ws5 = XLSX.utils.json_to_sheet(custData);
    ws5['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 24 }, { wch: 16 }, { wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws5, 'Customers');

    // ── Sheet 6: Summary ──
    const totalRevenue    = payments.reduce((s, p) => s + Number(p.total_amount || 0), 0);
    const totalCommission = await sumCommissionForPayments(payments);
    const totalExpenses   = expenses.reduce((s, p) => s + Number(p.amount || 0), 0);
    const summaryData = [
      { Metric: 'Total Revenue', Value: totalRevenue },
      { Metric: 'Total Commission', Value: totalCommission },
      { Metric: 'Total Expenses', Value: totalExpenses },
      { Metric: 'Gross Profit', Value: totalRevenue - totalExpenses },
      { Metric: 'Net Profit', Value: totalRevenue - totalExpenses - totalCommission },
      { Metric: 'Total Payments', Value: payments.length },
      { Metric: 'Total Appointments', Value: appointments.length },
      { Metric: 'Total Customers', Value: customers.length },
      { Metric: 'Active Staff', Value: staffRows.filter(s => s.is_active).length },
      { Metric: 'Report Period', Value: from && to ? `${from} to ${to}` : 'All Time' },
    ];
    const ws6 = XLSX.utils.json_to_sheet(summaryData);
    ws6['!cols'] = [{ wch: 22 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws6, 'Summary');

    // ── Write & send ──
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Hexaone_Report_${from || 'all'}_${to || 'all'}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buf);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Export failed.' });
  }
};

module.exports = { revenue, services, staffReport, appointmentStats, dashboard, exportExcel };
