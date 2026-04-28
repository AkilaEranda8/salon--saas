const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CommissionPayout = sequelize.define('CommissionPayout', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  staff_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  month: {
    type: DataTypes.STRING(7),
    allowNull: false,
    comment: 'YYYY-MM — the commission month this payment is for',
  },
  notes: {
    type: DataTypes.STRING(300),
    allowNull: true,
  },
  paid_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'commission_payouts',
  timestamps: true,
});

module.exports = CommissionPayout;
