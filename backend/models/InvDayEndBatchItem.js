const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvDayEndBatchItem = sequelize.define('InvDayEndBatchItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  day_end_batch_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  quantity_used: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  unit: { type: DataTypes.ENUM('ml', 'g', 'kg', 'L', 'pcs'), allowNull: false },
}, { tableName: 'inv_day_end_batch_items', timestamps: true });

module.exports = InvDayEndBatchItem;
