const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** Salon-wide or branch-specific promo discounts (percent or fixed LKR). */
const Discount = sequelize.define('Discount', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'NULL = all branches',
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false,
  },
  code: {
    type: DataTypes.STRING(40),
    allowNull: true,
  },
  discount_type: {
    type: DataTypes.ENUM('percent', 'fixed'),
    allowNull: false,
    defaultValue: 'percent',
  },
  value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Percent 0–100 or fixed LKR amount',
  },
  min_bill: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  max_discount_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Cap for percent-type discounts',
  },
  starts_at: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  ends_at: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'discounts',
  timestamps: true,
  indexes: [
    { fields: ['branch_id'] },
    { fields: ['is_active'] },
  ],
});

module.exports = Discount;
