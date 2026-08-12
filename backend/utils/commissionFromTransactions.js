const { Op } = require('sequelize');
const { CommissionTransaction } = require('../models');
const { staffCommissionShares } = require('./paymentCommissionTotals');

function emptyShare() {
  return { mainCommission: 0, helperCommission: 0, totalRevenue: 0, paymentCount: 0 };
}

/**
 * Per-staff commission for a period.
 * Prefers commission_transactions (one row per worker/helper); fills gaps from payment shares.
 */
async function aggregateStaffCommissionFromDb({ where = {}, staffIds = [], payments = [] }) {
  const ids = staffIds.map(Number).filter((id) => id > 0);
  const staffIdSet = new Set(ids);
  const map = {};
  const bump = (id, { main = 0, helper = 0, revenue = 0, count = 0 } = {}) => {
    const sid = Number(id);
    if (!staffIdSet.has(sid)) return;
    const prev = map[sid] || emptyShare();
    map[sid] = {
      mainCommission: prev.mainCommission + (parseFloat(main) || 0),
      helperCommission: prev.helperCommission + (parseFloat(helper) || 0),
      totalRevenue: prev.totalRevenue + (parseFloat(revenue) || 0),
      paymentCount: prev.paymentCount + (parseInt(count, 10) || 0),
    };
  };

  const applyPaymentShares = (skip = new Set()) => {
    for (const p of payments) {
      for (const share of staffCommissionShares(p)) {
        const roleKey = share.role === 'helper' ? 'helper' : 'worker';
        if (skip.has(`${share.staff_id}:${p.id}:${roleKey}`)) continue;
        if (share.role === 'helper') {
          bump(share.staff_id, { helper: share.amount, count: 1 });
        } else {
          bump(share.staff_id, { main: share.amount, revenue: share.revenue || 0, count: 1 });
        }
      }
    }
  };

  if (!ids.length) {
    applyPaymentShares();
    return map;
  }

  let txnRows = [];
  try {
    txnRows = await CommissionTransaction.findAll({
      where: {
        ...where,
        [Op.or]: [
          { worker_staff_id: { [Op.in]: ids } },
          { manager_staff_id: { [Op.in]: ids }, transaction_type: 'manager_override' },
        ],
      },
      attributes: [
        'id', 'payment_id', 'transaction_type',
        'worker_staff_id', 'manager_staff_id',
        'commission_amount', 'service_amount',
      ],
      raw: true,
    });
  } catch (err) {
    console.warn('aggregateStaffCommissionFromDb txns skipped:', err.message);
    applyPaymentShares();
    return map;
  }

  const covered = new Set();
  for (const txn of txnRows) {
    const amt = parseFloat(txn.commission_amount) || 0;
    if (!(amt > 0)) continue;
    const type = txn.transaction_type;
    if (type === 'helper') {
      bump(txn.worker_staff_id, { helper: amt, count: 1 });
      covered.add(`${txn.worker_staff_id}:${txn.payment_id}:helper`);
    } else if (type === 'manager_override') {
      bump(txn.manager_staff_id, { main: amt, count: 1 });
      covered.add(`${txn.manager_staff_id}:${txn.payment_id}:mgr`);
    } else {
      bump(txn.worker_staff_id, {
        main: amt,
        revenue: parseFloat(txn.service_amount) || 0,
        count: 1,
      });
      covered.add(`${txn.worker_staff_id}:${txn.payment_id}:worker`);
    }
  }

  applyPaymentShares(covered);

  for (const p of payments) {
    const mid = Number(p.manager_staff_id);
    const mamt = parseFloat(p.manager_commission_amount) || 0;
    if (!staffIdSet.has(mid) || !(mamt > 0)) continue;
    if (covered.has(`${mid}:${p.id}:mgr`)) continue;
    bump(mid, { main: mamt, count: 1 });
  }

  return map;
}

async function sumCommissionFromDb(where = {}) {
  let txnSum = 0;
  const coveredPayIds = [];
  try {
    const rows = await CommissionTransaction.findAll({
      where,
      attributes: ['payment_id', 'commission_amount'],
      raw: true,
    });
    for (const r of rows) {
      txnSum += parseFloat(r.commission_amount) || 0;
      if (r.payment_id) coveredPayIds.push(Number(r.payment_id));
    }
  } catch (err) {
    console.warn('sumCommissionFromDb txns skipped:', err.message);
  }
  return { txnSum, coveredPayIds: [...new Set(coveredPayIds)] };
}

module.exports = { aggregateStaffCommissionFromDb, sumCommissionFromDb, emptyShare };
