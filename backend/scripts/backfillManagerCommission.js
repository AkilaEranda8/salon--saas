/**
 * Re-assign manager oversight commission to Branch Manager / Salon Manager staff.
 * Run once: node scripts/backfillManagerCommission.js
 */
require('dotenv').config();
const { sequelize } = require('../config/database');
const { Payment, Staff, Branch, StaffSpecialization } = require('../models');
const { computeCommissionDetails } = require('../utils/commissionCalculator');
const {
  resolveBranchManagerStaff,
  resolveManagerOverridePercent,
  managerEligibleForOversight,
  shouldApplyManagerOverride,
} = require('../utils/branchManagerCommission');
const { staffBelongsToBranch } = require('../utils/staffBranchFilter');
const { recordCommissionTransactions } = require('../services/recordCommissionTransactions');
const { CommissionTransaction } = require('../models');

async function main() {
  const payments = await Payment.findAll({
    where: { staff_id: { [require('sequelize').Op.ne]: null } },
    order: [['id', 'ASC']],
  });

  let updated = 0;
  for (const payment of payments) {
    if (!payment.branch_id || !payment.staff_id) continue;

    const tenant = { enabled_features: null };
    const branch = await Branch.findByPk(payment.branch_id);
    const fakeReq = { tenant, tenantId: payment.tenant_id };

    const workerInBranch = await staffBelongsToBranch(payment.staff_id, payment.branch_id);
    if (!workerInBranch) continue;

    const managerStaff = await resolveBranchManagerStaff(fakeReq, payment.branch_id);
    const overridePct = resolveManagerOverridePercent(branch, tenant, managerStaff);

    if (!shouldApplyManagerOverride(tenant)
      || !managerStaff
      || !managerEligibleForOversight(managerStaff, overridePct)
      || Number(managerStaff.id) === Number(payment.staff_id)) {
      if (payment.manager_staff_id || parseFloat(payment.manager_commission_amount) > 0) {
        await payment.update({
          manager_staff_id: null,
          manager_commission_amount: 0,
          manager_commission_breakdown: null,
        });
        await CommissionTransaction.destroy({
          where: { payment_id: payment.id, transaction_type: 'manager_override' },
        });
        updated += 1;
      }
      continue;
    }

    const computed = computeCommissionDetails({
      staff: {
        salary_type: 'commission_only',
        commission_type: 'percentage',
        commission_value: overridePct,
      },
      specializations: [],
      allowServiceOverrides: false,
      serviceIds: payment.service_id ? [payment.service_id] : [],
      servicePrices: {},
      serviceCommissions: {},
      serviceNames: {},
      total_amount: payment.total_amount,
      subtotal: payment.total_amount,
      loyalty_discount: payment.loyalty_discount,
      promo_discount: payment.promo_discount,
    });

    const mgrAmt = computed.amount;
    const mgrBreakdown = {
      ...computed.breakdown,
      overridePercent: overridePct,
      note: `Manager override ${overridePct}% of service amount`,
    };

    const same = Number(payment.manager_staff_id) === Number(managerStaff.id)
      && Math.abs(parseFloat(payment.manager_commission_amount) - mgrAmt) < 0.01;
    if (same) continue;

    await payment.update({
      manager_staff_id: managerStaff.id,
      manager_commission_amount: mgrAmt,
      manager_commission_breakdown: mgrBreakdown,
    });

    await CommissionTransaction.destroy({
      where: { payment_id: payment.id, transaction_type: 'manager_override' },
    });
    await recordCommissionTransactions({
      paymentId: payment.id,
      tenantId: payment.tenant_id,
      branchId: payment.branch_id,
      date: payment.date,
      serviceAmount: payment.total_amount,
      workerStaffId: payment.staff_id,
      workerAmount: 0,
      workerBreakdown: null,
      managerStaffId: managerStaff.id,
      managerAmount: mgrAmt,
      managerPercent: overridePct,
      managerBreakdown: mgrBreakdown,
    });

    updated += 1;
    console.log(`Payment #${payment.id}: manager -> ${managerStaff.name} (${overridePct}%) = Rs.${mgrAmt}`);
  }

  console.log(`Done. Updated ${updated} payment(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
