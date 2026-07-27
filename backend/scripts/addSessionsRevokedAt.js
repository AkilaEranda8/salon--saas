const { sequelize } = require('../config/database');

(async () => {
  try {
    const [rows] = await sequelize.query(
      "SHOW COLUMNS FROM users LIKE 'sessions_revoked_at'"
    );
    if (!rows.length) {
      await sequelize.query(
        'ALTER TABLE users ADD COLUMN sessions_revoked_at DATETIME NULL'
      );
      console.log('ADDED sessions_revoked_at');
    } else {
      console.log('EXISTS sessions_revoked_at');
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
