const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FeatureSuggestion = sequelize.define('FeatureSuggestion', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  submitted_by: { type: DataTypes.INTEGER, allowNull: true },
  category: { type: DataTypes.STRING(80), allowNull: false },
  title: { type: DataTypes.STRING(255), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'NEW' },
  priority: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'MEDIUM' },
  public_response: { type: DataTypes.TEXT, allowNull: true },
  internal_note: { type: DataTypes.TEXT, allowNull: true },
  responded_by_email: { type: DataTypes.STRING(180), allowNull: true },
  responded_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'feature_suggestions',
  timestamps: true,
});

const FeatureSuggestionHistory = sequelize.define('FeatureSuggestionHistory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  suggestion_id: { type: DataTypes.INTEGER, allowNull: false },
  action: { type: DataTypes.STRING(40), allowNull: false },
  old_status: { type: DataTypes.STRING(30), allowNull: true },
  new_status: { type: DataTypes.STRING(30), allowNull: true },
  old_priority: { type: DataTypes.STRING(20), allowNull: true },
  new_priority: { type: DataTypes.STRING(20), allowNull: true },
  public_response: { type: DataTypes.TEXT, allowNull: true },
  performed_by_email: { type: DataTypes.STRING(180), allowNull: false },
}, {
  tableName: 'feature_suggestion_history',
  timestamps: true,
  updatedAt: false,
});

FeatureSuggestion.hasMany(FeatureSuggestionHistory, {
  foreignKey: 'suggestion_id',
  as: 'history',
  onDelete: 'CASCADE',
});
FeatureSuggestionHistory.belongsTo(FeatureSuggestion, {
  foreignKey: 'suggestion_id',
  as: 'suggestion',
});

module.exports = { FeatureSuggestion, FeatureSuggestionHistory };
