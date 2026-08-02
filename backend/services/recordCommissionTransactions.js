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
}, { transaction } = {}) {
  const rows = [];
  const amt = parseFloat(serviceAmount) || 0;

  if (workerStaffId && parseFloat(workerAmount) > 0) {
    rows.push({
      tenant_id: tenantId,
      payment_id: paymentId,
      branch_id: branchId || null,
      transaction_type: 'worker',
      worker_staff_id: workerStaffId,
      manager_staff_id: null,
      service_amount: amt,
      commission_percent: null,
      commission_amount: parseFloat(workerAmount),
      breakdown: workerBreakdown || null,
      date,
    });
  }

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
        mainStaffId: workerStaffId || null,
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
