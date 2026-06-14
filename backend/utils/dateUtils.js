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

module.exports = {
  slToday,
  slThisMonth,
  slDatePlusDays,
  slNow,
  slTimeString,
  slDateString,
  SL_OFFSET_MS,
};
