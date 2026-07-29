'use strict';

const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

/** Adds notification_settings.sms_provider when missing. Safe on every startup. */
async function ensureSmsProviderColumn() {
  try {
    const qi = sequelize.getQueryInterface();
    const table = await qi.describeTable('notification_settings');
    if (table.sms_provider) return;
    await qi.addColumn('notification_settings', 'sms_provider', {
      type: DataTypes.STRING(32),
      allowNull: true,
      defaultValue: 'notify_lk',
    });
    console.log('[migration] notification_settings.sms_provider added');
  } catch (err) {
    console.error('[migration] ensureSmsProviderColumn error:', err.message);
  }
}

module.exports = ensureSmsProviderColumn;
