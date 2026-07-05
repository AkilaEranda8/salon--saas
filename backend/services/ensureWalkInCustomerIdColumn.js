const { sequelize } = require('../config/database');

/** Links walk-in queue entries to customers (for package redemption). */
async function ensureWalkInCustomerIdColumn() {
  try {
    const qi = sequelize.getQueryInterface();
    const table = await qi.describeTable('walk_in_queue');
    if (table.customer_id) return;
    await sequelize.query(
      'ALTER TABLE walk_in_queue ADD COLUMN customer_id INT NULL',
    );
    console.log('✓ Added walk_in_queue.customer_id column');
  } catch (e) {
    const msg = e && e.message ? String(e.message) : '';
    if (/doesn't exist|no such table|Unknown table|Duplicate column/i.test(msg)) return;
    throw e;
  }
}

module.exports = { ensureWalkInCustomerIdColumn };
