const { sequelize } = require('../config/database');

const SALARY_TYPES = [
  'commission_only',
  'salary_only',
  'salary_plus_commission',
  'daily_salary_plus_commission',
];

async function ensureStaffSalaryColumns() {
  try {
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable('staff');

    if (!tableDesc.salary_type) {
      await qi.addColumn('staff', 'salary_type', {
        type: require('sequelize').DataTypes.ENUM(...SALARY_TYPES),
        defaultValue: 'commission_only',
        allowNull: false,
        after: 'commission_value',
      });
      console.log('[migration] staff.salary_type column added');
    } else {
      // Expand ENUM for per-day salary + commission
      await sequelize.query(`
        ALTER TABLE staff
        MODIFY COLUMN salary_type ENUM(
          'commission_only',
          'salary_only',
          'salary_plus_commission',
          'daily_salary_plus_commission'
        ) NOT NULL DEFAULT 'commission_only'
      `).catch((e) => {
        if (!/duplicate|same/i.test(e.message)) {
          console.warn('[migration] staff.salary_type ENUM:', e.message);
        }
      });
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
module.exports.SALARY_TYPES = SALARY_TYPES;
