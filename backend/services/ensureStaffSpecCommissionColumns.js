const { sequelize } = require('../config/database');

async function ensureStaffSpecCommissionColumns() {
  try {
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable('staff_specializations');

    if (!tableDesc.commission_type) {
      await qi.addColumn('staff_specializations', 'commission_type', {
        type: require('sequelize').DataTypes.ENUM('percentage', 'fixed'),
        allowNull: true,
        after: 'service_id',
      });
      console.log('[migration] staff_specializations.commission_type added');
    }

    if (!tableDesc.commission_value) {
      await qi.addColumn('staff_specializations', 'commission_value', {
        type: require('sequelize').DataTypes.DECIMAL(10, 2),
        allowNull: true,
        after: 'commission_type',
      });
      console.log('[migration] staff_specializations.commission_value added');
    }

    const [backfill] = await sequelize.query(`
      UPDATE staff_specializations ss
      INNER JOIN staff s ON s.id = ss.staff_id
      SET
        ss.commission_type = COALESCE(ss.commission_type, s.commission_type, 'percentage'),
        ss.commission_value = COALESCE(ss.commission_value, s.commission_value)
      WHERE ss.commission_type IS NULL OR ss.commission_value IS NULL
    `);
    if (backfill?.affectedRows > 0) {
      console.log(`[migration] staff_specializations commission backfilled (${backfill.affectedRows} rows)`);
    }
  } catch (err) {
    console.error('[migration] ensureStaffSpecCommissionColumns error:', err.message);
  }
}

module.exports = ensureStaffSpecCommissionColumns;
