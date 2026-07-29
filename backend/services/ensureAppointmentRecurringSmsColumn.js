const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

/** Adds appointments.recurring_sms_sent_at when missing. Safe on every startup. */
async function ensureAppointmentRecurringSmsColumn() {
  try {
    const qi = sequelize.getQueryInterface();
    const table = await qi.describeTable('appointments');
    if (table.recurring_sms_sent_at) return;
    await qi.addColumn('appointments', 'recurring_sms_sent_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
    console.log('[migration] appointments.recurring_sms_sent_at added');
  } catch (err) {
    console.error('[migration] ensureAppointmentRecurringSmsColumn error:', err.message);
  }
}

module.exports = ensureAppointmentRecurringSmsColumn;
