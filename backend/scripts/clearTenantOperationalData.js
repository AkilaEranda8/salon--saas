/**
 * Clear operational data for one tenant; KEEP customers, services, staff (+ specs, branches, users).
 *
 * Usage:
 *   node scripts/clearTenantOperationalData.js --tenant-id=28 --dry-run
 *   node scripts/clearTenantOperationalData.js --tenant-id=28 --confirm
 */
const { sequelize } = require('../config/database');
const {
  Tenant,
  Staff,
  Customer,
  Service,
  Appointment,
  AppointmentService,
  Payment,
  PaymentSplit,
  Attendance,
  WalkIn,
  WalkInQueueService,
  StaffAdvance,
  CommissionPayout,
  CommissionTransaction,
  Expense,
  Reminder,
  NotificationLog,
  PackageRedemption,
  CustomerPackage,
  LoyaltyTransaction,
  Waitlist,
  CustomerMembership,
  CustomerConsent,
  StaffOffDay,
  StaffFcmToken,
  Inventory,
  InvStockMovement,
  InvConsumption,
  InvGoodsReceipt,
  InvGoodsReceiptItem,
  InvStockAdjustment,
  InvDayEndBatch,
  InvDayEndBatchItem,
  InvPurchaseOrder,
  InvPurchaseOrderItem,
  InvStockCount,
  InvStockCountItem,
  WhatsAppMessage,
} = require('../models');

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function safeDestroy(label, fn) {
  try {
    const n = await fn();
    console.log(`  deleted ${label}:`, n);
    return n;
  } catch (err) {
    console.warn(`  skip ${label}:`, err.message);
    return 0;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const confirm = process.argv.includes('--confirm');
  const tenantId = Number(arg('tenant-id'));
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    console.error('Required: --tenant-id=N');
    process.exit(1);
  }

  const tenant = await Tenant.findByPk(tenantId, { attributes: ['id', 'name', 'slug'], raw: true });
  if (!tenant) {
    console.error('Tenant not found:', tenantId);
    process.exit(1);
  }
  console.log('Target:', tenant);

  const before = {
    customers: await Customer.count({ where: { tenant_id: tenantId } }),
    services: await Service.count({ where: { tenant_id: tenantId } }),
    staff: await Staff.count({ where: { tenant_id: tenantId } }),
    appointments: await Appointment.count({ where: { tenant_id: tenantId } }),
    payments: await Payment.count({ where: { tenant_id: tenantId } }),
    attendance: await Attendance.count({ where: { tenant_id: tenantId } }),
    walkins: await WalkIn.count({ where: { tenant_id: tenantId } }),
    advances: await StaffAdvance.count({ where: { tenant_id: tenantId } }),
    payouts: await CommissionPayout.count({ where: { tenant_id: tenantId } }),
    expenses: await Expense.count({ where: { tenant_id: tenantId } }),
  };
  console.log('Before:', before);

  if (dryRun || !confirm) {
    console.log(dryRun ? 'Dry run only — no deletes.' : 'Pass --confirm to delete.');
    process.exit(0);
  }

  const t = await sequelize.transaction();
  try {
    const paymentIds = (await Payment.findAll({
      where: { tenant_id: tenantId },
      attributes: ['id'],
      raw: true,
      transaction: t,
    })).map((p) => p.id);

    const apptIds = (await Appointment.findAll({
      where: { tenant_id: tenantId },
      attributes: ['id'],
      raw: true,
      transaction: t,
    })).map((a) => a.id);

    const walkInIds = (await WalkIn.findAll({
      where: { tenant_id: tenantId },
      attributes: ['id'],
      raw: true,
      transaction: t,
    })).map((w) => w.id);

    if (paymentIds.length) {
      await safeDestroy('payment_splits', () =>
        PaymentSplit.destroy({ where: { payment_id: paymentIds }, transaction: t }));
      await safeDestroy('commission_transactions(by payment)', () =>
        CommissionTransaction.destroy({ where: { payment_id: paymentIds }, transaction: t }));
      await safeDestroy('package_redemptions(by payment)', () =>
        PackageRedemption.destroy({ where: { payment_id: paymentIds }, transaction: t }));
    }

    if (apptIds.length) {
      await safeDestroy('appointment_services', () =>
        AppointmentService.destroy({ where: { appointment_id: apptIds }, transaction: t }));
    }

    if (walkInIds.length) {
      await safeDestroy('walk_in_queue_services', () =>
        WalkInQueueService.destroy({ where: { walk_in_id: walkInIds }, transaction: t }));
    }

    // Inventory child rows (tenant-scoped parents)
    await safeDestroy('inv_day_end_batch_items', async () => {
      const batches = await InvDayEndBatch.findAll({
        where: { tenant_id: tenantId }, attributes: ['id'], raw: true, transaction: t,
      });
      const ids = batches.map((b) => b.id);
      if (!ids.length) return 0;
      return InvDayEndBatchItem.destroy({ where: { batch_id: ids }, transaction: t });
    });
    await safeDestroy('inv_goods_receipt_items', async () => {
      const rows = await InvGoodsReceipt.findAll({
        where: { tenant_id: tenantId }, attributes: ['id'], raw: true, transaction: t,
      });
      const ids = rows.map((b) => b.id);
      if (!ids.length) return 0;
      return InvGoodsReceiptItem.destroy({ where: { goods_receipt_id: ids }, transaction: t });
    });
    await safeDestroy('inv_po_items', async () => {
      const rows = await InvPurchaseOrder.findAll({
        where: { tenant_id: tenantId }, attributes: ['id'], raw: true, transaction: t,
      });
      const ids = rows.map((b) => b.id);
      if (!ids.length) return 0;
      return InvPurchaseOrderItem.destroy({ where: { purchase_order_id: ids }, transaction: t });
    });
    await safeDestroy('inv_stock_count_items', async () => {
      const rows = await InvStockCount.findAll({
        where: { tenant_id: tenantId }, attributes: ['id'], raw: true, transaction: t,
      });
      const ids = rows.map((b) => b.id);
      if (!ids.length) return 0;
      return InvStockCountItem.destroy({ where: { stock_count_id: ids }, transaction: t });
    });

    const byTenant = [
      ['payments', () => Payment.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['appointments', () => Appointment.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['attendance', () => Attendance.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['walk_ins', () => WalkIn.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['staff_advances', () => StaffAdvance.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['commission_payouts', () => CommissionPayout.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['commission_transactions', () => CommissionTransaction.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['expenses', () => Expense.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['reminders', () => Reminder.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['notification_logs', () => NotificationLog.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['loyalty_transactions', () => LoyaltyTransaction.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['customer_packages', () => CustomerPackage.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['package_redemptions', () => PackageRedemption.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['waitlist', () => Waitlist.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['customer_memberships', () => CustomerMembership.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['customer_consents', () => CustomerConsent.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['staff_off_days', () => StaffOffDay.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['staff_fcm_tokens', () => StaffFcmToken.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['inventory', () => Inventory.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['inv_stock_movements', () => InvStockMovement.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['inv_consumptions', () => InvConsumption.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['inv_goods_receipts', () => InvGoodsReceipt.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['inv_stock_adjustments', () => InvStockAdjustment.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['inv_day_end_batches', () => InvDayEndBatch.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['inv_purchase_orders', () => InvPurchaseOrder.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['inv_stock_counts', () => InvStockCount.destroy({ where: { tenant_id: tenantId }, transaction: t })],
      ['whatsapp_messages', () => WhatsAppMessage.destroy({ where: { tenant_id: tenantId }, transaction: t })],
    ];

    for (const [label, fn] of byTenant) {
      await safeDestroy(label, fn);
    }

    // Reset loyalty points on kept customers (optional clean slate for points history)
    await sequelize.query(
      `UPDATE customers SET loyalty_points = 0 WHERE tenant_id = :tid`,
      { replacements: { tid: tenantId }, transaction: t },
    );

    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

  const after = {
    customers: await Customer.count({ where: { tenant_id: tenantId } }),
    services: await Service.count({ where: { tenant_id: tenantId } }),
    staff: await Staff.count({ where: { tenant_id: tenantId } }),
    appointments: await Appointment.count({ where: { tenant_id: tenantId } }),
    payments: await Payment.count({ where: { tenant_id: tenantId } }),
    attendance: await Attendance.count({ where: { tenant_id: tenantId } }),
    walkins: await WalkIn.count({ where: { tenant_id: tenantId } }),
  };
  console.log('After:', after);
  console.log('Kept: customers, services, staff, branches, users, packages catalog, discounts, settings');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
