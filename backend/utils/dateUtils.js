/**
 * Sri Lanka timezone date helpers (Asia/Colombo = UTC+05:30).
 * The Node.js runtime runs in UTC; these helpers return the correct
 * local SL date string for database comparisons.
 */

const SL_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5h 30m in milliseconds

/** Returns today's date in Sri Lanka as YYYY-MM-DD */
const slToday = () => new Date(Date.now() + SL_OFFSET_MS).toISOString().slice(0, 10);

/** Returns current month in Sri Lanka as YYYY-MM */
const slThisMonth = () => new Date(Date.now() + SL_OFFSET_MS).toISOString().slice(0, 7);

/** Returns current SL date + N days as YYYY-MM-DD */
const slDatePlusDays = (days) =>
  new Date(Date.now() + SL_OFFSET_MS + days * 86400000).toISOString().slice(0, 10);

/** Current instant as a Date whose UTC getters reflect Asia/Colombo local time */
const slNow = () => new Date(Date.now() + SL_OFFSET_MS);

const pad2 = (n) => String(n).padStart(2, '0');

/** HH:MM:SS in Sri Lanka for the given slNow()-style Date (default: now) */
const slTimeString = (d = slNow()) =>
  `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;

/** YYYY-MM-DD in Sri Lanka for the given slNow()-style Date (default: now) */
const slDateString = (d = slNow()) => d.toISOString().slice(0, 10);

/**
 * Normalize any TIME / Date / ISO / HH:MM(:SS) value to salon wall-clock HH:MM.
 *
 * MySQL TIME is wall-clock (no zone). Drivers often return it as a Date whose
 * UTC hours/minutes ARE the clock (e.g. 16:00 → 1970-01-01T16:00:00.000Z).
 * Do NOT apply Asia/Colombo offset there — that wrongly turns 16:00 into 21:30
 * and breaks staff occupancy (120 min at 4:00 looked free until ~9:30).
 *
 * Full ISO datetimes (with "T") are real instants and ARE shifted to Colombo.
 */
function normalizeWallClockTime(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())}`;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const shifted = new Date(d.getTime() + SL_OFFSET_MS);
      return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
    }
  }
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return '';
  }
  return `${pad2(h)}:${pad2(min)}`;
}

/** Sunday=0 … Saturday=6 for a YYYY-MM-DD calendar date (timezone-safe). */
function weekdaySun0(dateStr) {
  const m = String(dateStr || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

function slNowParts() {
  const d = slNow();
  return {
    date: slDateString(d),
    time: slTimeString(d).slice(0, 5),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

module.exports = {
  slToday,
  slThisMonth,
  slDatePlusDays,
  slNow,
  slTimeString,
  slDateString,
  SL_OFFSET_MS,
  normalizeWallClockTime,
  weekdaySun0,
  slNowParts,
};
