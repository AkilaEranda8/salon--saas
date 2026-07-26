const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvProduct = sequelize.define('InvProduct', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: true },
  branch_id: { type: DataTypes.INTEGER, allowNull: false },
  category_id: { type: DataTypes.INTEGER, allowNull: true },
  supplier_id: { type: DataTypes.INTEGER, allowNull: true },
  name: { type: DataTypes.STRING(180), allowNull: false },
  sku: { type: DataTypes.STRING(80), allowNull: true },
  barcode: { type: DataTypes.STRING(80), allowNull: true },
  brand: { type: DataTypes.STRING(120), allowNull: true },
  product_type: {
    type: DataTypes.ENUM('consumable', 'retail', 'equipment', 'chemical', 'accessories'),
    allowNull: false,
    defaultValue: 'consumable',
  },
  unit: {
    type: DataTypes.ENUM('ml', 'g', 'kg', 'L', 'pcs'),
    allowNull: false,
    defaultValue: 'pcs',
  },
  cost_price: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  sell_price: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  current_stock: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },
  min_stock: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },
  max_stock: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },
  opening_stock: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
  },
  notes: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'inv_products', timestamps: true });

module.exports = InvProduct;
