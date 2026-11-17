/**
 * RC9a Phase 2.2 — add-services + per-line availability on disposable MySQL :3307.
 */
'use strict';

process.env.H_CALTE_ENABLED = 'false';
process.env.CRM_WA_OUTBOUND_DISABLED = '1';
process.env.GEMINI_API_KEY = '';
process.env.REDIS_URL = process.env.REDIS_URL || '';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3307';
process.env.DB_NAME = 'rc9a_phase22_test';
process.env.DB_USER = 'root';
process.env.DB_PASS = 'rc9a_staging_root_only';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');

const RUN = process.env.RC9A_PHASE22_MYSQL === '1';
const skip = !RUN ? { skip: 'Set RC9A_PHASE22_MYSQL=1' } : {};
const TENANT_ID = 922;
const DATE = '2027-07-12';

let sequelize;
let Branch; let Service; let Staff; let Customer;
let Appointment; let AppointmentService; let StaffOffDay; let Attendance;
let createCrmAppointmentTransactional;
let addServicesToCrmAppointment;
let validatePerLineAvailability;
let filterStartsForPerLineStaff;
let toMinutes;
let fixtures;

async function ensureDatabase() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: 'rc9a_staging_root_only',
  });
  await conn.query('CREATE DATABASE IF NOT EXISTS rc9a_phase22_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await conn.end();
}

async function loadModules() {
  Object.keys(require.cache).filter((k) => {
    const n = k.replace(/\\/g, '/');
    return n.includes('/backend/') && (
      n.includes('config/database') || n.includes('models/')
      || n.includes('crmAppointment') || n.includes('crmMultiService')
      || n.includes('staffAvailability') || n.includes('staffSchedule') || n.includes('dateUtils')
    );
  }).forEach((k) => delete require.cache[k]);

  ({ sequelize } = require('../../config/database'));
  Branch = require('../../models/Branch');
  Service = require('../../models/Service');
  Staff = require('../../models/Staff');
  Customer = require('../../models/Customer');
  Appointment = require('../../models/Appointment');
  AppointmentService = require('../../models/AppointmentService');
  StaffOffDay = require('../../models/StaffOffDay');
  Attendance = require('../../models/Attendance');
  if (!Appointment.associations.service) {
    Appointment.belongsTo(Service, { foreignKey: 'service_id', as: 'service', constraints: false });
  }
  if (!Appointment.associations.services) {
    Appointment.belongsToMany(Service, {
      through: AppointmentService,
      foreignKey: 'appointment_id',
      otherKey: 'service_id',
      as: 'services',
      constraints: false,
    });
  }
  ({ createCrmAppointmentTransactional } = require('../crmAppointmentCreateService'));
  ({ addServicesToCrmAppointment } = require('../crmAppointmentAddServicesService'));
  ({
    validatePerLineAvailability,
    filterStartsForPerLineStaff,
    toMinutes,
  } = require('../crmMultiServiceBooking'));
}

async function resetSchema() {
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of [
    'appointment_services', 'appointments', 'attendance', 'staff_off_days',
    'customers', 'staff', 'services', 'branches',
  ]) {
    await sequelize.query(`DROP TABLE IF EXISTS ${t}`);
  }
  await Branch.sync();
  await Service.sync();
  await Staff.sync();
  await Customer.sync();
  await Appointment.sync();
  await StaffOffDay.sync();
  await Attendance.sync();
  await AppointmentService.sync();
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function seed() {
  const hours = {};
  for (let d = 0; d <= 6; d += 1) hours[d] = { closed: false, start: '09:00', end: '18:00' };
  const branch = await Branch.create({ name: 'P22', status: 'active', tenant_id: TENANT_ID });
  const stylist = await Staff.create({
    name: 'Cut Stylist', branch_id: branch.id, is_active: true, available_online: true,
    working_hours: hours, tenant_id: TENANT_ID,
  });
  const waxer = await Staff.create({
    name: 'Wax Specialist', branch_id: branch.id, is_active: true, available_online: true,
    working_hours: hours, tenant_id: TENANT_ID,
  });
  const haircut = await Service.create({
    name: 'Haircut', duration_minutes: 45, price: 2000, is_active: true, tenant_id: TENANT_ID,
  });
  const wax = await Service.create({
    name: 'Full Leg Wax', duration_minutes: 60, price: 3500, is_active: true, tenant_id: TENANT_ID,
  });
  const facial = await Service.create({
    name: 'Facial', duration_minutes: 45, price: 4000, is_active: true, tenant_id: TENANT_ID,
  });
  const botox = await Service.create({
    name: 'Botox', duration_minutes: 300, price: 22000, is_active: true, tenant_id: TENANT_ID,
  });
  fixtures = { branch, stylist, waxer, haircut, wax, facial, botox };
}

