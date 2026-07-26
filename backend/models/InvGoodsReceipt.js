const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvGoodsReceipt = sequelize.define('InvGoodsReceipt', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: true },
  branch_id: { type: DataTypes.INTEGER, allowNull: false },
  purchase_order_id: { type: DataTypes.INTEGER, allowNull: true },
  supplier_id: { type: DataTypes.INTEGER, allowNull: true },
  grn_number: { type: DataTypes.STRING(40), allowNull: false },
  received_date: { type: DataTypes.DATEONLY, allowNull: false },
  status: {
    type: DataTypes.ENUM('draft', 'confirmed', 'cancelled'),
    defaultValue: 'draft',
  },
  notes: { type: DataTypes.TEXT, allowNull: true },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
  confirmed_by: { type: DataTypes.INTEGER, allowNull: true },
  confirmed_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'inv_goods_receipts', timestamps: true });

module.exports = InvGoodsReceipt;
