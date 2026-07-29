const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

/** Adds recurring appointment columns when missing. Safe on every startup. */
async function ensureAppointmentRecurringSmsColumn() {
  try {
    const qi = sequelize.getQueryInterface();
    const table = await qi.describeTable('appointments');
    if (!table.recurring_sms_sent_at) {
      await qi.addColumn('appointments', 'recurring_sms_sent_at', {
        type: DataTypes.DATE,
        allowNull: true,
      });
      console.log('[migration] appointments.recurring_sms_sent_at added');
    }
    if (!table.recurring_next_date) {
      await qi.addColumn('appointments', 'recurring_next_date', {
        type: DataTypes.DATEONLY,
        allowNull: true,
      });
      console.log('[migration] appointments.recurring_next_date added');
    }
  } catch (err) {
    console.error('[migration] ensureAppointmentRecurringSmsColumn error:', err.message);
  }
}

module.exports = ensureAppointmentRecurringSmsColumn;
