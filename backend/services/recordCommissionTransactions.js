const { CommissionTransaction } = require('../models');

/**
 * Persist audit rows when a payment is completed (worker + manager override).
 */
async function recordCommissionTransactions({
  paymentId,
  tenantId,
  branchId,
  date,
  serviceAmount,
  workerStaffId,
  workerAmount,
  workerBreakdown,
  managerStaffId,
  managerAmount,
  managerPercent,
  managerBreakdown,
  helpers = [],
  workers = [],
}, { transaction } = {}) {
  const rows = [];
  const amt = parseFloat(serviceAmount) || 0;

  const workerRows = Array.isArray(workers) && workers.length
    ? workers
    : (workerStaffId && parseFloat(workerAmount) > 0
      ? [{
        staffId: workerStaffId,
        amount: workerAmount,
        breakdown: workerBreakdown,
        serviceAmount: amt,
      }]
      : []);

  for (const w of workerRows) {
    const wid = Number(w.staffId ?? w.staff_id);
    const wAmt = parseFloat(w.amount ?? w.commission_amount);
    if (!wid || !(wAmt > 0)) continue;
    rows.push({
      tenant_id: tenantId,
      payment_id: paymentId,
      branch_id: branchId || null,
      transaction_type: 'worker',
      worker_staff_id: wid,
      manager_staff_id: null,
      service_amount: parseFloat(w.serviceAmount ?? w.service_amount ?? amt) || amt,
      commission_percent: null,
      commission_amount: wAmt,
      breakdown: w.breakdown || w.workerBreakdown || null,
      date,
    });
  }

  const primaryWorkerId = workerRows[0]?.staffId ?? workerRows[0]?.staff_id ?? workerStaffId ?? null;

  for (const h of (helpers || [])) {
    const helperId = Number(h.staff_id);
    const helperAmt = parseFloat(h.commission_amount);
    if (!helperId || !(helperAmt > 0)) continue;
    rows.push({
      tenant_id: tenantId,
      payment_id: paymentId,
      branch_id: branchId || null,
      transaction_type: 'helper',
      worker_staff_id: helperId,
      manager_staff_id: null,
      service_amount: amt,
      commission_percent: h.commission_type === 'percentage_of_main'
        ? parseFloat(h.commission_value)
        : null,
      commission_amount: helperAmt,
      breakdown: {
        role: 'helper',
        mainStaffId: primaryWorkerId || null,
        commission_type: h.commission_type,
        commission_value: h.commission_value,
        rateLabel: h.rateLabel,
      },
      date,
    });
  }

  if (managerStaffId && parseFloat(managerAmount) > 0) {
    rows.push({
      tenant_id: tenantId,
      payment_id: paymentId,
      branch_id: branchId || null,
      transaction_type: 'manager_override',
      worker_staff_id: workerStaffId || null,
      manager_staff_id: managerStaffId,
      service_amount: amt,
      commission_percent: managerPercent != null ? parseFloat(managerPercent) : null,
      commission_amount: parseFloat(managerAmount),
      breakdown: managerBreakdown || null,
      date,
    });
  }

  if (!rows.length) return [];
  return CommissionTransaction.bulkCreate(rows, { transaction });
}

module.exports = { recordCommissionTransactions };
