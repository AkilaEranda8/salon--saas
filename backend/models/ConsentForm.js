const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ConsentForm = sequelize.define('ConsentForm', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  body_text: {
    type: DataTypes.TEXT('long'),
    allowNull: false,
  },
  version: {
    type: DataTypes.STRING(20),
    defaultValue: '1.0',
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'e.g. chemical_treatment, allergy_test, general',
  },
  requires_signature: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'consent_forms',
  timestamps: true,
});

module.exports = ConsentForm;
