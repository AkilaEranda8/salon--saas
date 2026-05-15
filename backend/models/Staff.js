const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Staff = sequelize.define('Staff', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  role_title: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  commission_type: {
    type: DataTypes.ENUM('percentage', 'fixed'),
    defaultValue: 'percentage',
  },
  commission_value: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  salary_type: {
    type: DataTypes.ENUM('commission_only', 'salary_only', 'salary_plus_commission'),
    defaultValue: 'commission_only',
    comment: 'commission_only=commission based, salary_only=fixed monthly salary, salary_plus_commission=base salary + commission',
  },
  base_salary: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: 'Monthly base salary amount (used when salary_type is salary_only or salary_plus_commission)',
  },
  join_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
    comment: 'Optional link to a users.id login account for this staff member',
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'staff',
  timestamps: true,
});

module.exports = Staff;
