const Tenant = require('./Tenant');
const Subscription = require('./Subscription');
const Branch = require('./Branch');
const User = require('./User');
const Service = require('./Service');
const Staff = require('./Staff');
const StaffSpecialization = require('./StaffSpecialization');
const StaffOffDay = require('./StaffOffDay');
const Customer = require('./Customer');
const Appointment = require('./Appointment');
const AppointmentService = require('./AppointmentService');
const Payment = require('./Payment');
const PaymentSplit = require('./PaymentSplit');
const Inventory = require('./Inventory');
const Attendance = require('./Attendance');
const Reminder = require('./Reminder');
const WalkIn = require('./WalkIn');
const WalkInQueueService = require('./WalkInQueueService');
const Expense = require('./Expense');
const NotificationLog = require('./NotificationLog');
const NotificationSettings = require('./NotificationSettings');
const Package = require('./Package');
const CustomerPackage = require('./CustomerPackage');
const PackageRedemption = require('./PackageRedemption');
const StaffFcmToken = require('./StaffFcmToken');
const StaffBranch = require('./StaffBranch');
const Discount = require('./Discount');
const MaintenanceLog = require('./MaintenanceLog');
const SupportTicket = require('./SupportTicket');
const SupportTicketReply = require('./SupportTicketReply');
const MessageTemplate = require('./MessageTemplate');
const PlatformInvoice = require('./PlatformInvoice');
const BankSlip = require('./BankSlip');
const PlanConfig = require('./PlanConfig');
const PlanChangeLog = require('./PlanChangeLog');
// New models
const Waitlist = require('./Waitlist');
const LoyaltyRule = require('./LoyaltyRule');
const LoyaltyTransaction = require('./LoyaltyTransaction');
const MembershipPlan = require('./MembershipPlan');
const CustomerMembership = require('./CustomerMembership');
const ConsentForm = require('./ConsentForm');
const CustomerConsent = require('./CustomerConsent');
const InventoryReorder = require('./InventoryReorder');
const RevokedToken     = require('./RevokedToken');
const StaffAdvance      = require('./StaffAdvance');
const CommissionPayout  = require('./CommissionPayout');
const CommissionTransaction = require('./CommissionTransaction');
const WhatsAppMessage = require('./WhatsAppMessage');
const WhatsAppConnection = require('./WhatsAppConnection');
const TenantAiSettings = require('./TenantAiSettings');
const AiUsage = require('./AiUsage');
const AiModelRate = require('./AiModelRate');
const AiCreditEntry = require('./AiCreditEntry');
const CrmAiRule = require('./CrmAiRule');
const CrmLead = require('./CrmLead');
const CrmConversation = require('./CrmConversation');
const CrmMessage = require('./CrmMessage');
const CrmBookingRequest = require('./CrmBookingRequest');
const CrmAiMemory = require('./CrmAiMemory');
const CrmAuditLog = require('./CrmAuditLog');
const WhatsAppBusinessAccount = require('./WhatsAppBusinessAccount');
const CrmKnowledgeArticle = require('./CrmKnowledgeArticle');
const CrmFollowUpJob = require('./CrmFollowUpJob');
const CrmAutomation = require('./CrmAutomation');
const CrmAutomationExecution = require('./CrmAutomationExecution');
const MobileOffer = require('./MobileOffer');

// Accounting
const AcctAccount = require('./AcctAccount');
const AcctPeriod = require('./AcctPeriod');
const AcctJournal = require('./AcctJournal');
const AcctJournalLine = require('./AcctJournalLine');
const AcctTaxSetting = require('./AcctTaxSetting');
const AcctBankAccount = require('./AcctBankAccount');
const AcctBankTxn = require('./AcctBankTxn');
const AcctPettyCashTxn = require('./AcctPettyCashTxn');
const AcctArInvoice = require('./AcctArInvoice');
const AcctApBill = require('./AcctApBill');
const AcctAuditLog = require('./AcctAuditLog');

// Salon Inventory (v2)
const InvCategory = require('./InvCategory');
const InvSupplier = require('./InvSupplier');
const InvProduct = require('./InvProduct');
const InvStockMovement = require('./InvStockMovement');
const InvPurchaseOrder = require('./InvPurchaseOrder');
const InvPurchaseOrderItem = require('./InvPurchaseOrderItem');
const InvGoodsReceipt = require('./InvGoodsReceipt');
const InvGoodsReceiptItem = require('./InvGoodsReceiptItem');
const InvConsumption = require('./InvConsumption');
const InvDayEndBatch = require('./InvDayEndBatch');
const InvDayEndBatchItem = require('./InvDayEndBatchItem');
const InvStockAdjustment = require('./InvStockAdjustment');
const InvStockCount = require('./InvStockCount');
const InvStockCountItem = require('./InvStockCountItem');
const InvSettings = require('./InvSettings');
const PlatformAnnouncement = require('./PlatformAnnouncement');
const { PlatformRelease, PlatformReleaseItem } = require('./PlatformRelease');
const { FeatureSuggestion, FeatureSuggestionHistory } = require('./FeatureSuggestion');
const { MasterCatalogCategory, MasterCatalogItem } = require('./MasterCatalog');

// Tenant
Tenant.hasMany(Subscription, { foreignKey: 'tenant_id', as: 'subscriptions' });
Subscription.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(PlatformInvoice, { foreignKey: 'tenant_id', as: 'invoices' });
PlatformInvoice.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(BankSlip, { foreignKey: 'tenant_id', as: 'bankSlips' });
BankSlip.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(Branch, { foreignKey: 'tenant_id', as: 'branches' });
Tenant.hasOne(TenantAiSettings, { foreignKey: 'tenant_id', as: 'aiSettings' });
TenantAiSettings.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(CrmAiRule, { foreignKey: 'tenant_id', as: 'aiRules' });
CrmAiRule.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasOne(WhatsAppBusinessAccount, { foreignKey: 'tenant_id', as: 'whatsappBusinessAccount' });
WhatsAppBusinessAccount.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(CrmKnowledgeArticle, { foreignKey: 'tenant_id', as: 'knowledgeArticles' });
CrmKnowledgeArticle.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(CrmFollowUpJob, { foreignKey: 'tenant_id', as: 'crmFollowUpJobs' });
CrmFollowUpJob.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(CrmAutomation, { foreignKey: 'tenant_id', as: 'crmAutomations' });
CrmAutomation.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
CrmAutomation.hasMany(CrmAutomationExecution, { foreignKey: 'automation_id', as: 'executions' });
CrmAutomationExecution.belongsTo(CrmAutomation, { foreignKey: 'automation_id', as: 'automation' });
Tenant.hasMany(CrmAutomationExecution, { foreignKey: 'tenant_id', as: 'crmAutomationExecutions' });
CrmAutomationExecution.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(AiUsage, { foreignKey: 'tenant_id', as: 'aiUsage' });
AiUsage.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(AiCreditEntry, { foreignKey: 'tenant_id', as: 'aiCreditEntries' });
AiCreditEntry.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(MobileOffer, { foreignKey: 'tenant_id', as: 'mobileOffers' });
MobileOffer.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(CrmLead, { foreignKey: 'tenant_id', as: 'crmLeads' });
CrmLead.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(CrmConversation, { foreignKey: 'tenant_id', as: 'crmConversations' });
CrmConversation.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
CrmLead.hasMany(CrmConversation, { foreignKey: 'lead_id', as: 'conversations' });
CrmConversation.belongsTo(CrmLead, { foreignKey: 'lead_id', as: 'lead' });
CrmLead.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer', constraints: false });
Customer.hasMany(CrmLead, { foreignKey: 'customer_id', as: 'crmLeads', constraints: false });
CrmConversation.hasMany(CrmMessage, { foreignKey: 'conversation_id', as: 'messages' });
CrmMessage.belongsTo(CrmConversation, { foreignKey: 'conversation_id', as: 'conversation' });
CrmLead.hasMany(CrmBookingRequest, { foreignKey: 'lead_id', as: 'bookingRequests' });
CrmConversation.hasMany(CrmBookingRequest, { foreignKey: 'conversation_id', as: 'bookingRequests' });
CrmConversation.hasMany(CrmAiMemory, { foreignKey: 'conversation_id', as: 'memories' });
Tenant.hasMany(CrmAuditLog, { foreignKey: 'tenant_id', as: 'crmAuditLogs' });
Tenant.hasMany(User, { foreignKey: 'tenant_id', as: 'users' });
Tenant.hasMany(Staff, { foreignKey: 'tenant_id', as: 'staffMembers' });
Tenant.hasMany(Customer, { foreignKey: 'tenant_id', as: 'customers' });
Tenant.hasMany(Service, { foreignKey: 'tenant_id', as: 'services' });
Tenant.hasOne(WhatsAppConnection, { foreignKey: 'tenant_id', as: 'whatsappConnection' });
WhatsAppConnection.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(WhatsAppMessage, { foreignKey: 'tenant_id', as: 'whatsappMessages' });
WhatsAppMessage.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Branch.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
User.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Staff.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

// Discount
Discount.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Branch.hasMany(Discount, { foreignKey: 'branch_id', as: 'discounts' });

// Branch
Branch.hasMany(User, { foreignKey: 'branch_id', as: 'users' });
Branch.hasMany(Staff, { foreignKey: 'branch_id', as: 'staffMembers' });
Branch.hasMany(Customer, { foreignKey: 'branch_id', as: 'customers' });
Branch.hasMany(Appointment, { foreignKey: 'branch_id', as: 'appointments' });
Branch.hasMany(Payment, { foreignKey: 'branch_id', as: 'payments' });
Branch.hasMany(CommissionTransaction, { foreignKey: 'branch_id', as: 'commissionTransactions' });
Branch.hasMany(Inventory, { foreignKey: 'branch_id', as: 'inventory' });
Branch.hasMany(Reminder, { foreignKey: 'branch_id', as: 'reminders' });

// User
User.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });

// Staff
Staff.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Staff.hasMany(StaffSpecialization, { foreignKey: 'staff_id', as: 'specializations' });
Staff.hasMany(StaffOffDay, { foreignKey: 'staff_id', as: 'offDays' });
Staff.hasMany(Appointment, { foreignKey: 'staff_id', as: 'appointments' });
Staff.hasMany(Attendance, { foreignKey: 'staff_id', as: 'attendances' });
Staff.hasMany(Payment, { foreignKey: 'staff_id', as: 'payments' });
Staff.belongsTo(User, { foreignKey: 'user_id', as: 'user', constraints: false });
User.hasOne(Staff, { foreignKey: 'user_id', as: 'staffProfile', constraints: false });
Staff.belongsToMany(Branch, { through: StaffBranch, foreignKey: 'staff_id', otherKey: 'branch_id', as: 'branches' });
Branch.belongsToMany(Staff, { through: StaffBranch, foreignKey: 'branch_id', otherKey: 'staff_id', as: 'staffMembers2' });

// Service
Service.hasMany(StaffSpecialization, { foreignKey: 'service_id', as: 'staffSpecializations' });
Service.hasMany(Appointment, { foreignKey: 'service_id', as: 'appointments' });
Service.hasMany(Payment, { foreignKey: 'service_id', as: 'payments' });

// StaffSpecialization
StaffSpecialization.belongsTo(Staff, { foreignKey: 'staff_id', as: 'staff' });
StaffSpecialization.belongsTo(Service, { foreignKey: 'service_id', as: 'service' });
StaffOffDay.belongsTo(Staff, { foreignKey: 'staff_id', as: 'staff' });

// Customer
Customer.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Customer.hasMany(Appointment, { foreignKey: 'customer_id', as: 'appointments' });
Customer.hasMany(Payment, { foreignKey: 'customer_id', as: 'payments' });

// Appointment
Appointment.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Appointment.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
Appointment.belongsTo(Staff, { foreignKey: 'staff_id', as: 'staff' });
Appointment.belongsTo(Service, { foreignKey: 'service_id', as: 'service' });
Appointment.hasMany(Payment, { foreignKey: 'appointment_id', as: 'payments' });
Appointment.belongsTo(Appointment, { foreignKey: 'recurrence_parent_id', as: 'recurrenceParent' });
Appointment.hasMany(Appointment, { foreignKey: 'recurrence_parent_id', as: 'recurrenceChildren' });
Appointment.belongsTo(Appointment, { foreignKey: 'next_appointment_id', as: 'nextAppointment' });

Appointment.hasMany(AppointmentService, { foreignKey: 'appointment_id', as: 'serviceLinks' });
Appointment.belongsToMany(Service, { through: AppointmentService, foreignKey: 'appointment_id', otherKey: 'service_id', as: 'services' });
Service.hasMany(AppointmentService, { foreignKey: 'service_id', as: 'appointmentLinks' });
Service.belongsToMany(Appointment, { through: AppointmentService, foreignKey: 'service_id', otherKey: 'appointment_id', as: 'serviceAppointments' });

// Payment
Payment.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Payment.belongsTo(Staff, { foreignKey: 'staff_id', as: 'staff' });
Payment.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
Payment.belongsTo(Service, { foreignKey: 'service_id', as: 'service' });
Payment.belongsTo(Appointment, { foreignKey: 'appointment_id', as: 'appointment' });
Payment.hasMany(PaymentSplit, { foreignKey: 'payment_id', as: 'splits' });
Payment.hasMany(CommissionTransaction, { foreignKey: 'payment_id', as: 'commissionTransactions' });
CommissionTransaction.belongsTo(Payment, { foreignKey: 'payment_id', as: 'payment' });
CommissionTransaction.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
CommissionTransaction.belongsTo(Staff, { foreignKey: 'worker_staff_id', as: 'workerStaff' });
CommissionTransaction.belongsTo(Staff, { foreignKey: 'manager_staff_id', as: 'managerStaff' });

// PaymentSplit
PaymentSplit.belongsTo(Payment, { foreignKey: 'payment_id', as: 'payment' });

// Inventory
Inventory.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });

// Attendance
Attendance.belongsTo(Staff, { foreignKey: 'staff_id', as: 'staff' });

// Reminder
Reminder.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });

// Expense
Expense.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Expense.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Branch.hasMany(Expense, { foreignKey: 'branch_id', as: 'expenses' });
User.hasMany(Expense, { foreignKey: 'created_by', as: 'expenses' });

// WalkIn
WalkIn.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
WalkIn.belongsTo(Service, { foreignKey: 'service_id', as: 'service' });
WalkIn.belongsTo(Staff, { foreignKey: 'staff_id', as: 'staff' });
WalkIn.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
Branch.hasMany(WalkIn, { foreignKey: 'branch_id', as: 'walkIns' });
Service.hasMany(WalkIn, { foreignKey: 'service_id', as: 'walkIns' });
Staff.hasMany(WalkIn, { foreignKey: 'staff_id', as: 'walkIns' });
Customer.hasMany(WalkIn, { foreignKey: 'customer_id', as: 'walkIns' });

WalkIn.hasMany(WalkInQueueService, { foreignKey: 'walk_in_id', as: 'queueServices' });
WalkIn.belongsToMany(Service, { through: WalkInQueueService, foreignKey: 'walk_in_id', otherKey: 'service_id', as: 'services' });
WalkInQueueService.belongsTo(WalkIn, { foreignKey: 'walk_in_id', as: 'walkIn' });
WalkInQueueService.belongsTo(Service, { foreignKey: 'service_id', as: 'service' });
Service.hasMany(WalkInQueueService, { foreignKey: 'service_id', as: 'walkInQueueLinks' });
Service.belongsToMany(WalkIn, { through: WalkInQueueService, foreignKey: 'service_id', otherKey: 'walk_in_id', as: 'walkInEntries' });

// MaintenanceLog
MaintenanceLog.belongsTo(User, { foreignKey: 'changed_by_user_id', as: 'changedBy', constraints: false });

// SupportTicket
SupportTicket.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant', constraints: false });
Tenant.hasMany(SupportTicket, { foreignKey: 'tenant_id', as: 'supportTickets' });
SupportTicket.hasMany(SupportTicketReply, { foreignKey: 'ticket_id', as: 'replies' });
SupportTicketReply.belongsTo(SupportTicket, { foreignKey: 'ticket_id', as: 'ticket' });
SupportTicketReply.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant', constraints: false });
SupportTicketReply.belongsTo(User, { foreignKey: 'user_id', as: 'author', constraints: false });

// NotificationLog
NotificationLog.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Branch.hasMany(NotificationLog, { foreignKey: 'branch_id', as: 'notificationLogs' });

// Package
Package.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Branch.hasMany(Package, { foreignKey: 'branch_id', as: 'packages' });

// CustomerPackage
CustomerPackage.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
CustomerPackage.belongsTo(Package, { foreignKey: 'package_id', as: 'package' });
CustomerPackage.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
CustomerPackage.hasMany(PackageRedemption, { foreignKey: 'customer_package_id', as: 'redemptions' });
Customer.hasMany(CustomerPackage, { foreignKey: 'customer_id', as: 'customerPackages' });
Package.hasMany(CustomerPackage, { foreignKey: 'package_id', as: 'customerPackages' });

// PackageRedemption
PackageRedemption.belongsTo(CustomerPackage, { foreignKey: 'customer_package_id', as: 'customerPackage' });
PackageRedemption.belongsTo(Appointment, { foreignKey: 'appointment_id', as: 'appointment' });
PackageRedemption.belongsTo(Payment, { foreignKey: 'payment_id', as: 'payment' });
PackageRedemption.belongsTo(Service, { foreignKey: 'service_id', as: 'service' });
PackageRedemption.belongsTo(Staff, { foreignKey: 'redeemed_by', as: 'staff' });

// Waitlist
Waitlist.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Waitlist.belongsTo(Service, { foreignKey: 'service_id', as: 'service' });
Waitlist.belongsTo(Staff, { foreignKey: 'staff_id', as: 'staff' });
Waitlist.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
Branch.hasMany(Waitlist, { foreignKey: 'branch_id', as: 'waitlist' });

// LoyaltyTransaction
LoyaltyTransaction.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
LoyaltyTransaction.belongsTo(Branch,   { foreignKey: 'branch_id',   as: 'branch' });
Customer.hasMany(LoyaltyTransaction, { foreignKey: 'customer_id', as: 'loyaltyTransactions' });

// MembershipPlan
MembershipPlan.hasMany(CustomerMembership, { foreignKey: 'plan_id', as: 'enrollments' });

// CustomerMembership
CustomerMembership.belongsTo(MembershipPlan, { foreignKey: 'plan_id',     as: 'plan' });
CustomerMembership.belongsTo(Customer,       { foreignKey: 'customer_id', as: 'customer' });
CustomerMembership.belongsTo(Branch,         { foreignKey: 'branch_id',   as: 'branch' });
Customer.hasMany(CustomerMembership, { foreignKey: 'customer_id', as: 'memberships' });

// ConsentForm / CustomerConsent
ConsentForm.hasMany(CustomerConsent,  { foreignKey: 'form_id',     as: 'consents' });
CustomerConsent.belongsTo(ConsentForm, { foreignKey: 'form_id',    as: 'form' });
CustomerConsent.belongsTo(Customer,   { foreignKey: 'customer_id', as: 'customer' });
CustomerConsent.belongsTo(Branch,     { foreignKey: 'branch_id',   as: 'branch' });
Customer.hasMany(CustomerConsent, { foreignKey: 'customer_id', as: 'consents' });

// InventoryReorder
InventoryReorder.belongsTo(Inventory, { foreignKey: 'inventory_id', as: 'item' });
InventoryReorder.belongsTo(Branch,    { foreignKey: 'branch_id',    as: 'branch' });
Inventory.hasMany(InventoryReorder, { foreignKey: 'inventory_id', as: 'reorders' });

// StaffAdvance
StaffAdvance.belongsTo(Staff,  { foreignKey: 'staff_id',   as: 'staff' });
StaffAdvance.belongsTo(Branch, { foreignKey: 'branch_id',  as: 'branch' });
StaffAdvance.belongsTo(User,   { foreignKey: 'created_by', as: 'creator', constraints: false });
Staff.hasMany(StaffAdvance,    { foreignKey: 'staff_id',   as: 'advances' });
Branch.hasMany(StaffAdvance,   { foreignKey: 'branch_id',  as: 'advances' });

// CommissionPayout
CommissionPayout.belongsTo(Staff,  { foreignKey: 'staff_id', as: 'staff' });
CommissionPayout.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
CommissionPayout.belongsTo(User,   { foreignKey: 'paid_by',  as: 'paidBy', constraints: false });
Staff.hasMany(CommissionPayout,    { foreignKey: 'staff_id', as: 'commissionPayouts' });
Branch.hasMany(CommissionPayout,   { foreignKey: 'branch_id', as: 'commissionPayouts' });

// ── Salon Inventory associations ─────────────────────────────────────────────
InvCategory.hasMany(InvProduct, { foreignKey: 'category_id', as: 'products' });
InvProduct.belongsTo(InvCategory, { foreignKey: 'category_id', as: 'category' });
InvSupplier.hasMany(InvProduct, { foreignKey: 'supplier_id', as: 'products' });
InvProduct.belongsTo(InvSupplier, { foreignKey: 'supplier_id', as: 'supplier' });
InvProduct.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Branch.hasMany(InvProduct, { foreignKey: 'branch_id', as: 'invProducts' });

InvProduct.hasMany(InvStockMovement, { foreignKey: 'product_id', as: 'movements' });
InvStockMovement.belongsTo(InvProduct, { foreignKey: 'product_id', as: 'product' });
InvStockMovement.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
InvStockMovement.belongsTo(User, { foreignKey: 'user_id', as: 'user', constraints: false });

InvPurchaseOrder.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
InvPurchaseOrder.belongsTo(InvSupplier, { foreignKey: 'supplier_id', as: 'supplier' });
InvPurchaseOrder.hasMany(InvPurchaseOrderItem, { foreignKey: 'purchase_order_id', as: 'items' });
InvPurchaseOrderItem.belongsTo(InvPurchaseOrder, { foreignKey: 'purchase_order_id', as: 'purchaseOrder' });
InvPurchaseOrderItem.belongsTo(InvProduct, { foreignKey: 'product_id', as: 'product' });

InvGoodsReceipt.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
InvGoodsReceipt.belongsTo(InvSupplier, { foreignKey: 'supplier_id', as: 'supplier' });
InvGoodsReceipt.belongsTo(InvPurchaseOrder, { foreignKey: 'purchase_order_id', as: 'purchaseOrder' });
InvGoodsReceipt.hasMany(InvGoodsReceiptItem, { foreignKey: 'goods_receipt_id', as: 'items' });
InvGoodsReceiptItem.belongsTo(InvGoodsReceipt, { foreignKey: 'goods_receipt_id', as: 'goodsReceipt' });
InvGoodsReceiptItem.belongsTo(InvProduct, { foreignKey: 'product_id', as: 'product' });

InvConsumption.belongsTo(InvProduct, { foreignKey: 'product_id', as: 'product' });
InvConsumption.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
InvConsumption.belongsTo(Staff, { foreignKey: 'staff_id', as: 'staff', constraints: false });
InvConsumption.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer', constraints: false });
InvConsumption.belongsTo(Appointment, { foreignKey: 'appointment_id', as: 'appointment', constraints: false });
InvConsumption.belongsTo(Service, { foreignKey: 'service_id', as: 'service', constraints: false });
InvConsumption.belongsTo(InvDayEndBatch, { foreignKey: 'day_end_batch_id', as: 'dayEndBatch', constraints: false });

InvDayEndBatch.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
InvDayEndBatch.hasMany(InvDayEndBatchItem, { foreignKey: 'day_end_batch_id', as: 'items' });
InvDayEndBatch.hasMany(InvConsumption, { foreignKey: 'day_end_batch_id', as: 'consumptions' });
InvDayEndBatchItem.belongsTo(InvDayEndBatch, { foreignKey: 'day_end_batch_id', as: 'batch' });
InvDayEndBatchItem.belongsTo(InvProduct, { foreignKey: 'product_id', as: 'product' });

InvStockAdjustment.belongsTo(InvProduct, { foreignKey: 'product_id', as: 'product' });
InvStockAdjustment.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });

InvStockCount.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
InvStockCount.hasMany(InvStockCountItem, { foreignKey: 'stock_count_id', as: 'items' });
InvStockCountItem.belongsTo(InvStockCount, { foreignKey: 'stock_count_id', as: 'stockCount' });
InvStockCountItem.belongsTo(InvProduct, { foreignKey: 'product_id', as: 'product' });

// Accounting associations
AcctAccount.hasMany(AcctJournalLine, { foreignKey: 'account_id', as: 'lines' });
AcctJournalLine.belongsTo(AcctAccount, { foreignKey: 'account_id', as: 'account' });
AcctJournal.hasMany(AcctJournalLine, { foreignKey: 'journal_id', as: 'lines' });
AcctJournalLine.belongsTo(AcctJournal, { foreignKey: 'journal_id', as: 'journal' });
AcctJournal.belongsTo(AcctPeriod, { foreignKey: 'period_id', as: 'period' });
AcctPeriod.hasMany(AcctJournal, { foreignKey: 'period_id', as: 'journals' });
AcctBankAccount.belongsTo(AcctAccount, { foreignKey: 'gl_account_id', as: 'glAccount' });
AcctBankTxn.belongsTo(AcctBankAccount, { foreignKey: 'bank_account_id', as: 'bankAccount' });
AcctBankTxn.belongsTo(AcctJournal, { foreignKey: 'journal_id', as: 'journal' });
AcctPettyCashTxn.belongsTo(AcctJournal, { foreignKey: 'journal_id', as: 'journal' });
AcctArInvoice.belongsTo(AcctJournal, { foreignKey: 'journal_id', as: 'journal' });
AcctApBill.belongsTo(AcctJournal, { foreignKey: 'journal_id', as: 'journal' });

module.exports = {
  Tenant,
  Subscription,
  Branch,
  User,
  Service,
  Staff,
  StaffSpecialization,
  StaffOffDay,
  Customer,
  Appointment,
  AppointmentService,
  Payment,
  PaymentSplit,
  Inventory,
  Attendance,
  Reminder,
  WalkIn,
  WalkInQueueService,
  Expense,
  NotificationLog,
  NotificationSettings,
  Package,
  CustomerPackage,
  PackageRedemption,
  StaffFcmToken,
  StaffBranch,
  Discount,
  MaintenanceLog,
  SupportTicket,
  SupportTicketReply,
  MessageTemplate,
  PlatformInvoice,
  BankSlip,
  PlanConfig,
  PlanChangeLog,
  // New
  Waitlist,
  LoyaltyRule,
  LoyaltyTransaction,
  MembershipPlan,
  CustomerMembership,
  ConsentForm,
  CustomerConsent,
  InventoryReorder,
  RevokedToken,
  StaffAdvance,
  CommissionPayout,
  CommissionTransaction,
  WhatsAppMessage,
  WhatsAppConnection,
  TenantAiSettings,
  AiUsage,
  AiModelRate,
  AiCreditEntry,
  CrmAiRule,
  CrmLead,
  CrmConversation,
  CrmMessage,
  CrmBookingRequest,
  CrmAiMemory,
  CrmAuditLog,
  WhatsAppBusinessAccount,
  CrmKnowledgeArticle,
  CrmFollowUpJob,
  CrmAutomation,
  CrmAutomationExecution,
  MobileOffer,
  AcctAccount,
  AcctPeriod,
  AcctJournal,
  AcctJournalLine,
  AcctTaxSetting,
  AcctBankAccount,
  AcctBankTxn,
  AcctPettyCashTxn,
  AcctArInvoice,
  AcctApBill,
  AcctAuditLog,
  InvCategory,
  InvSupplier,
  InvProduct,
  InvStockMovement,
  InvPurchaseOrder,
  InvPurchaseOrderItem,
  InvGoodsReceipt,
  InvGoodsReceiptItem,
  InvConsumption,
  InvDayEndBatch,
  InvDayEndBatchItem,
  InvStockAdjustment,
  InvStockCount,
  InvStockCountItem,
  InvSettings,
  PlatformAnnouncement,
  PlatformRelease,
  PlatformReleaseItem,
  FeatureSuggestion,
  FeatureSuggestionHistory,
  MasterCatalogCategory,
  MasterCatalogItem,
};
