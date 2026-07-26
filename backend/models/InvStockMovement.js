const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvStockMovement = sequelize.define('InvStockMovement', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: true },
  branch_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  movement_type: {
    type: DataTypes.ENUM(
      'purchase', 'consumption', 'adjustment', 'transfer',
      'damage', 'expired', 'opening', 'stock_count'
    ),
    allowNull: false,
  },
  opening_qty: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  quantity_changed: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  closing_qty: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  reference_type: { type: DataTypes.STRING(60), allowNull: true },
  reference_id: { type: DataTypes.INTEGER, allowNull: true },
  user_id: { type: DataTypes.INTEGER, allowNull: true },
  remarks: { type: DataTypes.TEXT, allowNull: true },
  moved_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: 'inv_stock_movements', timestamps: true });

module.exports = InvStockMovement;
