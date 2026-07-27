const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PlatformAnnouncement = sequelize.define('PlatformAnnouncement', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  title: { type: DataTypes.STRING(255), allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
  type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'INFO' },
  status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'DRAFT' },
  target: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'ALL' },
  target_tenants: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  dismissible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  scheduled_at: { type: DataTypes.DATE, allowNull: true },
  sent_at: { type: DataTypes.DATE, allowNull: true },
  seen_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  created_by: { type: DataTypes.STRING(120), allowNull: false, defaultValue: 'Admin' },
}, {
  tableName: 'platform_announcements',
  timestamps: true,
});

module.exports = PlatformAnnouncement;
