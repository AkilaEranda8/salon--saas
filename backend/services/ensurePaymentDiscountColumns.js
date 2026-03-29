const { sequelize } = require('../config/database');

/** Adds payments.discount_id and payments.promo_discount when missing. */
async function ensurePaymentDiscountColumns() {
  try {
    const qi = sequelize.getQueryInterface();
    const table = await qi.describeTable('payments');
    if (!table.discount_id) {
      await sequelize.query(
        'ALTER TABLE payments ADD COLUMN discount_id INT NULL',
      );
      console.log('✓ Added payments.discount_id column');
    }
    if (!table.promo_discount) {
      await sequelize.query(
        'ALTER TABLE payments ADD COLUMN promo_discount DECIMAL(10,2) NOT NULL DEFAULT 0',
      );
      console.log('✓ Added payments.promo_discount column');
    }
  } catch (e) {
    const msg = e && e.message ? String(e.message) : '';
    if (/doesn't exist|no such table|Unknown table/i.test(msg)) return;
    throw e;
  }
}

module.exports = { ensurePaymentDiscountColumns };
