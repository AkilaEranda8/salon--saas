const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  staff_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  service_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  appointment_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  customer_name: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  loyalty_discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  promo_discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  points_earned: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  commission_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  commission_breakdown: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Line-by-line commission calculation snapshot',
  },
  manager_staff_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Branch manager staff who earns oversight commission on this payment',
  },
  manager_commission_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: 'Manager oversight commission from other staff work',
  },
  manager_commission_breakdown: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Manager oversight commission calculation snapshot',
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('paid', 'pending'),
    defaultValue: 'paid',
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'payments',
  timestamps: true,
});

module.exports = Payment;
