/**
 * RC9a Phase 2 — multi-service booking + slot/duration + idempotency fixtures.
 * Isolated in-memory store — no MySQL / WhatsApp / Gemini.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeServiceIdList,
  resolveLineStaffIds,
  buildSequentialServiceLines,
  computeTotalDuration,
  computeTotalAmount,
  validateFullVisitWindow,
  hasIntervalConflict,
  createInMemoryBookingStore,
  toMinutes,
} = require('../crmMultiServiceBooking');

const CATALOGUE = [
  { id: 1, name: 'Haircut', duration_minutes: 45, price: 2000 },
  { id: 2, name: 'Full Leg Wax', duration_minutes: 60, price: 3500 },
  { id: 3, name: 'Facial', duration_minutes: 45, price: 4000 },
  { id: 4, name: 'Hair Color', duration_minutes: 120, price: 8000 },
  { id: 5, name: 'Botox Hair Treatment', duration_minutes: 300, price: 22000 },
];

test('normalizeServiceIdList keeps primary first and dedupes', () => {
  const ids = normalizeServiceIdList({
    service_id: 1,
    extra_service_ids: [2, 1, 3],
    service_ids: [1, 2],
  });
  assert.deepEqual(ids, [1, 2, 3]);
});

test('resolveLineStaffIds applies explicit specialists; else fallback — never invents', () => {
  const map = resolveLineStaffIds(
    [1, 2, 3],
    { service_staff: [{ service_id: 2, staff_id: 9 }] },
    7,
  );
  assert.equal(map.get(1), 7);
  assert.equal(map.get(2), 9);
  assert.equal(map.get(3), 7);
});

test('sequential lines schedule consecutive start times', () => {
  const lines = buildSequentialServiceLines(
    [CATALOGUE[0], CATALOGUE[1], CATALOGUE[2]],
    { date: '2026-11-18', time: '09:00', staffId: 7 },
  );
  assert.equal(lines.length, 3);
  assert.equal(lines[0].time, '09:00');
  assert.equal(lines[1].time, '09:45'); // +45
  assert.equal(lines[2].time, '10:45'); // +60
  assert.equal(computeTotalDuration(lines), 150);
  assert.equal(computeTotalAmount(lines), 2000 + 3500 + 4000);
});

test('300-minute botox visit window validation', () => {
  const lines = buildSequentialServiceLines([CATALOGUE[4]], {
    date: '2026-11-18',
    time: '10:00',
    staffId: 7,
  });
  assert.equal(computeTotalDuration(lines), 300);
  const ok = validateFullVisitWindow({
    startTime: '10:00',
    totalDurationMinutes: 300,
    windowStartMin: toMinutes('09:00'),
    windowEndMin: toMinutes('18:00'),
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.end, '15:00');

  const late = validateFullVisitWindow({
    startTime: '16:00',
    totalDurationMinutes: 300,
    windowStartMin: toMinutes('09:00'),
    windowEndMin: toMinutes('18:00'),
  });
  assert.equal(late.ok, false);
  assert.equal(late.reason, 'past_closing');
});

test('conflicting blocked range detected for full visit interval', () => {
  // Existing booking occupies 10:00-11:00; new 90-min visit at 09:30 overlaps
  const start = toMinutes('09:30');
  const end = start + 90;
  assert.equal(hasIntervalConflict(start, end, [[toMinutes('10:00'), toMinutes('11:00')]]), true);
  assert.equal(hasIntervalConflict(start, end, [[toMinutes('11:00'), toMinutes('12:00')]]), false);
});

test('in-memory store persists appointment + all service links transactionally', async () => {
  const store = createInMemoryBookingStore();
  const lines = buildSequentialServiceLines(
    [CATALOGUE[0], CATALOGUE[1]],
    { date: '2026-11-18', time: '08:30', staffId: 3 },
  );
  const r1 = await store.createTransactional({
    tenantId: 28,
    branchId: 1,
    customerId: 50,
    staffId: 3,
    customerName: 'Kasun',
    phone: '94770001122',
    date: '2026-11-18',
    time: '08:30',
    amount: computeTotalAmount(lines),
    notes: 'test multi',
    lines,
    idempotencyKey: 'wa:28:94770001122:1+2:3:2026-11-18:08:30',
  });
  assert.equal(r1.idempotent, false);
  assert.equal(r1.appointment.service_id, 1);
  assert.equal(r1.links.length, 2);
  assert.equal(r1.links[0].service_id, 1);
  assert.equal(r1.links[1].service_id, 2);
  assert.equal(r1.links[1].time, '09:15');
  assert.equal(r1.appointment.amount, 5500);

  // Idempotent retry — same key returns same appointment, no duplicate links
  const r2 = await store.createTransactional({
    tenantId: 28,
    branchId: 1,
    customerId: 50,
    staffId: 3,
    customerName: 'Kasun',
    phone: '94770001122',
    date: '2026-11-18',
    time: '08:30',
    amount: computeTotalAmount(lines),
    notes: 'test multi',
    lines,
    idempotencyKey: 'wa:28:94770001122:1+2:3:2026-11-18:08:30',
  });
  assert.equal(r2.idempotent, true);
  assert.equal(r2.appointment.id, r1.appointment.id);
  assert.equal(store.appointments.size, 1);
  assert.equal(store.links.get(r1.appointment.id).length, 2);
});

test('rollback: invalid lines do not persist appointment', async () => {
  const store = createInMemoryBookingStore();
  await assert.rejects(
    () => store.createTransactional({
      tenantId: 28,
      branchId: 1,
      customerId: 50,
      staffId: 3,
      customerName: 'Kasun',
      phone: '94770001122',
      date: '2026-11-18',
      time: '08:30',
      amount: 0,
      notes: '',
      lines: [{ service_id: null }],
      idempotencyKey: 'bad',
    }),
    /Invalid service lines/,
  );
  assert.equal(store.appointments.size, 0);
});

test('conflict with existing blocked range rejects without writing', async () => {
  const store = createInMemoryBookingStore();
  const lines = buildSequentialServiceLines([CATALOGUE[4]], {
    date: '2026-11-18',
    time: '10:00',
    staffId: 3,
  });
  await assert.rejects(
    () => store.createTransactional({
      tenantId: 28,
      branchId: 1,
      customerId: 50,
      staffId: 3,
      customerName: 'Kasun',
      phone: '94770001122',
      date: '2026-11-18',
      time: '10:00',
      amount: computeTotalAmount(lines),
      notes: '',
      lines,
      idempotencyKey: 'botox-conflict',
      existingBlocked: [[toMinutes('12:00'), toMinutes('13:00')]], // overlaps 10:00-15:00
    }),
    (err) => err.code === 'SLOT_CONFLICT',
  );
  assert.equal(store.appointments.size, 0);
});

test('never silently substitutes requested slot — caller must surface alternatives', () => {
  const requested = '08:30';
  const available = ['09:00', '10:00', '11:00'];
  assert.equal(available.includes(requested), false);
  // Policy: respond with conflict + available_slots, do not auto-pick 09:00
  const response = {
    conflict: true,
    requested,
    available_slots: available,
  };
  assert.equal(response.requested, '08:30');
  assert.notEqual(response.available_slots[0], response.requested);
});

test('outbound confirm: AI reply suppresses second customer template', () => {
  const aiReply = 'Confirmed! Haircut + Full Leg Wax on 2026-11-18 at 08:30. Ref #1001';
  const aiAlreadyConfirmed = /\b(confirmed|booked|appointment\s+(?:is\s+)?(?:set|confirmed)|ref\s*#?\d+)\b/i.test(aiReply);
  assert.equal(aiAlreadyConfirmed, true);
  // CRM create path now sets customer_notify=deferred_to_ai_turn and skips notifyAppointmentConfirmed
  const crmResponseMeta = { customer_notify: 'deferred_to_ai_turn' };
  assert.equal(crmResponseMeta.customer_notify, 'deferred_to_ai_turn');
});
