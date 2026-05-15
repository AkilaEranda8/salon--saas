const { sequelize } = require('../config/database');

async function ensureStaffSalaryColumns() {
  try {
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable('staff');

    if (!tableDesc.salary_type) {
      await qi.addColumn('staff', 'salary_type', {
        type: require('sequelize').DataTypes.ENUM('commission_only', 'salary_only', 'salary_plus_commission'),
        defaultValue: 'commission_only',
        allowNull: false,
        after: 'commission_value',
      });
      console.log('[migration] staff.salary_type column added');
    }

    if (!tableDesc.base_salary) {
      await qi.addColumn('staff', 'base_salary', {
        type: require('sequelize').DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        allowNull: false,
        after: 'salary_type',
      });
      console.log('[migration] staff.base_salary column added');
    }

    if (!tableDesc.email) {
      await qi.addColumn('staff', 'email', {
        type: require('sequelize').DataTypes.STRING(150),
        allowNull: true,
        after: 'phone',
      });
      console.log('[migration] staff.email column added');
    }
  } catch (err) {
    console.error('[migration] ensureStaffSalaryColumns error:', err.message);
  }
}

module.exports = ensureStaffSalaryColumns;
