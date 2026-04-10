const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PlanConfig = sequelize.define('PlanConfig', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  key: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: { notEmpty: true },
  },
  label: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: { notEmpty: true },
  },
  price_display: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: null,
  },
  price_period: {
    type: DataTypes.STRING(30),
    allowNull: true,
    defaultValue: null,
  },
  tagline: {
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: null,
  },
  // -1 = unlimited
  max_branches: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  max_staff: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5,
  },
  max_services: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 20,
  },
  // JSON array of feature strings e.g. ["1 branch", "Email support"]
  features: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
  },
  trial_days: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  is_popular: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
}, {
  tableName: 'plan_configs',
  timestamps: true,
});

module.exports = PlanConfig;
