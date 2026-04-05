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
  points_earned: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  commission_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('paid', 'pending'),
    defaultValue: 'paid',
  },
  review_token: {
    type: DataTypes.STRING(64),
    allowNull: true,
    unique: true,
  },
}, {
  tableName: 'payments',
  timestamps: true,
});

module.exports = Payment;
