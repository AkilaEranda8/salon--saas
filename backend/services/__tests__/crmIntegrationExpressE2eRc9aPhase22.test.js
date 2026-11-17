/**
 * RC9a Phase 2.2 — Express CRM controller E2E + Redis SET NX idempotency.
 * Disposable MySQL :3307 + Redis :6380. No production. No WhatsApp/Gemini.
 */
'use strict';

process.env.H_CALTE_ENABLED = 'false';
process.env.CRM_WA_OUTBOUND_DISABLED = '1';
process.env.GEMINI_API_KEY = '';
process.env.AI_ENGINE_SERVICE_SECRET = 'rc9a-phase22-e2e-secret';
process.env.REDIS_URL = 'redis://127.0.0.1:6380';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3307';
process.env.DB_NAME = 'rc9a_phase22_e2e';
process.env.DB_USER = 'root';
process.env.DB_PASS = 'rc9a_staging_root_only';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mysql = require('mysql2/promise');

const RUN = process.env.RC9A_PHASE22_E2E === '1';
const skip = !RUN ? { skip: 'Set RC9A_PHASE22_E2E=1 with staging MySQL+Redis' } : {};
const SECRET = 'rc9a-phase22-e2e-secret';
const TENANT_ID = 923;
const OTHER_TENANT = 924;

let sequelize;
let server;
let baseUrl;
let fixtures = {};

function request(method, path, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, baseUrl);
    const data = body != null ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { json = { raw }; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function ensureDb() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1', port: 3307, user: 'root', password: 'rc9a_staging_root_only',
  });
  await conn.query('CREATE DATABASE IF NOT EXISTS rc9a_phase22_e2e CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await conn.end();
}

async function boot() {
  await ensureDb();
  Object.keys(require.cache).filter((k) => k.replace(/\\/g, '/').includes('/backend/'))
    .forEach((k) => delete require.cache[k]);

  ({ sequelize } = require('../../config/database'));
  // Load models/index once so associations are registered exactly once (routes also use this)
  const models = require('../../models');
  const {
    Tenant, Branch, Service, Staff, Customer, Appointment, AppointmentService,
    StaffOffDay, Attendance,
  } = models;

  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of [
    'appointment_services', 'appointments', 'attendance', 'staff_off_days',
    'customers', 'staff', 'services', 'branches', 'tenants',
  ]) {
    await sequelize.query(`DROP TABLE IF EXISTS \`${t}\``);
  }
  await Tenant.sync();
  await Branch.sync();
  await Service.sync();
  await Staff.sync();
  await Customer.sync();
  await Appointment.sync();
  await StaffOffDay.sync();
  await Attendance.sync();
  await AppointmentService.sync();
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

  await Tenant.create({
    id: TENANT_ID,
    name: 'Phase22 E2E',
    slug: 'phase22-e2e',
    email: 'phase22@example.com',
    plan: 'pro',
    status: 'active',
    enabled_features: { whatsapp_ai_crm: true },
  });
  await Tenant.create({
    id: OTHER_TENANT,
    name: 'Other Tenant',
    slug: 'phase22-other',
    email: 'other22@example.com',
    plan: 'pro',
    status: 'active',
    enabled_features: { whatsapp_ai_crm: true },
  });

  const hours = {};
  for (let d = 0; d <= 6; d += 1) hours[d] = { closed: false, start: '09:00', end: '18:00' };
  const branch = await Branch.create({ name: 'E2E', status: 'active', tenant_id: TENANT_ID });
  const staff = await Staff.create({
    name: 'E2E Staff', branch_id: branch.id, is_active: true, available_online: true,
    working_hours: hours, tenant_id: TENANT_ID,
  });
  const haircut = await Service.create({
    name: 'Haircut', duration_minutes: 45, price: 2000, is_active: true, tenant_id: TENANT_ID,
  });
  const wax = await Service.create({
    name: 'Wax', duration_minutes: 60, price: 3500, is_active: true, tenant_id: TENANT_ID,
  });
  fixtures = { branch, staff, haircut, wax, Tenant, Appointment, AppointmentService };

  // Clear redis idem keys for this tenant
  try {
    const { getRedis } = require('../../utils/redis');
    const redis = getRedis();
    if (redis) {
      const keys = await redis.keys(`t:${TENANT_ID}:crm:idem:*`);
      if (keys.length) await redis.del(...keys);
    }
  } catch { /* ignore */ }

  const express = require('express');
  const crmRoutes = require('../../routes/crmIntegration');
  const app = express();
  app.use(express.json());
  app.use('/api/crm-integration', crmRoutes);
  // Silence staff notify side effects
  const notif = require('../../services/notificationService');
  notif.notifyStaffAppointmentAssigned = async () => ({ skipped: true });

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
}

test('e2e boot', skip, async () => {
  await boot();
  assert.ok(baseUrl);
});

test('e2e: invalid service auth → 401', skip, async () => {
  const r = await request('GET', '/api/crm-integration/services', {
    headers: { 'X-Service-Key': 'wrong', 'X-Tenant-Id': String(TENANT_ID) },
  });
  assert.equal(r.status, 401);
});

