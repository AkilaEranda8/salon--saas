require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');
const { User } = require('../models');

const SALT_ROUNDS = 10;
const SUPERADMIN_USERNAME = process.env.SUPERADMIN_USERNAME || 'superadmin';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'admin123';
const SUPERADMIN_NAME = process.env.SUPERADMIN_NAME || 'Super Admin';
const SUPERADMIN_COLOR = process.env.SUPERADMIN_COLOR || '#ef4444';

async function ensureSuperadmin() {
  await sequelize.authenticate();
  console.log('✓ DB connected');

  const hashed = await bcrypt.hash(SUPERADMIN_PASSWORD, SALT_ROUNDS);

  const [user, created] = await User.findOrCreate({
    where: { username: SUPERADMIN_USERNAME },
    defaults: {
      password: hashed,
      name: SUPERADMIN_NAME,
      role: 'superadmin',
      branch_id: null,
      color: SUPERADMIN_COLOR,
      is_active: true,
    },
  });

  if (created) {
    console.log(`✓ Created superadmin user: ${user.username}`);
  } else {
    await user.update({
      password: hashed,
      name: SUPERADMIN_NAME,
      role: 'superadmin',
      branch_id: null,
      color: SUPERADMIN_COLOR,
      is_active: true,
    });
    console.log(`~ Updated existing user as superadmin: ${user.username}`);
  }
}

ensureSuperadmin()
  .catch((err) => {
    console.error('✗ Ensure superadmin failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await sequelize.close();
  });
