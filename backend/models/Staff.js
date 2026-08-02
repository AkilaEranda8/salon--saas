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
  email: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  photo_url: {
    type: DataTypes.STRING(255),
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
    type: DataTypes.ENUM(
      'commission_only',
      'salary_only',
      'salary_plus_commission',
      'daily_salary_plus_commission',
    ),
    defaultValue: 'commission_only',
    comment: 'commission_only | salary_only (monthly) | salary_plus_commission (monthly+comm) | daily_salary_plus_commission (per-day+comm)',
  },
  base_salary: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: 'Base salary: monthly for salary_* types, per-day for daily_salary_plus_commission',
  },
  join_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  available_online: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'When true, staff can be selected in public / WordPress online booking',
  },
  working_hours: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Weekly hours keyed 0=Sun..6=Sat: { closed, start, end }',
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