test('phase22 mysql bootstrap', skip, async () => {
  await ensureDatabase();
  await loadModules();
  await sequelize.authenticate();
  await resetSchema();
  await seed();
  assert.ok(fixtures.haircut.id);
});

test('unit: per-line overlap detected independently per staff', skip, () => {
  const lines = [
    { service_id: 1, staff_id: 10, time: '10:00', duration_minutes: 45 },
    { service_id: 2, staff_id: 20, time: '10:45', duration_minutes: 60 },
  ];
  const windows = new Map([
    [10, { startMin: toMinutes('09:00'), endMin: toMinutes('18:00') }],
    [20, { startMin: toMinutes('09:00'), endMin: toMinutes('18:00') }],
  ]);
  const blocked = new Map([
    [10, []],
    [20, [[toMinutes('10:30'), toMinutes('11:30')]]],
  ]);
  const r = validatePerLineAvailability(lines, windows, blocked);
  assert.equal(r.ok, false);
  assert.equal(r.conflicts[0].staff_id, 20);
  assert.equal(r.conflicts[0].reason, 'overlap');
});

test('unit: filterStartsForPerLineStaff never invents times', skip, () => {
  const plan = [
    { duration_minutes: 45, staff_id: 10 },
    { duration_minutes: 60, staff_id: 20 },
  ];
  const windows = new Map([
    [10, { startMin: toMinutes('09:00'), endMin: toMinutes('18:00') }],
    [20, { startMin: toMinutes('09:00'), endMin: toMinutes('18:00') }],
  ]);
  const blocked = new Map([[10, []], [20, [[toMinutes('11:00'), toMinutes('12:00')]]]]);
  const filtered = filterStartsForPerLineStaff(
    ['09:00', '10:00', '10:30'],
    plan,
    windows,
    blocked,
  );
  // 10:00 → wax 10:45-11:45 overlaps 11:00-12:00; 10:30 → 11:15-12:15 overlaps
  assert.deepEqual(filtered, ['09:00']);
});

test('mysql: create then add service preserves appointment id', skip, async () => {
  const created = await createCrmAppointmentTransactional({
    tenantId: TENANT_ID,
    body: {
      branch_id: fixtures.branch.id,
      service_id: fixtures.haircut.id,
      staff_id: fixtures.stylist.id,
      date: DATE,
      time: '09:00',
      customer_name: 'AddSvc Guest',
      phone: '94772220001',
      idempotency_key: 'p22-create-base',
    },
  });
  const apptId = created.appointment.id;
  const added = await addServicesToCrmAppointment({
    tenantId: TENANT_ID,
    appointmentId: apptId,
    body: {
      add_service_ids: [fixtures.wax.id],
      service_staff: [{ service_id: fixtures.wax.id, staff_id: fixtures.waxer.id }],
      idempotency_key: 'p22-add-wax',
    },
  });
  assert.equal(added.appointment.id, apptId);
  assert.equal(Number(added.appointment.amount), 5500);
  assert.equal(added.service_links.length, 2);
  assert.equal(Number(added.service_links[1].service_id), fixtures.wax.id);
  assert.equal(Number(added.service_links[1].staff_id), fixtures.waxer.id);
  assert.equal(String(added.service_links[1].time).slice(0, 5), '09:45');
});

test('mysql: duplicate service on appointment → DUPLICATE_SERVICE', skip, async () => {
  let threw = false;
  try {
    await addServicesToCrmAppointment({
      tenantId: TENANT_ID,
      appointmentId: (await Appointment.findOne({ where: { tenant_id: TENANT_ID } })).id,
      body: { add_service_ids: [fixtures.haircut.id], idempotency_key: 'p22-dup' },
    });
  } catch (err) {
    threw = true;
    assert.equal(err.code, 'DUPLICATE_SERVICE');
  }
  assert.equal(threw, true);
});

