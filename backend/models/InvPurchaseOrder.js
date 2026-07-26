const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvPurchaseOrder = sequelize.define('InvPurchaseOrder', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: true },
  branch_id: { type: DataTypes.INTEGER, allowNull: false },
  supplier_id: { type: DataTypes.INTEGER, allowNull: true },
  po_number: { type: DataTypes.STRING(40), allowNull: false },
  status: {
    type: DataTypes.ENUM('draft', 'ordered', 'partial', 'received', 'cancelled'),
    defaultValue: 'draft',
  },
  order_date: { type: DataTypes.DATEONLY, allowNull: true },
  expected_date: { type: DataTypes.DATEONLY, allowNull: true },
  total_cost: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  notes: { type: DataTypes.TEXT, allowNull: true },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'inv_purchase_orders', timestamps: true });

module.exports = InvPurchaseOrder;
