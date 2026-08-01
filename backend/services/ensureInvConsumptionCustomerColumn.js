const { sequelize } = require('../config/database');

/** Optional customer link on inventory usage records. */
async function ensureInvConsumptionCustomerColumn() {
  try {
    const qi = sequelize.getQueryInterface();
    const table = await qi.describeTable('inv_consumptions');
    if (table.customer_id) return;
    await sequelize.query(
      'ALTER TABLE inv_consumptions ADD COLUMN customer_id INT NULL AFTER staff_id',
    );
    console.log('✓ Added inv_consumptions.customer_id column');
  } catch (e) {
    const msg = e && e.message ? String(e.message) : '';
    if (/doesn't exist|no such table|Unknown table|Duplicate column/i.test(msg)) return;
    throw e;
  }
}

module.exports = { ensureInvConsumptionCustomerColumn };
