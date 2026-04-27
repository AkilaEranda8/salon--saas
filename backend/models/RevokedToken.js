const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const RevokedToken = sequelize.define('RevokedToken', {
  token_hash: {
    type: DataTypes.STRING(64),
    primaryKey: true,
    comment: 'SHA-256 hex of the raw JWT string',
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  tableName:  'revoked_tokens',
  timestamps: false,
  indexes: [
    { fields: ['expires_at'], name: 'idx_revoked_expires' },
  ],
});

module.exports = RevokedToken;
