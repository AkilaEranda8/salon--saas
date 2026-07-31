'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { defaultWorkingHours } = require('../utils/staffSchedule');

async function ensureStaffScheduleColumns() {
  const qi = sequelize.getQueryInterface();
  try {
    const desc = await qi.describeTable('staff');
    if (!desc.working_hours) {
      await qi.addColumn('staff', 'working_hours', {
        type: DataTypes.JSON,
        allowNull: true,
        after: 'available_online',
      });
      console.log('[Schema] staff.working_hours added');
    }
  } catch (e) {
    console.warn('[Schema] staff.working_hours:', e.message);
  }

  try {
    const tables = await qi.showAllTables();
    const names = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name || '')).map((n) => String(n).toLowerCase());
    if (!names.includes('staff_off_days')) {
      await qi.createTable('staff_off_days', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        staff_id: { type: DataTypes.INTEGER, allowNull: false },
        date: { type: DataTypes.DATEONLY, allowNull: false },
        reason: { type: DataTypes.STRING(255), allowNull: true },
        tenant_id: { type: DataTypes.INTEGER, allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      });
      try {
        await qi.addIndex('staff_off_days', ['staff_id', 'date'], {
          unique: true,
          name: 'staff_off_days_staff_date_unique',
        });
      } catch (_) { /* ignore */ }
      console.log('[Schema] staff_off_days table created');
    }
  } catch (e) {
    console.warn('[Schema] staff_off_days:', e.message);
  }

  // Backfill null working_hours with default window
  try {
    const defaults = JSON.stringify(defaultWorkingHours()).replace(/'/g, "''");
    await sequelize.query(
      `UPDATE staff SET working_hours = '${defaults}' WHERE working_hours IS NULL`
    );
  } catch (e) {
    console.warn('[Schema] staff.working_hours backfill:', e.message);
  }
}

module.exports = ensureStaffScheduleColumns;
