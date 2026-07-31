const { sequelize } = require('../config/database');

/** Adds customers.loyalty_mark for special groups (e.g. reduced_50). Safe on every startup. */
async function ensureCustomerLoyaltyMarkColumn() {
  try {
    const qi = sequelize.getQueryInterface();
    const table = await qi.describeTable('customers');
    if (!table.loyalty_mark) {
      await sequelize.query(
        "ALTER TABLE customers ADD COLUMN loyalty_mark VARCHAR(40) NULL COMMENT 'Special loyalty group e.g. reduced_50'"
      );
      console.log('✓ Added customers.loyalty_mark column');
    }

    // Backfill from existing -50 adjust ledger entries
    await sequelize.query(`
      UPDATE customers c
      INNER JOIN (
        SELECT DISTINCT customer_id
        FROM loyalty_transactions
        WHERE type = 'adjust' AND points = -50
      ) t ON t.customer_id = c.id
      SET c.loyalty_mark = 'reduced_50'
      WHERE c.loyalty_mark IS NULL OR c.loyalty_mark = ''
    `).catch(() => {});
  } catch (e) {
    const msg = e && e.message ? String(e.message) : '';
    if (/doesn't exist|no such table|Unknown table/i.test(msg)) return;
    throw e;
  }
}

module.exports = { ensureCustomerLoyaltyMarkColumn };
