const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InventoryReorder = sequelize.define('InventoryReorder', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  inventory_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  quantity_requested: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  quantity_received: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  supplier_name: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  supplier_contact: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  unit_cost: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  total_cost: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  status: {
    type: DataTypes.ENUM('draft', 'ordered', 'partial', 'received', 'cancelled'),
    defaultValue: 'draft',
  },
  ordered_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  received_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'inventory_reorders',
  timestamps: true,
});

module.exports = InventoryReorder;
