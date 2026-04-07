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
