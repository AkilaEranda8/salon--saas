/**
 * CRM multi-service booking helpers (ai_engine → /crm-integration/appointments).
 *
 * Backend already has appointment_services; CRM create historically wrote one row.
 * These helpers build sequential service lines, total duration/price, and
 * validate that a requested start fits salon/staff window for the FULL visit.
 *
 * Pure functions are unit-tested without MySQL.
 */
'use strict';

function toMinutes(hhmm) {
  const s = String(hhmm || '').substring(0, 5);
  const [h, m] = s.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function toHHMM(mins) {
  const m = Math.max(0, Math.floor(Number(mins) || 0));
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Normalize inbound CRM body into ordered unique service ids.
 * Accepts: service_id, service_ids[], extra_service_ids[], services[{id|service_id}]
 */
function normalizeServiceIdList(body = {}) {
  const out = [];
  const push = (raw) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) return;
    if (!out.includes(n)) out.push(n);
  };

  if (Array.isArray(body.service_ids)) body.service_ids.forEach(push);
  if (Array.isArray(body.extra_service_ids)) body.extra_service_ids.forEach(push);
  if (Array.isArray(body.services)) {
    body.services.forEach((s) => {
      if (s && typeof s === 'object') push(s.service_id ?? s.serviceId ?? s.id);
      else push(s);
    });
  }
  if (body.service_id != null) {
    // Ensure primary is first
    const primary = Number(body.service_id);
    if (Number.isInteger(primary) && primary > 0) {
      const rest = out.filter((id) => id !== primary);
      out.length = 0;
      out.push(primary, ...rest);
    }
  }
  return out;
}

/**
 * Resolve per-service staff ids from CRM body.
 * Salon UI uses service_staff / services[{staff_id}]; CRM historically stamped one staff.
 * Policy: never invent specialists — only apply explicit per-line staff, else fallbackStaffId.
 *
 * @param {number[]} orderedServiceIds
 * @param {object} body
 * @param {number|null} fallbackStaffId
 * @returns {Map<number, number|null>}
 */
function resolveLineStaffIds(orderedServiceIds = [], body = {}, fallbackStaffId = null) {
  const map = new Map();
  const fallback = fallbackStaffId != null && Number.isInteger(Number(fallbackStaffId))
    ? Number(fallbackStaffId)
    : null;

  const put = (sid, staffRaw) => {
    const serviceId = Number(sid);
    if (!Number.isInteger(serviceId) || serviceId <= 0) return;
    const staffNum = Number(staffRaw);
    if (Number.isInteger(staffNum) && staffNum > 0) map.set(serviceId, staffNum);
  };

  if (Array.isArray(body.service_staff)) {
    body.service_staff.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      put(row.service_id ?? row.serviceId ?? row.id, row.staff_id ?? row.staffId);
    });
  } else if (body.service_staff && typeof body.service_staff === 'object') {
    Object.entries(body.service_staff).forEach(([k, v]) => put(k, v));
  }

  if (Array.isArray(body.services)) {
    body.services.forEach((s) => {
      if (!s || typeof s !== 'object') return;
      put(s.service_id ?? s.serviceId ?? s.id, s.staff_id ?? s.staffId);
    });
  }

  for (const sid of orderedServiceIds) {
    if (!map.has(Number(sid))) map.set(Number(sid), fallback);
  }
  return map;
}

/**
 * Build sequential lines: each service starts when the previous ends.
 * @param {Array<{id:number, duration_minutes?:number, price?:number, name?:string}>} serviceRows
 * @param {{ date:string, time:string, staffId:number|null, lineStaffIds?:Map<number,number|null> }} opts
 */
