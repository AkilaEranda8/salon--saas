const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvConsumption = sequelize.define('InvConsumption', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: true },
  branch_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  staff_id: { type: DataTypes.INTEGER, allowNull: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: true },
  appointment_id: { type: DataTypes.INTEGER, allowNull: true },
  service_id: { type: DataTypes.INTEGER, allowNull: true },
  consumption_date: { type: DataTypes.DATEONLY, allowNull: false },
  quantity_used: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  unit: { type: DataTypes.ENUM('ml', 'g', 'kg', 'L', 'pcs'), allowNull: false },
  reason: { type: DataTypes.STRING(255), allowNull: true },
  status: {
    type: DataTypes.ENUM('pending', 'processed', 'cancelled'),
    defaultValue: 'pending',
  },
  day_end_batch_id: { type: DataTypes.INTEGER, allowNull: true },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'inv_consumptions', timestamps: true });

module.exports = InvConsumption;
