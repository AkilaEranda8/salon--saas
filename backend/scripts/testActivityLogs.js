'use strict';
const { fetchActivityLogs } = require('../services/platformActivityLogs');
const { sequelize } = require('../config/database');

(async () => {
  try {
    await sequelize.authenticate();
    const r = await fetchActivityLogs({ limit: 5 });
    console.log(JSON.stringify({ total: r.total, counts: r.counts, sample: r.data }, null, 2));
    const t = await fetchActivityLogs({ tenant_id: 5, limit: 3 });
    console.log('--- tenant 5 ---');
    console.log(JSON.stringify({ total: t.total, counts: t.counts, sample: t.data }, null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
