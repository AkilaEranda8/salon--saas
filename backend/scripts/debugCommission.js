require('dotenv').config();
const { sequelize } = require('../config/database');

(async () => {
  const [payments] = await sequelize.query(`
    SELECT p.id, p.date, p.branch_id, p.total_amount, p.staff_id, p.manager_staff_id,
           p.commission_amount, p.manager_commission_amount,
           ws.name AS worker, ms.name AS manager, ms.role_title AS mgr_role
    FROM payments p
    LEFT JOIN staff ws ON ws.id = p.staff_id
    LEFT JOIN staff ms ON ms.id = p.manager_staff_id
    ORDER BY p.id DESC LIMIT 8
  `);
  console.log('RECENT PAYMENTS:', JSON.stringify(payments, null, 2));

  const [staff] = await sequelize.query(`
    SELECT s.id, s.name, s.role_title, s.branch_id, s.commission_value, s.salary_type, s.user_id,
           GROUP_CONCAT(sb.branch_id) AS branch_links
    FROM staff s
    LEFT JOIN staff_branches sb ON sb.staff_id = s.id
    WHERE s.role_title LIKE '%Manager%' OR s.name LIKE '%thathsarani%' OR s.name LIKE '%Akila%'
    GROUP BY s.id
  `);
  console.log('STAFF:', JSON.stringify(staff, null, 2));

  const [users] = await sequelize.query(`
    SELECT id, name, role, branch_id FROM users WHERE role = 'manager' OR name LIKE '%Akila%'
  `);
  console.log('USERS:', JSON.stringify(users, null, 2));

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
