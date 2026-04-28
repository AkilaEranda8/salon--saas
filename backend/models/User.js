const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  username: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM('platform_admin', 'superadmin', 'admin', 'manager', 'staff'),
    defaultValue: 'staff',
    allowNull: false,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  avatar: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  color: {
    type: DataTypes.STRING(20),
    defaultValue: '#6366f1',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'NULL for platform_admin accounts',
  },
  totp_secret: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  totp_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  must_change_password: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  password_reset_token: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  password_reset_expires: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'users',
  timestamps: true,
});

module.exports = User;
