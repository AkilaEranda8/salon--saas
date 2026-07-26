const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvDayEndBatch = sequelize.define('InvDayEndBatch', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: true },
  branch_id: { type: DataTypes.INTEGER, allowNull: false },
  batch_date: { type: DataTypes.DATEONLY, allowNull: false },
  status: {
    type: DataTypes.ENUM('draft', 'confirmed', 'cancelled'),
    defaultValue: 'draft',
  },
  notes: { type: DataTypes.TEXT, allowNull: true },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
  confirmed_by: { type: DataTypes.INTEGER, allowNull: true },
  confirmed_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'inv_day_end_batches', timestamps: true });

module.exports = InvDayEndBatch;
