const { sequelize } = require('../config/database');

async function ensureStaffRoleTitlesColumn() {
  try {
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable('tenants');

    if (!tableDesc.staff_role_titles) {
      await qi.addColumn('tenants', 'staff_role_titles', {
        type: require('sequelize').DataTypes.JSON,
        allowNull: true,
        after: 'mobile_role_defaults',
      });
      console.log('[migration] tenants.staff_role_titles added');
    }
  } catch (err) {
    console.error('[migration] ensureStaffRoleTitlesColumn error:', err.message);
  }
}

module.exports = ensureStaffRoleTitlesColumn;
