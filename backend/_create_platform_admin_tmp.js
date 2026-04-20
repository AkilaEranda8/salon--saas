require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const bcrypt = require('bcryptjs');
const { sequelize } = require('./config/database');
const { User } = require('./models');

(async () => {
  await sequelize.authenticate();
  const username = 'akila';
  const plain = 'akila123';

  let user = await User.findOne({ where: { username } });
  const hash = await bcrypt.hash(plain, 10);

  if (!user) {
    user = await User.create({
      name: 'Platform Admin',
      username,
      password: hash,
      role: 'platform_admin',
      tenant_id: null,
      is_active: true,
    });
    console.log('CREATED', username);
  } else {
    await user.update({
      password: hash,
      role: 'platform_admin',
      tenant_id: null,
      is_active: true,
    });
    console.log('UPDATED', username);
  }

  console.log('USERNAME=' + username);
  console.log('PASSWORD=' + plain);
  await sequelize.close();
})().catch(async (e) => {
  console.error('ERR:', e && e.stack ? e.stack : e);
  try { await sequelize.close(); } catch {}
  process.exit(1);
});
