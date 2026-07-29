'use strict';
const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

async function addIfMissing(table, column, definition) {
  const qi = sequelize.getQueryInterface();
  try {
    await qi.addColumn(table, column, definition);
    console.log(`[Schema] Added ${table}.${column}`);
  } catch (e) {
    if (!/duplicate column/i.test(e.message) && e.original?.code !== 'ER_DUP_FIELDNAME') {
      console.warn(`[Schema] ${table}.${column}:`, e.message);
    }
  }
}

async function ensureWalkInNotificationColumns() {
  await addIfMissing('notification_settings', 'walkin_checkin_whatsapp', {
    type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false,
  });
  await addIfMissing('notification_settings', 'walkin_serving_whatsapp', {
    type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false,
  });
  await addIfMissing('notification_settings', 'walkin_completed_whatsapp', {
    type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false,
  });
  await addIfMissing('notification_settings', 'walkin_checkin_sms', {
    type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false,
  });
  await addIfMissing('notification_settings', 'walkin_serving_sms', {
    type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false,
  });
  await addIfMissing('notification_settings', 'walkin_completed_sms', {
    type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false,
  });
  await addIfMissing('notification_settings', 'appt_completed_sms', {
    type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false,
  });
  await addIfMissing('notification_settings', 'appt_completed_whatsapp', {
    type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false,
  });
  await addIfMissing('notification_settings', 'recurring_reminder_sms', {
    type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false,
  });
  await addIfMissing('notification_settings', 'recurring_reminder_whatsapp', {
    type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false,
  });

  await sequelize.query(`
    ALTER TABLE notification_logs MODIFY COLUMN event_type ENUM(
      'appointment_confirmed','appointment_completed','payment_receipt','loyalty_points',
      'walk_in_checkin','walk_in_serving','walk_in_completed',
      'recurring_reminder',
      'test','review_request','password_reset','custom_marketing'
    ) NOT NULL
  `).catch((e) => console.warn('[Schema] notification_logs.event_type:', e.message));
}

module.exports = ensureWalkInNotificationColumns;
