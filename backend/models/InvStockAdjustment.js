const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvStockAdjustment = sequelize.define('InvStockAdjustment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: true },
  branch_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  direction: { type: DataTypes.ENUM('add', 'remove'), allowNull: false },
  quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  reason: { type: DataTypes.STRING(255), allowNull: false },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected', 'applied'),
    defaultValue: 'applied',
  },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
  approved_by: { type: DataTypes.INTEGER, allowNull: true },
  approved_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'inv_stock_adjustments', timestamps: true });

module.exports = InvStockAdjustment;
