const { sequelize } = require('../config/database');

async function ensureAppointmentReminderColumn() {
  try {
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable('appointments');
    const DataTypes = require('sequelize').DataTypes;

    if (!tableDesc.reminder_15_sent_at) {
      await qi.addColumn('appointments', 'reminder_15_sent_at', {
        type: DataTypes.DATE,
        allowNull: true,
        after: 'status',
      });
      console.log('[migration] appointments.reminder_15_sent_at added');
    }

    if (!tableDesc.reminder_before_start_sent_at) {
      await qi.addColumn('appointments', 'reminder_before_start_sent_at', {
        type: DataTypes.DATE,
        allowNull: true,
        after: 'reminder_15_sent_at',
      });
      console.log('[migration] appointments.reminder_before_start_sent_at added');
    }

    if (!tableDesc.reminder_at_end_sent_at) {
      await qi.addColumn('appointments', 'reminder_at_end_sent_at', {
        type: DataTypes.DATE,
        allowNull: true,
        after: 'reminder_before_start_sent_at',
      });
      console.log('[migration] appointments.reminder_at_end_sent_at added');
    }
  } catch (err) {
    console.error('[migration] ensureAppointmentReminderColumn error:', err.message);
  }
}

module.exports = ensureAppointmentReminderColumn;
