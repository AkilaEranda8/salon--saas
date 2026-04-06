const Branch             = require('./Branch');
const User               = require('./User');
const Service            = require('./Service');
const Staff              = require('./Staff');
const StaffSpecialization = require('./StaffSpecialization');
const Customer           = require('./Customer');
const Appointment        = require('./Appointment');
const Payment            = require('./Payment');
const PaymentSplit       = require('./PaymentSplit');
const Inventory          = require('./Inventory');
const Attendance         = require('./Attendance');
const Reminder           = require('./Reminder');
const WalkIn             = require('./WalkIn');
const Expense            = require('./Expense');
const NotificationLog      = require('./NotificationLog');
const NotificationSettings = require('./NotificationSettings');
const Review               = require('./Review');
const Package              = require('./Package');
const CustomerPackage      = require('./CustomerPackage');
const PackageRedemption    = require('./PackageRedemption');

// ── Branch ────────────────────────────────────────────────────────────────────
Branch.hasMany(User,        { foreignKey: 'branch_id', as: 'users' });
Branch.hasMany(Staff,       { foreignKey: 'branch_id', as: 'staffMembers' });
Branch.hasMany(Customer,    { foreignKey: 'branch_id', as: 'customers' });
Branch.hasMany(Appointment, { foreignKey: 'branch_id', as: 'appointments' });
Branch.hasMany(Payment,     { foreignKey: 'branch_id', as: 'payments' });
Branch.hasMany(Inventory,   { foreignKey: 'branch_id', as: 'inventory' });
Branch.hasMany(Reminder,    { foreignKey: 'branch_id', as: 'reminders' });

// ── User ──────────────────────────────────────────────────────────────────────
User.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });

// ── Staff ─────────────────────────────────────────────────────────────────────
Staff.belongsTo(Branch,             { foreignKey: 'branch_id', as: 'branch' });
Staff.hasMany(StaffSpecialization,  { foreignKey: 'staff_id',  as: 'specializations' });
Staff.hasMany(Appointment,          { foreignKey: 'staff_id',  as: 'appointments' });
Staff.hasMany(Attendance,           { foreignKey: 'staff_id',  as: 'attendances' });
Staff.hasMany(Payment,              { foreignKey: 'staff_id',  as: 'payments' });

// ── Service ───────────────────────────────────────────────────────────────────
Service.hasMany(StaffSpecialization, { foreignKey: 'service_id', as: 'staffSpecializations' });
Service.hasMany(Appointment,         { foreignKey: 'service_id', as: 'appointments' });
Service.hasMany(Payment,             { foreignKey: 'service_id', as: 'payments' });

// ── StaffSpecialization ───────────────────────────────────────────────────────
StaffSpecialization.belongsTo(Staff,   { foreignKey: 'staff_id',   as: 'staff' });
StaffSpecialization.belongsTo(Service, { foreignKey: 'service_id', as: 'service' });

// ── Customer ──────────────────────────────────────────────────────────────────
Customer.belongsTo(Branch,      { foreignKey: 'branch_id',   as: 'branch' });
Customer.hasMany(Appointment,   { foreignKey: 'customer_id', as: 'appointments' });
Customer.hasMany(Payment,       { foreignKey: 'customer_id', as: 'payments' });

// ── Appointment ───────────────────────────────────────────────────────────────
Appointment.belongsTo(Branch,   { foreignKey: 'branch_id',   as: 'branch' });
Appointment.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
Appointment.belongsTo(Staff,    { foreignKey: 'staff_id',    as: 'staff' });
Appointment.belongsTo(Service,  { foreignKey: 'service_id',  as: 'service' });
Appointment.hasMany(Payment,    { foreignKey: 'appointment_id', as: 'payments' });
Appointment.belongsTo(Appointment, { foreignKey: 'recurrence_parent_id', as: 'recurrenceParent' });
Appointment.hasMany(Appointment,   { foreignKey: 'recurrence_parent_id', as: 'recurrenceChildren' });
Appointment.belongsTo(Appointment, { foreignKey: 'next_appointment_id',  as: 'nextAppointment' });

// ── Payment ───────────────────────────────────────────────────────────────────
Payment.belongsTo(Branch,      { foreignKey: 'branch_id',      as: 'branch' });
Payment.belongsTo(Staff,       { foreignKey: 'staff_id',       as: 'staff' });
Payment.belongsTo(Customer,    { foreignKey: 'customer_id',    as: 'customer' });
Payment.belongsTo(Service,     { foreignKey: 'service_id',     as: 'service' });
Payment.belongsTo(Appointment, { foreignKey: 'appointment_id', as: 'appointment' });
Payment.hasMany(PaymentSplit,  { foreignKey: 'payment_id',     as: 'splits' });

