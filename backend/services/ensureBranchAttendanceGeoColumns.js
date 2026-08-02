const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** Branch GPS + radius for attendance geofencing */
async function ensureBranchAttendanceGeoColumns() {
  try {
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable('branches');

    if (!tableDesc.latitude) {
      await qi.addColumn('branches', 'latitude', {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
        after: 'address',
      });
      console.log('[migration] branches.latitude column added');
    }
    if (!tableDesc.longitude) {
      await qi.addColumn('branches', 'longitude', {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
        after: 'latitude',
      });
      console.log('[migration] branches.longitude column added');
    }
    if (!tableDesc.attendance_radius_m) {
      await qi.addColumn('branches', 'attendance_radius_m', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 150,
        after: 'longitude',
      });
      console.log('[migration] branches.attendance_radius_m column added');
    }
  } catch (err) {
    console.error('[migration] ensureBranchAttendanceGeoColumns error:', err.message);
  }
}

module.exports = ensureBranchAttendanceGeoColumns;
