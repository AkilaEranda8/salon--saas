const { sequelize } = require('../config/database');

async function ensureUserMobileFeaturesColumn() {
  try {
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable('users');

    if (!tableDesc.mobile_features) {
      await qi.addColumn('users', 'mobile_features', {
        type: require('sequelize').DataTypes.JSON,
        allowNull: true,
        after: 'must_change_password',
      });
      console.log('[migration] users.mobile_features added');
    }
  } catch (err) {
    console.error('[migration] ensureUserMobileFeaturesColumn error:', err.message);
  }
}

module.exports = ensureUserMobileFeaturesColumn;
