const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** In-app promotional offers shown in the customer mobile app. */
const MobileOffer = sequelize.define('MobileOffer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(160),
    allowNull: false,
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  image_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  category: {
    type: DataTypes.STRING(80),
    allowNull: true,
  },
  badge_text: {
    type: DataTypes.STRING(40),
    allowNull: true,
  },
  original_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  offer_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  starts_at: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  ends_at: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  is_published: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'mobile_offers',
  timestamps: true,
  indexes: [
    { fields: ['tenant_id'] },
    { fields: ['is_published'] },
    { fields: ['starts_at', 'ends_at'] },
  ],
});

module.exports = MobileOffer;
