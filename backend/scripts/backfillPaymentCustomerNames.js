/**
 * Backfill payments.customer_name from linked customers when empty/Walk-in.
 * Run: node scripts/backfillPaymentCustomerNames.js
 */
const { sequelize } = require('../config/database');

(async () => {
  const [result] = await sequelize.query(`
    UPDATE payments p
    INNER JOIN customers c ON c.id = p.customer_id
    SET p.customer_name = c.name
    WHERE p.customer_id IS NOT NULL
      AND (
        p.customer_name IS NULL
        OR TRIM(p.customer_name) = ''
        OR LOWER(TRIM(p.customer_name)) = 'walk-in'
      )
      AND c.name IS NOT NULL
      AND TRIM(c.name) <> ''
  `);
  console.log('[backfill] payment customer_name updated:', result?.affectedRows ?? result);
  await sequelize.close();
  process.exit(0);
})().catch(async (err) => {
  console.error(err);
  try { await sequelize.close(); } catch (_) {}
  process.exit(1);
});
