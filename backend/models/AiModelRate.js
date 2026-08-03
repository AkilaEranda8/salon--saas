'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** Per-model token pricing for AiUsage cost computation. */
const AiModelRate = sequelize.define('AiModelRate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  provider: {
    type: DataTypes.STRING(32),
    allowNull: false,
  },
  model: {
    type: DataTypes.STRING(120),
    allowNull: false,
  },
  input_per_1k: {
    type: DataTypes.DECIMAL(12, 6),
    allowNull: false,
    defaultValue: 0,
  },
  output_per_1k: {
    type: DataTypes.DECIMAL(12, 6),
    allowNull: false,
    defaultValue: 0,
  },
  currency: {
    type: DataTypes.STRING(8),
    allowNull: false,
    defaultValue: 'USD',
  },
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  tableName: 'ai_model_rates',
  underscored: true,
  indexes: [
    { unique: true, fields: ['provider', 'model'] },
  ],
});

module.exports = AiModelRate;
