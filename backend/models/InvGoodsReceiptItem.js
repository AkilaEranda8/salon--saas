const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvGoodsReceiptItem = sequelize.define('InvGoodsReceiptItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  goods_receipt_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  quantity_received: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  unit_cost: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  line_total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
}, { tableName: 'inv_goods_receipt_items', timestamps: true });

module.exports = InvGoodsReceiptItem;
