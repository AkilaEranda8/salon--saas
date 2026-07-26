const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvStockCount = sequelize.define('InvStockCount', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: true },
  branch_id: { type: DataTypes.INTEGER, allowNull: false },
  count_date: { type: DataTypes.DATEONLY, allowNull: false },
  status: {
    type: DataTypes.ENUM('draft', 'completed', 'cancelled'),
    defaultValue: 'draft',
  },
  notes: { type: DataTypes.TEXT, allowNull: true },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
  completed_by: { type: DataTypes.INTEGER, allowNull: true },
  completed_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'inv_stock_counts', timestamps: true });

module.exports = InvStockCount;