function buildSequentialServiceLines(serviceRows, opts = {}) {
  const dateKey = String(opts.date || '').slice(0, 10);
  const startMin = toMinutes(opts.time);
  if (startMin == null) {
    const err = new Error('Invalid start time');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  let cursor = startMin;
  const lines = [];
  for (let i = 0; i < (serviceRows || []).length; i += 1) {
    const s = serviceRows[i];
    const dur = Math.max(5, parseInt(s.duration_minutes, 10) || 30);
    const price = Number(s.price) || 0;
    const sid = Number(s.id);
    let lineStaff = opts.staffId != null ? Number(opts.staffId) : null;
    if (opts.lineStaffIds && typeof opts.lineStaffIds.get === 'function') {
      const override = opts.lineStaffIds.get(sid);
      if (override != null) lineStaff = Number(override);
    }
    lines.push({
      service_id: sid,
      name: s.name || null,
      staff_id: lineStaff,
      date: dateKey,
      time: toHHMM(cursor),
      sort_order: i,
      duration_minutes: dur,
      price,
    });
    cursor += dur;
  }
  return lines;
}

function computeTotalDuration(lines = []) {
  return (lines || []).reduce((sum, l) => sum + Math.max(5, parseInt(l.duration_minutes, 10) || 30), 0);
}

function computeTotalAmount(lines = []) {
  return (lines || []).reduce((sum, l) => sum + (Number(l.price) || 0), 0);
}

/**
 * Ensure full visit [start, start+total) fits inside [windowStart, windowEnd).
 * Does NOT invent alternate slots — returns ok:false with reason.
 */
function validateFullVisitWindow({ startTime, totalDurationMinutes, windowStartMin, windowEndMin }) {
  const start = toMinutes(startTime);
  const total = Math.max(5, parseInt(totalDurationMinutes, 10) || 30);
  if (start == null) {
    return { ok: false, reason: 'invalid_start', requested: startTime, total_minutes: total };
  }
  const end = start + total;
  if (windowStartMin != null && start < windowStartMin) {
    return {
      ok: false,
      reason: 'before_open',
      requested: toHHMM(start),
      end: toHHMM(end),
      total_minutes: total,
    };
  }
  if (windowEndMin != null && end > windowEndMin) {
    return {
      ok: false,
      reason: 'past_closing',
      requested: toHHMM(start),
      end: toHHMM(end),
      total_minutes: total,
      window_end: toHHMM(windowEndMin),
    };
  }
  return {
    ok: true,
    requested: toHHMM(start),
    end: toHHMM(end),
    total_minutes: total,
  };
}

/**
 * Detect overlapping blocked ranges for [start, end).
 * ranges: Array<[startMin, endMin]>
 */
function hasIntervalConflict(startMin, endMin, blockedRanges = []) {
  return (blockedRanges || []).some(([bStart, bEnd]) => startMin < bEnd && endMin > bStart);
}

/**
 * Validate each service line against its own staff working window + blocked ranges.
 * Does NOT invent alternate starts — returns ok:false with conflict details.
 *
 * @param {Array<{service_id:number, staff_id:number|null, time:string, duration_minutes:number}>} lines
 * @param {Map<number, {startMin:number, endMin:number, closed?:boolean}>} staffWindows — staffId → day window
 * @param {Map<number, Array<[number,number]>>} blockedByStaff — staffId → blocked ranges
 */
function validatePerLineAvailability(lines = [], staffWindows = new Map(), blockedByStaff = new Map()) {
  const conflicts = [];
  for (const line of lines || []) {
    const staffId = line.staff_id != null ? Number(line.staff_id) : null;
    const start = toMinutes(line.time);
    const dur = Math.max(5, parseInt(line.duration_minutes, 10) || 30);
    if (start == null) {
      conflicts.push({
        service_id: line.service_id,
        staff_id: staffId,
        reason: 'invalid_start',
        time: line.time,
      });
      continue;
    }
    const end = start + dur;
    if (staffId == null || !Number.isInteger(staffId) || staffId <= 0) {
      conflicts.push({
        service_id: line.service_id,
        staff_id: staffId,
        reason: 'missing_staff',
        time: toHHMM(start),
        end: toHHMM(end),
      });
      continue;
    }
    const win = staffWindows.get(staffId);
    if (!win || win.closed) {
      conflicts.push({
        service_id: line.service_id,
        staff_id: staffId,
        reason: 'staff_closed',
        time: toHHMM(start),
        end: toHHMM(end),
      });
      continue;
    }
    if (start < win.startMin || end > win.endMin) {
      conflicts.push({
        service_id: line.service_id,
        staff_id: staffId,
        reason: 'outside_hours',
        time: toHHMM(start),
        end: toHHMM(end),
        window_end: toHHMM(win.endMin),
      });
      continue;
    }
    const blocked = blockedByStaff.get(staffId) || [];
    if (hasIntervalConflict(start, end, blocked)) {
      conflicts.push({
        service_id: line.service_id,
        staff_id: staffId,
        reason: 'overlap',
        time: toHHMM(start),
        end: toHHMM(end),
      });
    }
  }
  return {
    ok: conflicts.length === 0,
    conflicts,
  };
}

/**
 * Filter candidate start times so EVERY line's staff is free for their sequential segment.
 * Never picks a substitute — caller presents candidates to the customer.
 *
 * @param {string[]} candidateStarts
 * @param {Array<{duration_minutes:number, staff_id:number|null}>} servicePlan — ordered durations + staff
 * @param {Map<number, {startMin:number, endMin:number, closed?:boolean}>} staffWindows
 * @param {Map<number, Array<[number,number]>>} blockedByStaff
 */
function filterStartsForPerLineStaff(
  candidateStarts = [],
  servicePlan = [],
  staffWindows = new Map(),
  blockedByStaff = new Map(),
) {
  const out = [];
  for (const raw of candidateStarts || []) {
    const startKey = String(raw || '').slice(0, 5);
    const startMin = toMinutes(startKey);
    if (startMin == null) continue;
    let cursor = startMin;
    let ok = true;
    for (const step of servicePlan || []) {
      const dur = Math.max(5, parseInt(step.duration_minutes, 10) || 30);
      const staffId = step.staff_id != null ? Number(step.staff_id) : null;
      const end = cursor + dur;
      if (staffId == null || !Number.isInteger(staffId)) {
        ok = false;
        break;
      }
      const win = staffWindows.get(staffId);
      if (!win || win.closed || cursor < win.startMin || end > win.endMin) {
        ok = false;
        break;
      }
      if (hasIntervalConflict(cursor, end, blockedByStaff.get(staffId) || [])) {
        ok = false;
        break;
      }
      cursor = end;
    }
    if (ok) out.push(startKey);
  }
  return out;
}

/**
 * In-memory fixture store for deterministic tests (no MySQL).
 * Mimics Appointment + appointment_services persistence + idempotency.
 */
function createInMemoryBookingStore() {
  let nextApptId = 1000;
  let nextLinkId = 1;
  const appointments = new Map();
  const links = new Map(); // apptId -> rows[]
  const idem = new Map();

  return {
    appointments,
    links,
    idem,
    async createTransactional({
      tenantId,
      branchId,
      customerId,
      staffId,
      customerName,
      phone,
      date,
      time,
      amount,
      notes,
      lines,
      idempotencyKey,
      existingBlocked = [],
    }) {
      if (idempotencyKey && idem.has(idempotencyKey)) {
        const id = idem.get(idempotencyKey);
        return { appointment: appointments.get(id), links: links.get(id) || [], idempotent: true };
      }

      const start = toMinutes(time);
      const total = computeTotalDuration(lines);
      const end = start + total;
      if (hasIntervalConflict(start, end, existingBlocked)) {
        const err = new Error('Selected time overlaps an existing booking');
        err.code = 'SLOT_CONFLICT';
        throw err;
      }

      // Simulate rollback: if any line missing service_id, throw before persist
      if (!(lines || []).length || lines.some((l) => !l.service_id)) {
        const err = new Error('Invalid service lines');
        err.code = 'BAD_REQUEST';
        throw err;
      }

      const id = nextApptId++;
      const appt = {
        id,
        tenant_id: tenantId,
        branch_id: branchId,
        customer_id: customerId,
        staff_id: staffId,
        service_id: lines[0].service_id,
        customer_name: customerName,
        phone,
        date,
        time,
        amount,
        status: 'confirmed',
        notes,
      };
      const linkRows = lines.map((l) => ({
        id: nextLinkId++,
        appointment_id: id,
        service_id: l.service_id,
        staff_id: l.staff_id ?? staffId,
        date: l.date || date,
        time: l.time || time,
        sort_order: l.sort_order ?? 0,
        duration_minutes: l.duration_minutes,
        price: l.price,
      }));

      appointments.set(id, appt);
      links.set(id, linkRows);
      if (idempotencyKey) idem.set(idempotencyKey, id);
      return { appointment: appt, links: linkRows, idempotent: false };
    },
  };
}

module.exports = {
  toMinutes,
  toHHMM,
  normalizeServiceIdList,
  resolveLineStaffIds,
  buildSequentialServiceLines,
  computeTotalDuration,
  computeTotalAmount,
  validateFullVisitWindow,
  hasIntervalConflict,
  validatePerLineAvailability,
  filterStartsForPerLineStaff,
  createInMemoryBookingStore,
};
