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

module.exports = { slToday, slThisMonth, slDatePlusDays };
