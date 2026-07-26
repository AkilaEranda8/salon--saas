const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvPurchaseOrderItem = sequelize.define('InvPurchaseOrderItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  purchase_order_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  quantity_ordered: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  quantity_received: { type: DataTypes.DECIMAL(12, 3), defaultValue: 0 },
  unit_cost: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  line_total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
}, { tableName: 'inv_purchase_order_items', timestamps: true });

module.exports = InvPurchaseOrderItem;
