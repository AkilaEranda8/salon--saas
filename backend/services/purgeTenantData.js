const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const {
  Payment,
  PaymentSplit,
  PackageRedemption,
  LoyaltyTransaction,
  Appointment,
  AppointmentService,
  WalkIn,
  WalkInQueueService,
  Waitlist,
  CommissionPayout,
  CommissionTransaction,
  StaffAdvance,
  Attendance,
  CustomerPackage,
  CustomerMembership,
  CustomerConsent,
  Reminder,
  StaffSpecialization,
  StaffBranch,
  StaffFcmToken,
  Staff,
  Customer,
  Service,
  Expense,
  InventoryReorder,
  Inventory,
  Discount,
  Package,
  MembershipPlan,
  ConsentForm,
  MessageTemplate,
  SupportTicketReply,
  SupportTicket,
  NotificationLog,
  BankSlip,
  LoyaltyRule,
} = require('../models');

/**
 * Remove operational salon data for a tenant while keeping the account shell:
 * tenant record, users, branches, subscriptions, notification settings, platform invoices.
 */
async function purgeTenantOperationalData(tenantId, { transaction } = {}) {
  const tid = Number(tenantId);
  if (!tid) throw new Error('Invalid tenant id.');

  const t = transaction || await sequelize.transaction();
  const ownTx = !transaction;
  const where = { tenant_id: tid };
  const counts = {};

  const destroy = async (Model, label, extraWhere = where) => {
    if (!Model || typeof Model.destroy !== 'function') return 0;
    const n = await Model.destroy({ where: extraWhere, transaction: t });
    counts[label] = n;
    return n;
  };

  try {
    const appointmentIds = (
      await Appointment.findAll({ where, attributes: ['id'], transaction: t, raw: true })
    ).map((r) => r.id);

    const paymentIds = (
      await Payment.findAll({ where, attributes: ['id'], transaction: t, raw: true })
    ).map((r) => r.id);

    const staffIds = (
      await Staff.findAll({ where, attributes: ['id'], transaction: t, raw: true })
    ).map((r) => r.id);

    const serviceIds = (
      await Service.findAll({ where, attributes: ['id'], transaction: t, raw: true })
    ).map((r) => r.id);

    const walkInIds = (
      await WalkIn.findAll({ where, attributes: ['id'], transaction: t, raw: true })
    ).map((r) => r.id);

    // Break appointment self-references before delete
    await Appointment.update(
      { recurrence_parent_id: null, next_appointment_id: null },
      { where, transaction: t },
    );

    if (paymentIds.length) {
      await destroy(PaymentSplit, 'paymentSplits', { payment_id: paymentIds });
    }
    if (appointmentIds.length) {
      await destroy(AppointmentService, 'appointmentServices', { appointment_id: appointmentIds });
    }
    if (walkInIds.length) {
      await destroy(WalkInQueueService, 'walkInQueueServices', { walk_in_id: walkInIds });
    }
    if (staffIds.length) {
      await destroy(StaffSpecialization, 'staffSpecializations', { staff_id: staffIds });
      await destroy(StaffBranch, 'staffBranches', { staff_id: staffIds });
    }
    await destroy(StaffFcmToken, 'staffFcmTokens');
    if (serviceIds.length) {
      await destroy(StaffSpecialization, 'staffSpecializationsByService', { service_id: serviceIds });
    }

    await destroy(SupportTicketReply, 'supportTicketReplies');

    await destroy(PackageRedemption, 'packageRedemptions');
    await destroy(LoyaltyTransaction, 'loyaltyTransactions');
    await destroy(CommissionTransaction, 'commissionTransactions');
    await destroy(Payment, 'payments');
    await destroy(CommissionPayout, 'commissionPayouts');
    await destroy(StaffAdvance, 'staffAdvances');
    await destroy(Attendance, 'attendances');
    await destroy(WalkIn, 'walkIns');
    await destroy(Waitlist, 'waitlist');
    await destroy(CustomerPackage, 'customerPackages');
    await destroy(CustomerMembership, 'customerMemberships');
    await destroy(CustomerConsent, 'customerConsents');
    await destroy(Appointment, 'appointments');
    await destroy(Reminder, 'reminders');
    await destroy(Staff, 'staff');
    await destroy(Customer, 'customers');
    await destroy(Service, 'services');
    await destroy(Expense, 'expenses');
    await destroy(InventoryReorder, 'inventoryReorders');
    await destroy(Inventory, 'inventory');
    await destroy(Discount, 'discounts');
    await destroy(Package, 'packages');
    await destroy(MembershipPlan, 'membershipPlans');
    await destroy(ConsentForm, 'consentForms');
    await destroy(MessageTemplate, 'messageTemplates');
    await destroy(SupportTicket, 'supportTickets');
    await destroy(NotificationLog, 'notificationLogs');
    await destroy(BankSlip, 'bankSlips');
    await destroy(LoyaltyRule, 'loyaltyRules');

    if (ownTx) await t.commit();
    return { tenantId: tid, counts };
  } catch (err) {
    if (ownTx) await t.rollback();
    throw err;
  }
}

module.exports = { purgeTenantOperationalData };
