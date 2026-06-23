const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
async function run() {
  // Bugungi sessiyalar
  const r = await pool.query(`
    SELECT ws.id, ws.user_id, u.full_name, ws.work_date, ws.status,
           ws.first_entry_time AT TIME ZONE 'Asia/Tashkent' AS entry_t,
           ws.last_exit_time   AT TIME ZONE 'Asia/Tashkent' AS exit_t,
           ws.total_seconds
    FROM work_sessions ws
    JOIN users u ON u.id = ws.user_id
    WHERE ws.user_id IN (43, 44)
    ORDER BY ws.work_date DESC, ws.id DESC
    LIMIT 10
  `);
  console.log('ID=43 va ID=44 so\'nggi sessionlari:');
  r.rows.forEach(s => console.log(
    `  id=${s.id} user=${s.user_id} date=${s.work_date} status=${s.status} ` +
    `entry=${s.entry_t} exit=${s.exit_t} sec=${s.total_seconds}`
  ));

  // Active work_logs
  const l = await pool.query(`
    SELECT wl.id, wl.user_id, wl.building_id, wl.entry_time AT TIME ZONE 'Asia/Tashkent' AS entry_t,
           wl.exit_time, wl.session_id
    FROM work_logs wl
    WHERE wl.user_id IN (43, 44) AND wl.exit_time IS NULL
  `);
  console.log('\nAktiv work_logs (exit_time IS NULL):');
  if (!l.rows.length) console.log('  yo\'q');
  l.rows.forEach(wl => console.log(
    `  log_id=${wl.id} user=${wl.user_id} bino=${wl.building_id} entry=${wl.entry_t} session=${wl.session_id}`
  ));

  await pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });
