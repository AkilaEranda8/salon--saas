require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize } = require('../config/database');
require('../models');

const {
  Branch, Service, Staff, Customer, Appointment,
  Payment, PaymentSplit, Inventory, Reminder, WalkIn, Expense,
} = require('../models');

async function seedData() {
  await sequelize.authenticate();
  console.log('✓ DB connected — seeding data…');

  // ── Branches ────────────────────────────────────────────────────────────────
  const [branch1] = await Branch.findOrCreate({
    where: { name: 'Main Branch' },
    defaults: { address: '123 Main Street', phone: '0300-1234567', status: 'active', color: '#6366f1' },
  });
  const [branch2] = await Branch.findOrCreate({
    where: { name: 'Downtown Branch' },
    defaults: { address: '456 Downtown Ave', phone: '0300-7654321', status: 'active', color: '#8b5cf6' },
  });
  const [branch3] = await Branch.findOrCreate({
    where: { name: 'Westside Branch' },
    defaults: { address: '789 Westside Blvd', phone: '0300-1122334', status: 'active', color: '#06b6d4' },
  });
  console.log('  → 3 branches seeded');

  // ── Services ────────────────────────────────────────────────────────────────
  const serviceData = [
    { name: 'Haircut (Men)',    category: 'Hair',    duration_minutes: 30,  price: 500,  description: 'Classic men\'s haircut with styling' },
    { name: 'Haircut (Women)',  category: 'Hair',    duration_minutes: 45,  price: 800,  description: 'Women\'s cut with blow-dry' },
    { name: 'Hair Color',      category: 'Hair',    duration_minutes: 90,  price: 2500, description: 'Full head color with premium products' },
    { name: 'Facial',          category: 'Skin',    duration_minutes: 60,  price: 1500, description: 'Deep cleansing facial treatment' },
    { name: 'Manicure',        category: 'Nails',   duration_minutes: 40,  price: 700,  description: 'Classic manicure with polish' },
    { name: 'Bridal Makeup',   category: 'Makeup',  duration_minutes: 120, price: 8000, description: 'Complete bridal look with trial' },
  ];
  const services = [];
  for (const s of serviceData) {
    const [svc] = await Service.findOrCreate({ where: { name: s.name }, defaults: s });
    services.push(svc);
  }
  console.log('  → 6 services seeded');

  // ── Staff ───────────────────────────────────────────────────────────────────
  const staffData = [
    { name: 'Ahmed Khan',   phone: '0321-1111111', role_title: 'Senior Stylist',    branch_id: branch1.id, commission_type: 'percentage', commission_value: 15, join_date: '2023-01-10', is_active: true },
    { name: 'Sara Ali',     phone: '0321-2222222', role_title: 'Hair Colorist',     branch_id: branch1.id, commission_type: 'percentage', commission_value: 12, join_date: '2023-03-15', is_active: true },
    { name: 'Fatima Noor',  phone: '0321-3333333', role_title: 'Makeup Artist',     branch_id: branch2.id, commission_type: 'fixed',      commission_value: 500, join_date: '2023-06-01', is_active: true },
    { name: 'Bilal Shah',   phone: '0321-4444444', role_title: 'Junior Stylist',    branch_id: branch3.id, commission_type: 'percentage', commission_value: 10, join_date: '2024-01-20', is_active: true },
  ];
  const staffMembers = [];
  for (const s of staffData) {
    const [st] = await Staff.findOrCreate({ where: { name: s.name }, defaults: s });
    staffMembers.push(st);
  }
  console.log('  → 4 staff seeded');

  // ── Customers ───────────────────────────────────────────────────────────────
  const customerData = [
    { name: 'Ayesha Malik',  phone: '0331-1111111', email: 'ayesha@example.com',  branch_id: branch1.id, visits: 12, total_spent: 15000, loyalty_points: 150, last_visit: '2026-03-10' },
    { name: 'Hassan Raza',   phone: '0331-2222222', email: 'hassan@example.com',  branch_id: branch1.id, visits: 8,  total_spent: 9500,  loyalty_points: 95,  last_visit: '2026-03-15' },
    { name: 'Zara Ahmed',    phone: '0331-3333333', email: 'zara@example.com',    branch_id: branch2.id, visits: 5,  total_spent: 6200,  loyalty_points: 62,  last_visit: '2026-03-12' },
    { name: 'Ali Hussain',   phone: '0331-4444444', email: 'ali@example.com',     branch_id: branch3.id, visits: 3,  total_spent: 2100,  loyalty_points: 21,  last_visit: '2026-03-18' },
  ];
  const customers = [];
  for (const c of customerData) {
    const [cust] = await Customer.findOrCreate({ where: { name: c.name }, defaults: c });
    customers.push(cust);
  }
  console.log('  → 4 customers seeded');

  // ── Appointments ────────────────────────────────────────────────────────────
  const apptData = [
    { branch_id: branch1.id, customer_id: customers[0].id, staff_id: staffMembers[0].id, service_id: services[0].id, customer_name: 'Ayesha Malik',  phone: '0331-1111111', date: '2026-03-21', time: '10:00', amount: 500,  status: 'confirmed' },
    { branch_id: branch1.id, customer_id: customers[1].id, staff_id: staffMembers[1].id, service_id: services[2].id, customer_name: 'Hassan Raza',   phone: '0331-2222222', date: '2026-03-21', time: '11:00', amount: 2500, status: 'pending' },
    { branch_id: branch2.id, customer_id: customers[2].id, staff_id: staffMembers[2].id, service_id: services[5].id, customer_name: 'Zara Ahmed',    phone: '0331-3333333', date: '2026-03-22', time: '09:00', amount: 8000, status: 'pending' },
    { branch_id: branch3.id, customer_id: customers[3].id, staff_id: staffMembers[3].id, service_id: services[0].id, customer_name: 'Ali Hussain',   phone: '0331-4444444', date: '2026-03-22', time: '14:00', amount: 500,  status: 'confirmed' },
    { branch_id: branch1.id, customer_id: customers[0].id, staff_id: staffMembers[0].id, service_id: services[3].id, customer_name: 'Ayesha Malik',  phone: '0331-1111111', date: '2026-03-20', time: '15:00', amount: 1500, status: 'completed' },
    { branch_id: branch2.id, customer_id: customers[2].id, staff_id: staffMembers[2].id, service_id: services[4].id, customer_name: 'Zara Ahmed',    phone: '0331-3333333', date: '2026-03-19', time: '16:00', amount: 700,  status: 'completed' },
  ];
  const appointments = [];
  for (const a of apptData) {
    const appt = await Appointment.create(a);
    appointments.push(appt);
  }
  console.log('  → 6 appointments seeded');

  // ── Payments (with splits) ──────────────────────────────────────────────────
  const paymentData = [
    {
      branch_id: branch1.id, staff_id: staffMembers[0].id, customer_id: customers[0].id, service_id: services[3].id,
      appointment_id: appointments[4].id, customer_name: 'Ayesha Malik', total_amount: 1500,
      loyalty_discount: 0, points_earned: 15, commission_amount: 225, date: '2026-03-20', status: 'paid',
      splits: [{ method: 'Cash', amount: 1500 }],
    },
    {
      branch_id: branch2.id, staff_id: staffMembers[2].id, customer_id: customers[2].id, service_id: services[4].id,
      appointment_id: appointments[5].id, customer_name: 'Zara Ahmed', total_amount: 700,
      loyalty_discount: 0, points_earned: 7, commission_amount: 500, date: '2026-03-19', status: 'paid',
      splits: [{ method: 'Card', amount: 700 }],
    },
    {
      branch_id: branch1.id, staff_id: staffMembers[1].id, customer_id: customers[1].id, service_id: services[2].id,
      appointment_id: null, customer_name: 'Hassan Raza', total_amount: 2500,
      loyalty_discount: 100, points_earned: 24, commission_amount: 300, date: '2026-03-18', status: 'paid',
      splits: [{ method: 'Cash', amount: 1500 }, { method: 'Card', amount: 900 }, { method: 'Loyalty Points', amount: 100 }],
    },
    {
      branch_id: branch3.id, staff_id: staffMembers[3].id, customer_id: customers[3].id, service_id: services[0].id,
      appointment_id: null, customer_name: 'Ali Hussain', total_amount: 500,
      loyalty_discount: 0, points_earned: 5, commission_amount: 50, date: '2026-03-17', status: 'paid',
      splits: [{ method: 'Online Transfer', amount: 500 }],
    },
  ];
  for (const p of paymentData) {
    const { splits, ...paymentFields } = p;
    const payment = await Payment.create(paymentFields);
    for (const sp of splits) {
      await PaymentSplit.create({ payment_id: payment.id, ...sp });
    }
  }
  console.log('  → 4 payments with splits seeded');

  // ── Inventory ───────────────────────────────────────────────────────────────
  const inventoryData = [
    { branch_id: branch1.id, name: 'Shampoo (500ml)',       category: 'Hair Products', quantity: 25, min_quantity: 5,  unit: 'bottle', cost_price: 350,  sell_price: 600 },
    { branch_id: branch1.id, name: 'Hair Color Kit',        category: 'Hair Products', quantity: 10, min_quantity: 3,  unit: 'kit',    cost_price: 800,  sell_price: 1200 },
    { branch_id: branch2.id, name: 'Facial Cream',          category: 'Skin Products', quantity: 15, min_quantity: 4,  unit: 'jar',    cost_price: 500,  sell_price: 900 },
    { branch_id: branch2.id, name: 'Nail Polish Set',       category: 'Nail Products', quantity: 30, min_quantity: 10, unit: 'set',    cost_price: 200,  sell_price: 400 },
    { branch_id: branch3.id, name: 'Disposable Towels',     category: 'Supplies',      quantity: 2,  min_quantity: 20, unit: 'pack',   cost_price: 150,  sell_price: 0 },
  ];
  for (const i of inventoryData) {
    await Inventory.findOrCreate({ where: { name: i.name, branch_id: i.branch_id }, defaults: i });
  }
  console.log('  → 5 inventory items seeded');

  // ── Reminders ───────────────────────────────────────────────────────────────
  const reminderData = [
    { branch_id: branch1.id, title: 'Restock shampoo supply',           type: 'inventory', priority: 'high',   due_date: '2026-03-22', is_done: false },
    { branch_id: branch1.id, title: 'Staff monthly review meeting',     type: 'staff',     priority: 'medium', due_date: '2026-03-25', is_done: false },
    { branch_id: branch2.id, title: 'Follow up bridal client Zara',     type: 'customer',  priority: 'high',   due_date: '2026-03-21', is_done: false },
    { branch_id: branch3.id, title: 'Order disposable towels',          type: 'inventory', priority: 'high',   due_date: '2026-03-21', is_done: false },
  ];
  for (const r of reminderData) {
    await Reminder.findOrCreate({ where: { title: r.title }, defaults: r });
  }
  console.log('  → 4 reminders seeded');

  // ── Walk-in Queue ────────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  // Only seed if no walk-ins exist for today
  const existingWalkIns = await WalkIn.count({ where: { check_in_date: todayStr, branch_id: branch1.id } });
  if (existingWalkIns === 0) {
    const walkInData = [
      {
        token: 'T001', customer_name: 'Walk-in Guest',    phone: null,
        branch_id: branch1.id, service_id: services[0].id, staff_id: staffMembers[0].id,
        status: 'serving', check_in_time: '10:00:00', check_in_date: todayStr,
        estimated_wait: 0, note: null,
      },
      {
        token: 'T002', customer_name: 'Nadia Khalid',     phone: '0312-5556677',
        branch_id: branch1.id, service_id: services[1].id, staff_id: null,
        status: 'waiting', check_in_time: '10:05:00', check_in_date: todayStr,
        estimated_wait: 45, note: 'Prefers trimming only',
      },
      {
        token: 'T003', customer_name: 'Kamran Iqbal',     phone: null,
        branch_id: branch1.id, service_id: services[3].id, staff_id: null,
        status: 'waiting', check_in_time: '10:12:00', check_in_date: todayStr,
        estimated_wait: 90, note: null,
      },
      {
        token: 'T004', customer_name: 'Sana Butt',        phone: '0300-9988776',
        branch_id: branch1.id, service_id: services[4].id, staff_id: staffMembers[1].id,
        status: 'completed', check_in_time: '09:30:00', check_in_date: todayStr,
        estimated_wait: 0, note: null,
      },
    ];
    for (const w of walkInData) {
      await WalkIn.create(w);
    }
    console.log('  → 4 walk-in entries seeded');
  } else {
    console.log('  → Walk-in entries already exist for today, skipped');
  }

  // ── Expenses ──────────────────────────────────────────────────────────────
  const expenseData = [
    // Branch 1 — Main Branch
    { branch_id: branch1.id, category: 'Rent/Utilities',        title: 'March Rent',              amount: 45000,  date: '2026-03-01', paid_to: 'City Properties',   payment_method: 'Bank Transfer', receipt_number: 'RNT-2603',   notes: 'Monthly office rent' },
    { branch_id: branch1.id, category: 'Staff Salaries',        title: 'March Staff Salaries',    amount: 180000, date: '2026-03-31', paid_to: null,                payment_method: 'Bank Transfer', receipt_number: null,         notes: 'Salaries for all branch 1 staff' },
    { branch_id: branch1.id, category: 'Product Purchases',     title: 'Wella Hair Color Stock',  amount: 12000,  date: '2026-03-10', paid_to: 'Wella Distributor', payment_method: 'Cash',          receipt_number: 'PRD-1031',   notes: '12 kits restocked' },
    { branch_id: branch1.id, category: 'Equipment Maintenance', title: 'Chair Hydraulic Repair',  amount: 3500,   date: '2026-03-15', paid_to: 'Fix-It Workshop',   payment_method: 'Cash',          receipt_number: null,         notes: 'Two styling chairs repaired' },
    { branch_id: branch1.id, category: 'Rent/Utilities',        title: 'Electricity Bill Feb',    amount: 8200,   date: '2026-03-05', paid_to: 'LESCO',             payment_method: 'Bank Transfer', receipt_number: 'ELEC-FEB26', notes: null },
    // Branch 2 — Downtown Branch
    { branch_id: branch2.id, category: 'Rent/Utilities',        title: 'March Rent',              amount: 55000,  date: '2026-03-01', paid_to: 'Downtown Realty',   payment_method: 'Cheque',        receipt_number: 'CHQ-0321',   notes: null },
    { branch_id: branch2.id, category: 'Staff Salaries',        title: 'March Staff Salaries',    amount: 95000,  date: '2026-03-31', paid_to: null,                payment_method: 'Bank Transfer', receipt_number: null,         notes: 'Downtown branch staff' },
    { branch_id: branch2.id, category: 'Product Purchases',     title: 'OPI Nail Polish Restock', amount: 7500,   date: '2026-03-08', paid_to: 'BeautySupply Co',   payment_method: 'Card',          receipt_number: 'PRD-0308',   notes: '30 bottles restocked' },
  ];
  for (const e of expenseData) {
    await Expense.findOrCreate({ where: { title: e.title, branch_id: e.branch_id, date: e.date }, defaults: e });
  }
  console.log('  → 8 expenses seeded');

  console.log('\n✓ All demo data seeded successfully!');
}

seedData()
  .catch((err) => { console.error('✗ Seed data failed:', err.message); process.exit(1); })
  .finally(() => sequelize.close());
