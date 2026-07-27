const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** Platform master catalog — reusable salon service / product templates. */
const MasterCatalogCategory = sequelize.define('MasterCatalogCategory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  kind: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'SERVICE' }, // SERVICE | PRODUCT
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
  tableName: 'master_catalog_categories',
  timestamps: true,
});

const MasterCatalogItem = sequelize.define('MasterCatalogItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  category_id: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING(180), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  duration_minutes: { type: DataTypes.INTEGER, allowNull: true },
  default_price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'LKR' },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
}, {
  tableName: 'master_catalog_items',
  timestamps: true,
});

MasterCatalogCategory.hasMany(MasterCatalogItem, {
  foreignKey: 'category_id',
  as: 'items',
  onDelete: 'CASCADE',
});
MasterCatalogItem.belongsTo(MasterCatalogCategory, {
  foreignKey: 'category_id',
  as: 'category',
});

module.exports = { MasterCatalogCategory, MasterCatalogItem };
