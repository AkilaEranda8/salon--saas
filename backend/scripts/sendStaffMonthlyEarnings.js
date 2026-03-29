/**
 * Month-end cron: email each staff member a PDF earnings report for the previous month.
 * Requires SMTP in Notification settings or .env (EMAIL_USER / EMAIL_PASS).
 *
 *   node scripts/sendStaffMonthlyEarnings.js
 *
 * Or a specific month:
 *   STAFF_EARNINGS_YEAR=2026 STAFF_EARNINGS_MONTH=3 node scripts/sendStaffMonthlyEarnings.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('../models');

const { runStaffMonthlyEarningsEmails } = require('../services/sendStaffMonthlyEarningsEmails');

(async () => {
  try {
    const year = process.env.STAFF_EARNINGS_YEAR ? parseInt(process.env.STAFF_EARNINGS_YEAR, 10) : null;
    const month = process.env.STAFF_EARNINGS_MONTH ? parseInt(process.env.STAFF_EARNINGS_MONTH, 10) : null;
    const out = await runStaffMonthlyEarningsEmails({
      year: Number.isFinite(year) ? year : undefined,
      month: Number.isFinite(month) ? month : undefined,
      userRole: 'superadmin',
      userBranchId: null,
    });
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
