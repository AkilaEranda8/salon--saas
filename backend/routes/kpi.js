'use strict';
const { Router } = require('express');
const { Op, fn, col, literal } = require('sequelize');
const { sequelize } = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const { tenantWhere, resolveTenantId } = require('../utils/tenantScope');

const router = Router();
router.use(verifyToken);

// GET /api/kpi/summary — multi-branch overview
router.get('/summary', requireRole('superadmin', 'admin', 'platform_admin'), async (req, res) => {
  try {
    const { Branch, Appointment, Payment, Staff, Customer, WalkIn } = require('../models');
    const tenantId = resolveTenantId(req);
    const tenantWhr = tenantId ? { tenant_id: tenantId } : {};

    const today   = new Date().toISOString().slice(0, 10);
    const weekAgo  = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

    // Get all branches
    const branches = await Branch.findAll({
      where: { ...tenantWhr, status: 'active' },
      attributes: ['id', 'name', 'color'],
      order: [['name', 'ASC']],
    });

    const branchIds = branches.map((b) => b.id);

    if (!branchIds.length) return res.json({ branches: [], summary: {} });

    // Revenue per branch for today, this week, this month
    const [todayRev, weekRev, monthRev] = await Promise.all([
      Payment.findAll({
        where: { branch_id: { [Op.in]: branchIds }, date: today },
        attributes: ['branch_id', [fn('SUM', col('total_amount')), 'revenue']],
        group: ['branch_id'],
        raw: true,
      }),
      Payment.findAll({
        where: { branch_id: { [Op.in]: branchIds }, date: { [Op.gte]: weekAgo } },
        attributes: ['branch_id', [fn('SUM', col('total_amount')), 'revenue'], [fn('COUNT', col('Payment.id')), 'tx_count']],
        group: ['branch_id'],
        raw: true,
      }),
      Payment.findAll({
        where: { branch_id: { [Op.in]: branchIds }, date: { [Op.gte]: monthStart } },
        attributes: ['branch_id', [fn('SUM', col('total_amount')), 'revenue']],
        group: ['branch_id'],
        raw: true,
      }),
    ]);

    // Appointments today per branch
    const todayAppts = await Appointment.findAll({
      where: { branch_id: { [Op.in]: branchIds }, date: today },
      attributes: ['branch_id', 'status', [fn('COUNT', col('Appointment.id')), 'count']],
      group: ['branch_id', 'status'],
      raw: true,
    });

    // Top staff by revenue this month per branch
    const topStaff = await Payment.findAll({
      where: { branch_id: { [Op.in]: branchIds }, date: { [Op.gte]: monthStart } },
      attributes: ['branch_id', 'staff_id', [fn('SUM', col('total_amount')), 'revenue']],
      group: ['branch_id', 'staff_id'],
      order: [[fn('SUM', col('total_amount')), 'DESC']],
      include: [{ model: Staff, as: 'staff', attributes: ['id', 'name'] }],
    });

    // Customer count per branch
    const customerCounts = await Customer.findAll({
      where: { branch_id: { [Op.in]: branchIds } },
      attributes: ['branch_id', [fn('COUNT', col('Customer.id')), 'count']],
      group: ['branch_id'],
      raw: true,
    });

    // WalkIn count today
    const walkInToday = await WalkIn.findAll({
      where: { branch_id: { [Op.in]: branchIds }, createdAt: { [Op.gte]: new Date(today) } },
      attributes: ['branch_id', [fn('COUNT', col('WalkIn.id')), 'count']],
      group: ['branch_id'],
      raw: true,
    });

    // Build per-branch data
    const toMap = (arr, key = 'branch_id') => arr.reduce((m, r) => { m[r[key]] = r; return m; }, {});
    const todayRevMap   = toMap(todayRev);
    const weekRevMap    = toMap(weekRev);
    const monthRevMap   = toMap(monthRev);
    const custMap       = toMap(customerCounts);
    const walkInMap     = toMap(walkInToday);

    // Appointment counts grouped by branch + status
    const apptMap = {};
    for (const a of todayAppts) {
      if (!apptMap[a.branch_id]) apptMap[a.branch_id] = {};
      apptMap[a.branch_id][a.status] = Number(a.count);
    }

    // Top staff per branch
    const staffMap = {};
    for (const s of topStaff) {
      if (!staffMap[s.branch_id]) staffMap[s.branch_id] = [];
      if (staffMap[s.branch_id].length < 3) {
        staffMap[s.branch_id].push({ id: s.staff_id, name: s.staff?.name || 'Staff', revenue: Number(s.revenue) });
      }
    }

    const enriched = branches.map((b) => {
      const appts = apptMap[b.id] || {};
      const totalApptToday = Object.values(appts).reduce((s, v) => s + v, 0);
      const completedToday = appts.completed || 0;
      const utilizationRate = totalApptToday > 0 ? Math.round((completedToday / totalApptToday) * 100) : 0;
      return {
        id: b.id,
        name: b.name,
        color: b.color || '#6366f1',
        revenue_today:   Number(todayRevMap[b.id]?.revenue  || 0),
        revenue_week:    Number(weekRevMap[b.id]?.revenue   || 0),
        revenue_month:   Number(monthRevMap[b.id]?.revenue  || 0),
        tx_week:         Number(weekRevMap[b.id]?.tx_count  || 0),
        appointments_today: totalApptToday,
        appointments_breakdown: appts,
        utilization_rate: utilizationRate,
        customer_count:  Number(custMap[b.id]?.count        || 0),
        walkin_today:    Number(walkInMap[b.id]?.count      || 0),
        top_staff:       staffMap[b.id] || [],
      };
    });

    // Global summary
    const globalRevToday  = enriched.reduce((s, b) => s + b.revenue_today,  0);
    const globalRevMonth  = enriched.reduce((s, b) => s + b.revenue_month,  0);
    const globalAppts     = enriched.reduce((s, b) => s + b.appointments_today, 0);
    const globalCustomers = enriched.reduce((s, b) => s + b.customer_count, 0);

    return res.json({
      branches: enriched,
      summary: {
        total_revenue_today:  globalRevToday,
        total_revenue_month:  globalRevMonth,
        total_appointments_today: globalAppts,
        total_customers:      globalCustomers,
        branch_count:         branches.length,
      },
    });
  } catch (err) {
    console.error('[KPI] error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
