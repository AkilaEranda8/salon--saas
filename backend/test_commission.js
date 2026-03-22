require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { sequelize } = require('./config/database');
require('./models');
const { Staff } = require('./models');

(async () => {
  await sequelize.authenticate();
  console.log('DB connected');
  
  // Check what ENUM values MySQL actually allows
  const [results] = await sequelize.query("SHOW COLUMNS FROM staff LIKE 'commission_type'");
  console.log('Column def:', JSON.stringify(results));
  
  try {
    const s = await Staff.create({
      name: 'TestStaff',
      phone: '000',
      role_title: 'Tester',
      branch_id: 1,
      commission_type: 'percentage',
      commission_value: 10,
      join_date: '2024-01-01',
    });
    console.log('INSERT OK, id:', s.id);
    await s.destroy();
    console.log('Cleaned up');
  } catch (e) {
    console.error('INSERT FAILED:', e.message);
    console.error('Full error:', e.original ? e.original.message : 'no original');
  }
  
  await sequelize.close();
})();
