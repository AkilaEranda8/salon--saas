const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvSupplier = sequelize.define('InvSupplier', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: true },
  name: { type: DataTypes.STRING(150), allowNull: false },
  contact_person: { type: DataTypes.STRING(120), allowNull: true },
  phone: { type: DataTypes.STRING(40), allowNull: true },
  email: { type: DataTypes.STRING(150), allowNull: true },
  address: { type: DataTypes.TEXT, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'inv_suppliers', timestamps: true });

module.exports = InvSupplier;