test('mysql: add-services idempotent replay', skip, async () => {
  const appt = await Appointment.findOne({
    where: { tenant_id: TENANT_ID, notes: { [require('sequelize').Op.like]: '%p22-add-wax%' } },
  });
  const before = await AppointmentService.count({ where: { appointment_id: appt.id } });
  const again = await addServicesToCrmAppointment({
    tenantId: TENANT_ID,
    appointmentId: appt.id,
    body: {
      add_service_ids: [fixtures.wax.id],
      idempotency_key: 'p22-add-wax',
    },
  });
  assert.equal(again.idempotent, true);
  const after = await AppointmentService.count({ where: { appointment_id: appt.id } });
  assert.equal(after, before);
});

test('mysql: cross-tenant appointment access denied', skip, async () => {
  const appt = await Appointment.findOne({ where: { tenant_id: TENANT_ID } });
  let threw = false;
  try {
    await addServicesToCrmAppointment({
      tenantId: TENANT_ID + 99,
      appointmentId: appt.id,
      body: { add_service_ids: [fixtures.facial.id] },
    });
  } catch (err) {
    threw = true;
    assert.equal(err.code, 'NOT_FOUND');
  }
  assert.equal(threw, true);
});

test('mysql: multi-stylist create with per-line staff', skip, async () => {
  const r = await createCrmAppointmentTransactional({
    tenantId: TENANT_ID,
    body: {
      branch_id: fixtures.branch.id,
      service_ids: [fixtures.haircut.id, fixtures.wax.id],
      staff_id: fixtures.stylist.id,
      service_staff: [
        { service_id: fixtures.haircut.id, staff_id: fixtures.stylist.id },
        { service_id: fixtures.wax.id, staff_id: fixtures.waxer.id },
      ],
      date: '2027-07-13',
      time: '10:00',
      customer_name: 'Multi',
      phone: '94772220002',
      idempotency_key: 'p22-multi-staff',
    },
  });
  const links = await AppointmentService.findAll({
    where: { appointment_id: r.appointment.id },
    order: [['sort_order', 'ASC']],
  });
  assert.equal(Number(links[0].staff_id), fixtures.stylist.id);
  assert.equal(Number(links[1].staff_id), fixtures.waxer.id);
});

test('mysql: line staff off-day blocks create', skip, async () => {
  await StaffOffDay.create({
    staff_id: fixtures.waxer.id,
    date: '2027-07-14',
    reason: 'p22',
    tenant_id: TENANT_ID,
  });
  let threw = false;
  try {
    await createCrmAppointmentTransactional({
      tenantId: TENANT_ID,
      body: {
        branch_id: fixtures.branch.id,
        service_ids: [fixtures.haircut.id, fixtures.wax.id],
        staff_id: fixtures.stylist.id,
        service_staff: [
          { service_id: fixtures.haircut.id, staff_id: fixtures.stylist.id },
          { service_id: fixtures.wax.id, staff_id: fixtures.waxer.id },
        ],
        date: '2027-07-14',
        time: '10:00',
        customer_name: 'Off',
        phone: '94772220003',
        idempotency_key: 'p22-off-line',
      },
    });
  } catch (err) {
    threw = true;
    assert.equal(err.code, 'BAD_REQUEST');
  }
  assert.equal(threw, true);
});

test('mysql: add-services rollback on forced link failure', skip, async () => {
  const base = await createCrmAppointmentTransactional({
    tenantId: TENANT_ID,
    body: {
      branch_id: fixtures.branch.id,
      service_id: fixtures.facial.id,
      staff_id: fixtures.stylist.id,
      date: '2027-07-15',
      time: '11:00',
      customer_name: 'Roll',
      phone: '94772220004',
      idempotency_key: 'p22-roll-base',
    },
  });
  const beforeLinks = await AppointmentService.count({ where: { appointment_id: base.appointment.id } });
  const beforeAmount = Number(base.appointment.amount);
  let threw = false;
  try {
    await addServicesToCrmAppointment({
      tenantId: TENANT_ID,
      appointmentId: base.appointment.id,
      body: {
        add_service_ids: [fixtures.wax.id],
        idempotency_key: 'p22-roll-add',
      },
      testHooks: { forceLinkFailure: true },
    });
  } catch (err) {
    threw = true;
    assert.equal(err.code, 'FORCE_LINK_FAILURE');
  }
  assert.equal(threw, true);
  await base.appointment.reload();
  assert.equal(Number(base.appointment.amount), beforeAmount);
  const afterLinks = await AppointmentService.count({ where: { appointment_id: base.appointment.id } });
  assert.equal(afterLinks, beforeLinks);
});

test('phase22 teardown', skip, async () => {
  await sequelize.close();
});
