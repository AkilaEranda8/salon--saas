const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

/** Adds users.sessions_revoked_at when missing. Safe on every startup. */
async function ensureUsersSessionsRevokedColumn() {
  try {
    const qi = sequelize.getQueryInterface();
    const table = await qi.describeTable('users');
    if (table.sessions_revoked_at) return;
    await qi.addColumn('users', 'sessions_revoked_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
    console.log('[migration] users.sessions_revoked_at added');
  } catch (err) {
    console.error('[migration] ensureUsersSessionsRevokedColumn error:', err.message);
  }
}

module.exports = ensureUsersSessionsRevokedColumn;
