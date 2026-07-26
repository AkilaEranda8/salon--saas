const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvStockCountItem = sequelize.define('InvStockCountItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  stock_count_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  expected_qty: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
  actual_qty: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
  variance: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
}, { tableName: 'inv_stock_count_items', timestamps: true });

module.exports = InvStockCountItem;
