/**
 * RC9a Phase 2.1 — REAL MySQL multi-service booking validation.
 *
 * Targets disposable DB `rc9a_phase21_test` on isolated staging MySQL :3307.
 * NEVER production. NEVER 46.62.135.100. No WhatsApp / Gemini.
 *
 * Run (from backend/):
 *   $env:RC9A_PHASE21_MYSQL='1'
 *   node --test services/__tests__/crmAppointmentMysqlRc9aPhase21.test.js
 */
'use strict';

// Pin isolated staging DB BEFORE any Sequelize model load (dotenv will not override).
process.env.H_CALTE_ENABLED = 'false';
process.env.CRM_WA_OUTBOUND_DISABLED = '1';
process.env.GEMINI_API_KEY = '';
process.env.REDIS_URL = process.env.REDIS_URL || '';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3307';
process.env.DB_NAME = 'rc9a_phase21_test';
process.env.DB_USER = 'root';
process.env.DB_PASS = 'rc9a_staging_root_only';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const RUN = process.env.RC9A_PHASE21_MYSQL === '1';

const TENANT_ID = 921;
const BOOK_DATE = '2027-06-14'; // Monday far ahead — avoids past-slot filter

/** @type {import('sequelize').Sequelize|null} */
let sequelize = null;
let Branch;
let Service;
let Staff;
let Customer;
let Appointment;
let AppointmentService;
let StaffOffDay;
let Attendance;
let createCrmAppointmentTransactional;
let fixtures = null;

const skip = !RUN
  ? { skip: 'Set RC9A_PHASE21_MYSQL=1 with staging MySQL on :3307' }
  : {};

