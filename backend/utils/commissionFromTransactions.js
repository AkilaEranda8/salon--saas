const { Op } = require('sequelize');
const { CommissionTransaction } = require('../models');
const { staffCommissionShares, paymentTotalCommission } = require('./paymentCommissionTotals');

const PAYMENT_COMMISSION_ATTRS = [
  'id', 'branch_id', 'staff_id', 'total_amount', 'commission_amount',
  'commission_breakdown', 'helper_commission',
  'manager_staff_id', 'manager_commission_amount',
];

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

function staffIdsFromPayments(payments = []) {
  const ids = new Set();
  for (const p of payments) {
    const json = p?.toJSON ? p.toJSON() : p;
    for (const share of staffCommissionShares(json)) {
      if (share.staff_id > 0) ids.add(Number(share.staff_id));
    }
    const mid = Number(json.manager_staff_id);
    if (Number.isInteger(mid) && mid > 0) ids.add(mid);
  }
  return ids;
}

async function staffIdsFromPaymentTxns(paymentIds = []) {
  const ids = new Set();
  const payIds = paymentIds.map(Number).filter((id) => id > 0);
  if (!payIds.length) return ids;
  try {
    const rows = await CommissionTransaction.findAll({
      where: { payment_id: { [Op.in]: payIds } },
      attributes: ['worker_staff_id', 'manager_staff_id'],
      raw: true,
    });
    for (const r of rows) {
      const wid = Number(r.worker_staff_id);
      const mid = Number(r.manager_staff_id);
      if (Number.isInteger(wid) && wid > 0) ids.add(wid);
      if (Number.isInteger(mid) && mid > 0) ids.add(mid);
    }
  } catch (err) {
    console.warn('staffIdsFromPaymentTxns skipped:', err.message);
  }
  return ids;
}

/**
 * Salon commission for a set of payments: same formula as per-staff rollup
 * (txn-first, then share / manager gap-fill). Keyed by payment id, not txn.date.
 */
async function sumCommissionForPayments(payments = []) {
  const list = Array.isArray(payments) ? payments : [];
  if (!list.length) return 0;
  const payIds = list.map((p) => Number(p.id)).filter((id) => id > 0);
  const staffIds = [
    ...new Set([
      ...staffIdsFromPayments(list),
      ...(await staffIdsFromPaymentTxns(payIds)),
    ]),
  ];
  if (!staffIds.length) {
    return Math.round(list.reduce((sum, p) => {
      const json = p?.toJSON ? p.toJSON() : p;
      return sum + paymentTotalCommission(json) + (parseFloat(json.manager_commission_amount) || 0);
    }, 0) * 100) / 100;
  }
  const map = await aggregateStaffCommissionFromDb({
    where: { payment_id: { [Op.in]: payIds } },
    staffIds,
    payments: list,
  });
  let total = 0;
  for (const row of Object.values(map)) {
    total += (row.mainCommission || 0) + (row.helperCommission || 0);
  }
  return Math.round(total * 100) / 100;
}

async function collectPeriodStaffIds(payments = []) {
  const payIds = (payments || []).map((p) => Number(p.id)).filter((id) => id > 0);
  return [...new Set([
    ...staffIdsFromPayments(payments),
    ...(await staffIdsFromPaymentTxns(payIds)),
  ])];
}

async function loadPaymentsForCommission(where = {}) {
  const { Payment } = require('../models');
  return Payment.findAll({
    where,
    attributes: PAYMENT_COMMISSION_ATTRS,
    raw: true,
  });
}

async function sumPeriodCommission(where = {}) {
  const payments = await loadPaymentsForCommission(where);
  return sumCommissionForPayments(payments);
}

module.exports = {
  aggregateStaffCommissionFromDb,
  sumCommissionFromDb,
  sumCommissionForPayments,
  sumPeriodCommission,
  loadPaymentsForCommission,
  staffIdsFromPayments,
  collectPeriodStaffIds,
  PAYMENT_COMMISSION_ATTRS,
  emptyShare,
};
