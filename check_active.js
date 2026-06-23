require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/database');
(async () => {
  const { rows } = await pool.query(`
    SELECT ws.id, ws.user_id, u.full_name, ws.status, ws.last_ping_at, ws.first_entry_time,
           EXTRACT(EPOCH FROM (NOW() - ws.last_ping_at))/60 AS ping_age_min
    FROM work_sessions ws JOIN users u ON u.id = ws.user_id
    WHERE ws.work_date = CURRENT_DATE AND ws.is_finished = false AND ws.status = 'active'`);
  rows.forEach(r => console.log('ID', r.user_id, r.full_name, '| kirdi:', r.first_entry_time,
    '| oxirgi ping:', new Date(r.last_ping_at).toLocaleTimeString('uz-UZ'),
    '(' + Math.floor(r.ping_age_min) + ' daq oldin)'));
  await pool.end();
})();
