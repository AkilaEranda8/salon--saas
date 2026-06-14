const { sequelize } = require('../config/database');

async function ensureWalkInReminderColumns() {
  try {
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable('walk_in_queue');
    const DataTypes = require('sequelize').DataTypes;

    if (!tableDesc.serve_start_time) {
      await qi.addColumn('walk_in_queue', 'serve_start_time', {
        type: DataTypes.TIME,
        allowNull: true,
        after: 'check_in_time',
      });
      console.log('[migration] walk_in_queue.serve_start_time added');
    }

    if (!tableDesc.reminder_before_start_sent_at) {
      await qi.addColumn('walk_in_queue', 'reminder_before_start_sent_at', {
        type: DataTypes.DATE,
        allowNull: true,
        after: 'status',
      });
      console.log('[migration] walk_in_queue.reminder_before_start_sent_at added');
    }

    if (!tableDesc.reminder_15_sent_at) {
      await qi.addColumn('walk_in_queue', 'reminder_15_sent_at', {
        type: DataTypes.DATE,
        allowNull: true,
        after: 'reminder_before_start_sent_at',
      });
      console.log('[migration] walk_in_queue.reminder_15_sent_at added');
    }

    if (!tableDesc.reminder_at_end_sent_at) {
      await qi.addColumn('walk_in_queue', 'reminder_at_end_sent_at', {
        type: DataTypes.DATE,
        allowNull: true,
        after: 'reminder_15_sent_at',
      });
      console.log('[migration] walk_in_queue.reminder_at_end_sent_at added');
    }
  } catch (err) {
    console.error('[migration] ensureWalkInReminderColumns error:', err.message);
  }
}

module.exports = ensureWalkInReminderColumns;
