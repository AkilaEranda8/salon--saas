const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PlatformRelease = sequelize.define('PlatformRelease', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  version: { type: DataTypes.STRING(40), allowNull: false },
  title: { type: DataTypes.STRING(255), allowNull: false },
  summary: { type: DataTypes.TEXT, allowNull: false },
  release_date: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'DRAFT' },
  popup_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  target_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'ALL' },
  target_plans: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  target_tenants: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  image_url: { type: DataTypes.STRING(500), allowNull: true },
  video_url: { type: DataTypes.STRING(500), allowNull: true },
  doc_url: { type: DataTypes.STRING(500), allowNull: true },
  created_by: { type: DataTypes.STRING(120), allowNull: false, defaultValue: 'Admin' },
}, {
  tableName: 'platform_releases',
  timestamps: true,
});

const PlatformReleaseItem = sequelize.define('PlatformReleaseItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  release_id: { type: DataTypes.INTEGER, allowNull: false },
  category: { type: DataTypes.STRING(60), allowNull: false },
  module: { type: DataTypes.STRING(80), allowNull: true },
  feature_name: { type: DataTypes.STRING(255), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  badge: { type: DataTypes.STRING(40), allowNull: true },
  display_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
  tableName: 'platform_release_items',
  timestamps: true,
});

PlatformRelease.hasMany(PlatformReleaseItem, { foreignKey: 'release_id', as: 'items', onDelete: 'CASCADE' });
PlatformReleaseItem.belongsTo(PlatformRelease, { foreignKey: 'release_id', as: 'release' });

module.exports = { PlatformRelease, PlatformReleaseItem };
