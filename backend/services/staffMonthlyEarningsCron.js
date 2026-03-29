'use strict';

const cron = require('node-cron');
const { runStaffMonthlyEarningsEmails } = require('./sendStaffMonthlyEarningsEmails');

/**
 * Schedule automatic staff earnings PDF emails for the **previous** calendar month.
 * Runs once per month (default: 1st day, 08:00 Asia/Colombo).
 *
 * **On by default.** Disable with: STAFF_MONTHLY_EARNINGS_CRON=false (or 0, no, off)
 * Optional: STAFF_MONTHLY_EARNINGS_TZ, STAFF_MONTHLY_EARNINGS_HOUR, STAFF_MONTHLY_EARNINGS_MINUTE
 */
function startStaffMonthlyEarningsCron() {
  const tz = process.env.STAFF_MONTHLY_EARNINGS_TZ || 'Asia/Colombo';
  const hour = Math.min(23, Math.max(0, parseInt(process.env.STAFF_MONTHLY_EARNINGS_HOUR || '8', 10) || 8));
  const minute = Math.min(59, Math.max(0, parseInt(process.env.STAFF_MONTHLY_EARNINGS_MINUTE || '0', 10) || 0));
  // minute hour day-of-month month day-of-week — 1st of every month
  const pattern = `${minute} ${hour} 1 * *`;

  const task = cron.schedule(
    pattern,
    async () => {
      console.log('[Cron] Staff monthly earnings emails (previous month)…');
      try {
        const out = await runStaffMonthlyEarningsEmails({
          userRole: 'superadmin',
          userBranchId: null,
        });
        console.log('[Cron] Staff monthly earnings:', JSON.stringify(out.summary));
      } catch (err) {
        console.error('[Cron] Staff monthly earnings failed:', err.message);
      }
    },
    { timezone: tz },
  );

  const next = typeof task.getNextRun === 'function' ? task.getNextRun() : null;
  console.log(`✓ Staff monthly earnings cron: ${pattern} (${tz}) — emails previous month’s PDFs`);
  if (next) console.log(`  → Next scheduled run: ${next.toISOString()}`);
}

/** Cron runs unless explicitly turned off (empty / unset = ON). */
function isCronEnabled() {
  const v = String(process.env.STAFF_MONTHLY_EARNINGS_CRON ?? '').trim().toLowerCase();
  if (!v) return true;
  if (['false', '0', 'no', 'off'].includes(v)) return false;
  return true;
}

module.exports = { startStaffMonthlyEarningsCron, isCronEnabled };