test('e2e: missing tenant → 400', skip, async () => {
  const r = await request('GET', '/api/crm-integration/services', {
    headers: { 'X-Service-Key': SECRET },
  });
  assert.equal(r.status, 400);
});

test('e2e: valid auth lists services', skip, async () => {
  const r = await request('GET', '/api/crm-integration/services', {
    headers: { 'X-Service-Key': SECRET, 'X-Tenant-Id': String(TENANT_ID) },
  });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
  assert.ok(r.body.length >= 2);
});

test('e2e: create appointment + redis/db idempotency', skip, async () => {
  const body = {
    branch_id: fixtures.branch.id,
    service_id: fixtures.haircut.id,
    staff_id: fixtures.staff.id,
    date: '2027-08-02',
    time: '10:00',
    customer_name: 'E2E Guest',
    phone: '94773330001',
    idempotency_key: 'e2e-idem-1',
  };
  const headers = { 'X-Service-Key': SECRET, 'X-Tenant-Id': String(TENANT_ID) };
  const r1 = await request('POST', '/api/crm-integration/appointments', { headers, body });
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  assert.equal(r1.body.idempotent, false);
  assert.equal(r1.body.customer_notify, 'deferred_to_ai_turn');
  const id = r1.body.appointment.id;

  const r2 = await request('POST', '/api/crm-integration/appointments', { headers, body });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.idempotent, true);
  assert.equal(r2.body.appointment.id, id);

  const count = await fixtures.Appointment.count({ where: { tenant_id: TENANT_ID } });
  assert.equal(count, 1);
});

test('e2e: add services endpoint', skip, async () => {
  const appt = await fixtures.Appointment.findOne({ where: { tenant_id: TENANT_ID } });
  const headers = { 'X-Service-Key': SECRET, 'X-Tenant-Id': String(TENANT_ID) };
  const r = await request('POST', `/api/crm-integration/appointments/${appt.id}/services`, {
    headers,
    body: {
      add_service_ids: [fixtures.wax.id],
      idempotency_key: 'e2e-add-1',
    },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.appointment.id, appt.id);
  assert.equal(Number(r.body.total_amount), 5500);
  assert.equal(r.body.customer_notify, 'deferred_to_ai_turn');
});

test('e2e: cross-tenant appointment access → 404', skip, async () => {
  const appt = await fixtures.Appointment.findOne({ where: { tenant_id: TENANT_ID } });
  const r = await request('POST', `/api/crm-integration/appointments/${appt.id}/services`, {
    headers: { 'X-Service-Key': SECRET, 'X-Tenant-Id': String(OTHER_TENANT) },
    body: { add_service_ids: [fixtures.wax.id] },
  });
  assert.equal(r.status, 404);
});

test('e2e: duplicate create after failure does not leave orphans when forced at service layer', skip, async () => {
  const { createCrmAppointmentTransactional } = require('../crmAppointmentCreateService');
  const before = await fixtures.Appointment.count({ where: { tenant_id: TENANT_ID } });
  let failed = false;
  try {
    await createCrmAppointmentTransactional({
      tenantId: TENANT_ID,
      body: {
        branch_id: fixtures.branch.id,
        service_id: fixtures.haircut.id,
        staff_id: fixtures.staff.id,
        date: '2027-08-03',
        time: '11:00',
        customer_name: 'Fail Guest',
        phone: '94773330002',
        idempotency_key: 'e2e-fail-then-retry',
      },
      testHooks: { forceLinkFailure: true },
    });
  } catch (err) {
    failed = true;
    assert.equal(err.code, 'FORCE_LINK_FAILURE');
  }
  assert.equal(failed, true);
  assert.equal(
    await fixtures.Appointment.count({ where: { tenant_id: TENANT_ID } }),
    before,
  );
  const ok = await createCrmAppointmentTransactional({
    tenantId: TENANT_ID,
    body: {
      branch_id: fixtures.branch.id,
      service_id: fixtures.haircut.id,
      staff_id: fixtures.staff.id,
      date: '2027-08-03',
      time: '11:00',
      customer_name: 'Fail Guest',
      phone: '94773330002',
      idempotency_key: 'e2e-fail-then-retry',
    },
  });
  assert.equal(ok.idempotent, false);
  const again = await createCrmAppointmentTransactional({
    tenantId: TENANT_ID,
    body: {
      branch_id: fixtures.branch.id,
      service_id: fixtures.haircut.id,
      staff_id: fixtures.staff.id,
      date: '2027-08-03',
      time: '11:00',
      customer_name: 'Fail Guest',
      phone: '94773330002',
      idempotency_key: 'e2e-fail-then-retry',
    },
  });
  assert.equal(again.idempotent, true);
  assert.equal(again.appointment.id, ok.appointment.id);
});

test('e2e teardown', skip, async () => {
  if (server) await new Promise((r) => server.close(r));
  try {
    const { getRedis } = require('../../utils/redis');
    const redis = getRedis();
    if (redis) await redis.quit();
  } catch { /* ignore */ }
  if (sequelize) await sequelize.close();
});
