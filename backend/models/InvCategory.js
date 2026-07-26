const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvCategory = sequelize.define('InvCategory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  type: {
    type: DataTypes.ENUM('consumable', 'retail', 'equipment', 'chemical', 'accessories'),
    allowNull: false,
    defaultValue: 'consumable',
  },
  description: { type: DataTypes.STRING(255), allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'inv_categories', timestamps: true });

module.exports = InvCategory;
