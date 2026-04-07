const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Inventory = sequelize.define('Inventory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  min_quantity: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  unit: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  cost_price: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  sell_price: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'inventory',
  timestamps: true,
});

module.exports = Inventory;