async function resetSchema() {
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  // Drop in dependency order (associations may have added FKs on prior runs)
  await sequelize.query('DROP TABLE IF EXISTS appointment_services');
  await sequelize.query('DROP TABLE IF EXISTS appointments');
  await sequelize.query('DROP TABLE IF EXISTS attendance');
  await sequelize.query('DROP TABLE IF EXISTS staff_off_days');
  await sequelize.query('DROP TABLE IF EXISTS customers');
  await sequelize.query('DROP TABLE IF EXISTS staff');
  await sequelize.query('DROP TABLE IF EXISTS services');
  await sequelize.query('DROP TABLE IF EXISTS branches');
  // Create parents before join table — sequential, not Promise.all
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

async function seedFixtures() {
  const hours = {};
  for (let d = 0; d <= 6; d += 1) {
    hours[d] = { closed: false, start: '09:00', end: '18:00' };
  }

  const branch = await Branch.create({
    name: 'Phase21 Branch',
    status: 'active',
    tenant_id: TENANT_ID,
  });

  const staff = await Staff.create({
    name: 'Stylist A',
    branch_id: branch.id,
    is_active: true,
    available_online: true,
    working_hours: hours,
    tenant_id: TENANT_ID,
  });

  const staffB = await Staff.create({
    name: 'Wax Specialist B',
    branch_id: branch.id,
    is_active: true,
    available_online: true,
    working_hours: hours,
    tenant_id: TENANT_ID,
  });

  const haircut = await Service.create({
    name: 'Haircut',
    duration_minutes: 45,
    price: 2000,
    is_active: true,
    available_online: true,
    tenant_id: TENANT_ID,
  });
  const wax = await Service.create({
    name: 'Full Leg Wax',
    duration_minutes: 60,
    price: 3500,
    is_active: true,
    available_online: true,
    tenant_id: TENANT_ID,
  });
  const facial = await Service.create({
    name: 'Facial',
    duration_minutes: 45,
    price: 4000,
    is_active: true,
    available_online: true,
    tenant_id: TENANT_ID,
  });
  const botox = await Service.create({
    name: 'Botox Hair Treatment',
    duration_minutes: 300,
    price: 22000,
    is_active: true,
    available_online: true,
    tenant_id: TENANT_ID,
  });

  fixtures = {
    branch,
    staff,
    staffB,
    haircut,
    wax,
    facial,
    botox,
  };
  return fixtures;
}

async function loadModules() {
  // Clear cached database/models so env above wins even if another test loaded them.
  const keys = Object.keys(require.cache).filter((k) =>
    k.replace(/\\/g, '/').includes('/backend/')
    && (k.includes('config\\database') || k.includes('config/database')
      || k.includes('models\\') || k.includes('models/')
      || k.includes('crmAppointmentCreateService')
      || k.includes('crmMultiServiceBooking')
      || k.includes('staffAvailability')
      || k.includes('staffSchedule')
      || k.includes('dateUtils')),
  );
  keys.forEach((k) => delete require.cache[k]);

  ({ sequelize } = require('../../config/database'));
  Branch = require('../../models/Branch');
  Service = require('../../models/Service');
  Staff = require('../../models/Staff');
  Customer = require('../../models/Customer');
  Appointment = require('../../models/Appointment');
  AppointmentService = require('../../models/AppointmentService');
  StaffOffDay = require('../../models/StaffOffDay');
  Attendance = require('../../models/Attendance');
  // Minimal associations required by listAvailableSlots (normally models/index.js).
  // constraints:false keeps disposable sync from requiring FK create-order gymnastics.
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
  if (!Appointment.associations.serviceLinks) {
    Appointment.hasMany(AppointmentService, {
      foreignKey: 'appointment_id',
      as: 'serviceLinks',
      constraints: false,
    });
  }
  ({ createCrmAppointmentTransactional } = require('../crmAppointmentCreateService'));
}

async function countRows() {
  const [appts] = await sequelize.query(
    'SELECT COUNT(*) AS c FROM appointments WHERE tenant_id = :tid',
    { replacements: { tid: TENANT_ID } },
  );
  const [links] = await sequelize.query('SELECT COUNT(*) AS c FROM appointment_services');
  return {
    appointments: Number(appts[0].c),
    appointment_services: Number(links[0].c),
  };
}

async function dumpAppointment(id) {
  const [rows] = await sequelize.query(
    'SELECT id, tenant_id, service_id, staff_id, date, TIME_FORMAT(time, "%H:%i") AS time, amount, status, notes FROM appointments WHERE id = :id',
    { replacements: { id } },
  );
  const [links] = await sequelize.query(
    `SELECT id, appointment_id, service_id, staff_id, date,
            TIME_FORMAT(time, "%H:%i") AS time, sort_order
     FROM appointment_services WHERE appointment_id = :id ORDER BY sort_order ASC, id ASC`,
    { replacements: { id } },
  );
  return { appointment: rows[0] || null, links };
}

test('phase21 mysql bootstrap', skip, async (t) => {
  await loadModules();
  await sequelize.authenticate();
  await resetSchema();
  await seedFixtures();
  assert.ok(fixtures.haircut.id);
  t.diagnostic(`MySQL ok tenant=${TENANT_ID} branch=${fixtures.branch.id} staff=${fixtures.staff.id}`);
});

test('mysql: one service persists appointment + one appointment_services row', skip, async () => {
  const r = await createCrmAppointmentTransactional({
    tenantId: TENANT_ID,
    body: {
      branch_id: fixtures.branch.id,
      service_id: fixtures.haircut.id,
      staff_id: fixtures.staff.id,
      date: BOOK_DATE,
      time: '09:00',
      customer_name: 'Nimal One',
      phone: '94771110001',
      idempotency_key: 'p21-one-svc',
    },
  });
  assert.equal(r.idempotent, false);
  const dump = await dumpAppointment(r.appointment.id);
  assert.equal(dump.appointment.status, 'confirmed');
  assert.equal(Number(dump.appointment.service_id), fixtures.haircut.id);
  assert.equal(dump.links.length, 1);
  assert.equal(Number(dump.links[0].service_id), fixtures.haircut.id);
  assert.equal(dump.links[0].time, '09:00');
  assert.equal(Number(dump.appointment.amount), 2000);
});

test('mysql: two services — sequential times + total amount', skip, async () => {
  const r = await createCrmAppointmentTransactional({
    tenantId: TENANT_ID,
    body: {
      branch_id: fixtures.branch.id,
      service_id: fixtures.haircut.id,
      service_ids: [fixtures.haircut.id, fixtures.wax.id],
      staff_id: fixtures.staff.id,
      date: BOOK_DATE,
      time: '10:00',
      customer_name: 'Nimal Two',
      phone: '94771110002',
      idempotency_key: 'p21-two-svc',
    },
  });
  const dump = await dumpAppointment(r.appointment.id);
  assert.equal(dump.links.length, 2);
  assert.equal(dump.links[0].time, '10:00');
  assert.equal(dump.links[1].time, '10:45');
  assert.equal(Number(dump.appointment.amount), 5500);
  assert.equal(r.total_duration_minutes, 105);
});

test('mysql: three services', skip, async () => {
  // After two-svc 10:00→11:45 — start at 12:00 to avoid overlap
  const r = await createCrmAppointmentTransactional({
    tenantId: TENANT_ID,
    body: {
      branch_id: fixtures.branch.id,
      service_ids: [fixtures.haircut.id, fixtures.wax.id, fixtures.facial.id],
      staff_id: fixtures.staff.id,
      date: BOOK_DATE,
      time: '12:00',
      customer_name: 'Nimal Three',
      phone: '94771110003',
      idempotency_key: 'p21-three-svc',
    },
  });
  const dump = await dumpAppointment(r.appointment.id);
  assert.equal(dump.links.length, 3);
  assert.deepEqual(
    dump.links.map((l) => Number(l.service_id)),
    [fixtures.haircut.id, fixtures.wax.id, fixtures.facial.id],
  );
  assert.equal(dump.links[2].time, '13:45'); // 12:00 + 45 + 60
  assert.equal(Number(dump.appointment.amount), 9500);
});

test('mysql: 300-minute botox fits working window', skip, async () => {
  // Separate date so 5h visit does not collide with earlier BOOK_DATE bookings
  const r = await createCrmAppointmentTransactional({
    tenantId: TENANT_ID,
    body: {
      branch_id: fixtures.branch.id,
      service_id: fixtures.botox.id,
      staff_id: fixtures.staff.id,
      date: '2027-06-17',
      time: '09:30',
      customer_name: 'Botox Guest',
      phone: '94771110004',
      idempotency_key: 'p21-botox-300',
    },
  });
  assert.equal(r.total_duration_minutes, 300);
  const dump = await dumpAppointment(r.appointment.id);
  assert.equal(dump.links.length, 1);
  assert.equal(Number(dump.appointment.amount), 22000);
});

test('mysql: invalid second service rolls back — no partial rows', skip, async () => {
  const before = await countRows();
  let threw = false;
  try {
    await createCrmAppointmentTransactional({
      tenantId: TENANT_ID,
      body: {
        branch_id: fixtures.branch.id,
        service_ids: [fixtures.haircut.id, 999999],
        staff_id: fixtures.staff.id,
        date: BOOK_DATE,
        time: '14:00',
        customer_name: 'Bad Svc',
        phone: '94771110005',
        idempotency_key: 'p21-bad-svc',
      },
    });
  } catch (err) {
    threw = true;
    assert.equal(err.code, 'NOT_FOUND');
  }
  assert.equal(threw, true);
  const after = await countRows();
  assert.equal(after.appointments, before.appointments);
  assert.equal(after.appointment_services, before.appointment_services);
});

test('mysql: duplicate service IDs collapse to unique ordered list', skip, async () => {
  // Three-svc ends 14:30 on BOOK_DATE — use staffB to avoid staff-A conflict
  const r = await createCrmAppointmentTransactional({
    tenantId: TENANT_ID,
    body: {
      branch_id: fixtures.branch.id,
      service_id: fixtures.haircut.id,
      extra_service_ids: [fixtures.wax.id, fixtures.haircut.id, fixtures.wax.id],
      staff_id: fixtures.staffB.id,
      date: BOOK_DATE,
      time: '09:00',
      customer_name: 'Dedup Guest',
      phone: '94771110006',
      idempotency_key: 'p21-dedupe-svc',
    },
  });
  const dump = await dumpAppointment(r.appointment.id);
  assert.equal(dump.links.length, 2);
  assert.deepEqual(
    dump.links.map((l) => Number(l.service_id)),
    [fixtures.haircut.id, fixtures.wax.id],
  );
});

test('mysql: duplicate idempotency returns same appointment — no second row', skip, async () => {
  const body = {
    branch_id: fixtures.branch.id,
    service_ids: [fixtures.facial.id],
    staff_id: fixtures.staffB.id,
    date: BOOK_DATE,
    time: '11:00',
    customer_name: 'Idem Guest',
    phone: '94771110007',
    idempotency_key: 'p21-idem-same',
  };
  const r1 = await createCrmAppointmentTransactional({ tenantId: TENANT_ID, body });
  const before = await countRows();
  const r2 = await createCrmAppointmentTransactional({ tenantId: TENANT_ID, body });
  assert.equal(r2.idempotent, true);
  assert.equal(r2.appointment.id, r1.appointment.id);
  const after = await countRows();
  assert.equal(after.appointments, before.appointments);
  assert.equal(after.appointment_services, before.appointment_services);
});

test('mysql: staff unavailable (off day) rejected', skip, async () => {
  await StaffOffDay.create({
    staff_id: fixtures.staff.id,
    date: '2027-06-15',
    reason: 'phase21 off',
    tenant_id: TENANT_ID,
  });
  let threw = false;
  try {
    await createCrmAppointmentTransactional({
      tenantId: TENANT_ID,
      body: {
        branch_id: fixtures.branch.id,
        service_id: fixtures.haircut.id,
        staff_id: fixtures.staff.id,
        date: '2027-06-15',
        time: '10:00',
        customer_name: 'Off Day',
        phone: '94771110008',
        idempotency_key: 'p21-off-day',
      },
    });
  } catch (err) {
    threw = true;
    assert.equal(err.code, 'BAD_REQUEST');
    assert.match(err.message, /off/i);
  }
  assert.equal(threw, true);
});

test('mysql: outside working hours (300min late start) rejected', skip, async () => {
  let threw = false;
  try {
    await createCrmAppointmentTransactional({
      tenantId: TENANT_ID,
      body: {
        branch_id: fixtures.branch.id,
        service_id: fixtures.botox.id,
        staff_id: fixtures.staff.id,
        date: BOOK_DATE,
        time: '16:00',
        customer_name: 'Too Late',
        phone: '94771110009',
        idempotency_key: 'p21-past-close',
      },
    });
  } catch (err) {
    threw = true;
    assert.equal(err.code, 'BAD_REQUEST');
    assert.match(err.message, /working hours/i);
  }
  assert.equal(threw, true);
});

test('mysql: overlapping appointments → SLOT_CONFLICT + available_slots', skip, async () => {
  // Existing 09:00 haircut already booked in first test on BOOK_DATE for staff A.
  // A second 09:00 should conflict.
  let threw = false;
  let errObj = null;
  try {
    await createCrmAppointmentTransactional({
      tenantId: TENANT_ID,
      body: {
        branch_id: fixtures.branch.id,
        service_id: fixtures.haircut.id,
        staff_id: fixtures.staff.id,
        date: BOOK_DATE,
        time: '09:00',
        customer_name: 'Clash Guest',
        phone: '94771110010',
        idempotency_key: 'p21-overlap',
      },
    });
  } catch (err) {
    threw = true;
    errObj = err;
  }
  assert.equal(threw, true);
  assert.equal(errObj.code, 'SLOT_CONFLICT');
});

test('mysql: forced line-item failure rolls back appointment (no orphans)', skip, async () => {
  const before = await countRows();
  const rollbackBody = {
    branch_id: fixtures.branch.id,
    service_ids: [fixtures.haircut.id, fixtures.facial.id],
    staff_id: fixtures.staffB.id,
    date: '2027-06-18',
    time: '10:00',
    customer_name: 'Rollback Guest',
    phone: '94771110011',
    idempotency_key: 'p21-rollback-force',
  };
  let threw = false;
  try {
    await createCrmAppointmentTransactional({
      tenantId: TENANT_ID,
      body: rollbackBody,
      testHooks: { forceLinkFailure: true },
    });
  } catch (err) {
    threw = true;
    assert.equal(err.code, 'FORCE_LINK_FAILURE');
  }
  assert.equal(threw, true);
  const after = await countRows();
  assert.equal(after.appointments, before.appointments, 'no partial appointment');
  assert.equal(after.appointment_services, before.appointment_services, 'no orphan links');

  // Retry without force succeeds once (same idem key was never persisted)
  const ok = await createCrmAppointmentTransactional({
    tenantId: TENANT_ID,
    body: rollbackBody,
  });
  assert.equal(ok.idempotent, false);
  const dump = await dumpAppointment(ok.appointment.id);
  assert.equal(dump.links.length, 2);

  // Second retry is idempotent — no duplicates
  const again = await createCrmAppointmentTransactional({
    tenantId: TENANT_ID,
    body: rollbackBody,
  });
  assert.equal(again.idempotent, true);
  assert.equal(again.appointment.id, ok.appointment.id);
});

test('mysql: explicit per-line staff_ids persist differently when provided', skip, async () => {
  const r = await createCrmAppointmentTransactional({
    tenantId: TENANT_ID,
    body: {
      branch_id: fixtures.branch.id,
      service_ids: [fixtures.haircut.id, fixtures.wax.id],
      service_staff: [
        { service_id: fixtures.haircut.id, staff_id: fixtures.staff.id },
        { service_id: fixtures.wax.id, staff_id: fixtures.staffB.id },
      ],
      staff_id: fixtures.staff.id,
      date: '2027-06-16',
      time: '10:00',
      customer_name: 'Multi Stylist',
      phone: '94771110012',
      idempotency_key: 'p21-per-line-staff',
    },
  });
  const dump = await dumpAppointment(r.appointment.id);
  assert.equal(dump.links.length, 2);
  assert.equal(Number(dump.links[0].staff_id), fixtures.staff.id);
  assert.equal(Number(dump.links[1].staff_id), fixtures.staffB.id);
});

test('phase21 mysql teardown diagnostic dump', skip, async (t) => {
  const [appts] = await sequelize.query(
    `SELECT id, service_id, staff_id, date, TIME_FORMAT(time,"%H:%i") AS time, amount, status
     FROM appointments WHERE tenant_id = :tid ORDER BY id`,
    { replacements: { tid: TENANT_ID } },
  );
  const [links] = await sequelize.query(
    `SELECT appointment_id, service_id, staff_id, TIME_FORMAT(time,"%H:%i") AS time, sort_order
     FROM appointment_services ORDER BY appointment_id, sort_order`,
  );
  t.diagnostic(`appointments=${JSON.stringify(appts)}`);
  t.diagnostic(`appointment_services=${JSON.stringify(links)}`);
  await sequelize.close();
});
