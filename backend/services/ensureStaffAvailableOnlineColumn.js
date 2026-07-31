'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** Adds staff.available_online — controls WordPress / public booking visibility. */
async function ensureStaffAvailableOnlineColumn() {
  const qi = sequelize.getQueryInterface();
  try {
    const desc = await qi.describeTable('staff');
    if (!desc.available_online) {
      await qi.addColumn('staff', 'available_online', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        after: 'is_active',
      });
      console.log('[Schema] staff.available_online added');
    }
    await sequelize.query(
      'UPDATE staff SET available_online = 1 WHERE available_online IS NULL'
    );
  } catch (e) {
    console.warn('[Schema] staff.available_online:', e.message);
  }
}

module.exports = ensureStaffAvailableOnlineColumn;
