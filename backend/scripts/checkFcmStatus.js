'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize } = require('../config/database');
const { StaffFcmToken } = require('../models');

(async () => {
  try {
    await sequelize.authenticate();
    const firebaseSet = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const count = await StaffFcmToken.count();
    const sample = await StaffFcmToken.findAll({
      attributes: ['id', 'user_id', 'branch_id'],
      limit: 5,
      order: [['updatedAt', 'DESC']],
    });
    console.log(JSON.stringify({ firebaseSet, tokenCount: count, sample }, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