// ── PaymentSplit ──────────────────────────────────────────────────────────────
PaymentSplit.belongsTo(Payment, { foreignKey: 'payment_id', as: 'payment' });

// ── Inventory ─────────────────────────────────────────────────────────────────
Inventory.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });

// ── Attendance ────────────────────────────────────────────────────────────────
Attendance.belongsTo(Staff, { foreignKey: 'staff_id', as: 'staff' });

// ── Reminder ──────────────────────────────────────────────────────────────────
Reminder.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
// ── Expense ───────────────────────────────────────────────────────────────
Expense.belongsTo(Branch, { foreignKey: 'branch_id',  as: 'branch' });
Expense.belongsTo(User,   { foreignKey: 'created_by', as: 'creator' });
Branch.hasMany(Expense,   { foreignKey: 'branch_id',  as: 'expenses' });
User.hasMany(Expense,     { foreignKey: 'created_by', as: 'expenses' });

// ── WalkIn ────────────────────────────────────────────────────────────────
WalkIn.belongsTo(Branch,  { foreignKey: 'branch_id',  as: 'branch' });
WalkIn.belongsTo(Service, { foreignKey: 'service_id', as: 'service' });
WalkIn.belongsTo(Staff,   { foreignKey: 'staff_id',   as: 'staff' });
Branch.hasMany(WalkIn,    { foreignKey: 'branch_id',  as: 'walkIns' });
Service.hasMany(WalkIn,   { foreignKey: 'service_id', as: 'walkIns' });
Staff.hasMany(WalkIn,     { foreignKey: 'staff_id',   as: 'walkIns' });
// ── NotificationLog ───────────────────────────────────────────────────────
NotificationLog.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Branch.hasMany(NotificationLog,   { foreignKey: 'branch_id', as: 'notificationLogs' });

// ── Review ────────────────────────────────────────────────────────────────
Review.belongsTo(Branch,  { foreignKey: 'branch_id',  as: 'branch' });
Review.belongsTo(Payment, { foreignKey: 'payment_id', as: 'payment' });
Review.belongsTo(Service, { foreignKey: 'service_id', as: 'service' });
Review.belongsTo(Staff,   { foreignKey: 'staff_id',   as: 'staff' });
Branch.hasMany(Review,    { foreignKey: 'branch_id',  as: 'reviews' });
Payment.hasOne(Review,    { foreignKey: 'payment_id', as: 'review' });
// ── Package ───────────────────────────────────────────────────────────────
Package.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Branch.hasMany(Package,   { foreignKey: 'branch_id', as: 'packages' });
// ── CustomerPackage ───────────────────────────────────────────────────────
CustomerPackage.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
CustomerPackage.belongsTo(Package,  { foreignKey: 'package_id',  as: 'package' });
CustomerPackage.belongsTo(Branch,   { foreignKey: 'branch_id',   as: 'branch' });
CustomerPackage.hasMany(PackageRedemption, { foreignKey: 'customer_package_id', as: 'redemptions' });
Customer.hasMany(CustomerPackage,   { foreignKey: 'customer_id', as: 'customerPackages' });
Package.hasMany(CustomerPackage,    { foreignKey: 'package_id',  as: 'customerPackages' });
// ── PackageRedemption ─────────────────────────────────────────────────────
PackageRedemption.belongsTo(CustomerPackage, { foreignKey: 'customer_package_id', as: 'customerPackage' });
PackageRedemption.belongsTo(Appointment,     { foreignKey: 'appointment_id',      as: 'appointment' });
PackageRedemption.belongsTo(Payment,         { foreignKey: 'payment_id',          as: 'payment' });
PackageRedemption.belongsTo(Service,         { foreignKey: 'service_id',          as: 'service' });
PackageRedemption.belongsTo(Staff,           { foreignKey: 'redeemed_by',         as: 'staff' });
module.exports = {
  Branch,
  User,
  Service,
  Staff,
  StaffSpecialization,
  Customer,
  Appointment,
  Payment,
  PaymentSplit,
  Inventory,
  Attendance,
  Reminder,
  WalkIn,
  Expense,
  NotificationLog,
  NotificationSettings,
  Review,
  Package,
  CustomerPackage,
  PackageRedemption,
};
