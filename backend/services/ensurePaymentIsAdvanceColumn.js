const { sequelize } = require('../config/database');

/** Adds payments.is_advance when missing. Safe on every startup. */
async function ensurePaymentIsAdvanceColumn() {
  try {
    const qi = sequelize.getQueryInterface();
    const table = await qi.describeTable('payments');
    if (table.is_advance) return;
    await sequelize.query(
      'ALTER TABLE payments ADD COLUMN is_advance TINYINT(1) NOT NULL DEFAULT 0'
    );
    console.log('✓ Added payments.is_advance column');

    // Mark likely advance rows (booking deposit: no commission, linked to appointment)
    await sequelize.query(`
      UPDATE payments
      SET is_advance = 1
      WHERE is_advance = 0
        AND appointment_id IS NOT NULL
        AND commission_amount = 0
        AND (
          EXISTS (
            SELECT 1 FROM appointments a
            WHERE a.id = payments.appointment_id
              AND a.notes LIKE '%Advance paid:%'
          )
          OR (
            SELECT COUNT(*) FROM payments p2
            WHERE p2.appointment_id = payments.appointment_id
          ) > 1
        )
    `).catch(() => {});
  } catch (e) {
    const msg = e && e.message ? String(e.message) : '';
    if (/doesn't exist|no such table|Unknown table/i.test(msg)) return;
    throw e;
  }
}

module.exports = { ensurePaymentIsAdvanceColumn };
