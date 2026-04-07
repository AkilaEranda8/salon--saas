'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Review = sequelize.define('Review', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  payment_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
  },
  customer_name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  customer_phone: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  service_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  staff_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  service_rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1, max: 5 },
  },
  staff_rating: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { min: 1, max: 5 },
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_approved: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  review_token: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'reviews',
  timestamps: true,
});

module.exports = Review;
