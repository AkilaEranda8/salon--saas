'use strict';

/** Default Mon–Sun 09:00–18:00 (matches previous public booking window). */
function defaultWorkingHours() {
  const day = { closed: false, start: '09:00', end: '18:00' };
  return {
    0: { ...day },
    1: { ...day },
    2: { ...day },
    3: { ...day },
    4: { ...day },
    5: { ...day },
    6: { ...day },
  };
}

function parseHHMM(value) {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

function toHHMM(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function normalizeDayHours(raw) {
  if (!raw || typeof raw !== 'object') {
    return { closed: false, start: '09:00', end: '18:00' };
  }
  if (raw.closed === true || raw.closed === 'true' || raw.closed === 1) {
    return { closed: true, start: null, end: null };
  }
  const start = parseHHMM(raw.start) != null ? String(raw.start).trim().slice(0, 5) : '09:00';
  const end = parseHHMM(raw.end) != null ? String(raw.end).trim().slice(0, 5) : '18:00';
  const startMin = parseHHMM(start);
  const endMin = parseHHMM(end);
  if (startMin == null || endMin == null || endMin <= startMin) {
    return { closed: false, start: '09:00', end: '18:00' };
  }
  return { closed: false, start, end };
}

function normalizeWorkingHours(input) {
  const defaults = defaultWorkingHours();
  if (!input || typeof input !== 'object') return defaults;
  const out = {};
  for (let d = 0; d <= 6; d += 1) {
    const key = String(d);
    out[key] = normalizeDayHours(input[key] ?? input[d] ?? defaults[key]);
  }
  return out;
}

/**
 * Resolve staff working window for a YYYY-MM-DD date.
 * @returns {{ closed: boolean, startMin: number, endMin: number, reason?: string }}
 */
function resolveStaffDayWindow(workingHours, dateStr) {
  const hours = normalizeWorkingHours(workingHours);
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return { closed: true, startMin: 0, endMin: 0, reason: 'Invalid date' };
  }
  const weekday = String(d.getDay()); // 0=Sun … 6=Sat
  const day = hours[weekday] || { closed: false, start: '09:00', end: '18:00' };
  if (day.closed) {
    return { closed: true, startMin: 0, endMin: 0, reason: 'Staff day off (weekly)' };
  }
  const startMin = parseHHMM(day.start) ?? 9 * 60;
  const endMin = parseHHMM(day.end) ?? 18 * 60;
  if (endMin <= startMin) {
    return { closed: true, startMin: 0, endMin: 0, reason: 'Invalid working hours' };
  }
  return { closed: false, startMin, endMin };
}

function normalizeOffDayDates(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const item of input) {
    let date = '';
    let reason = null;
    if (typeof item === 'string') {
      date = item.trim();
    } else if (item && typeof item === 'object') {
      date = String(item.date || '').trim();
      reason = item.reason != null ? String(item.reason).trim().slice(0, 255) || null : null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || seen.has(date)) continue;
    seen.add(date);
    out.push({ date, reason });
  }
  return out;
}

module.exports = {
  defaultWorkingHours,
  parseHHMM,
  toHHMM,
  normalizeWorkingHours,
  normalizeDayHours,
  resolveStaffDayWindow,
  normalizeOffDayDates,
};
