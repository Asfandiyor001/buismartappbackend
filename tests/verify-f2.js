process.env.TZ = 'Asia/Tashkent';
require('@dotenvx/dotenvx').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Pool } = require('pg');
const { closeStaleSessions } = require('../src/jobs/autoClose.job');
const pool = new Pool({ host: 'localhost', port: 5432, user: 'postgres', password: 'asfan2005', database: 'BuiSmartApp' });
const UID = 52;
const rec = (n, p, d) => console.log(`  ${p ? '✅' : '❌'} ${n}${d ? '  — ' + d : ''}`);

async function clean() {
  await pool.query(`DELETE FROM work_logs WHERE user_id=$1 AND DATE(entry_time AT TIME ZONE 'Asia/Tashkent')=CURRENT_DATE`, [UID]);
  await pool.query(`DELETE FROM gps_pings WHERE user_id=$1 AND DATE(created_at AT TIME ZONE 'Asia/Tashkent')=CURRENT_DATE`, [UID]);
  await pool.query(`DELETE FROM work_sessions WHERE user_id=$1 AND work_date=CURRENT_DATE`, [UID]);
}

async function makeSession(minutesAgo) {
  await clean();
  const { rows: [s] } = await pool.query(
    `INSERT INTO work_sessions (user_id, work_date, first_entry_time, status, is_finished, buildings_visited, last_ping_at)
     VALUES ($1, CURRENT_DATE, '08:00:00', 'active', false, 1, NOW() - ($2 * INTERVAL '1 minute')) RETURNING id`,
    [UID, minutesAgo]);
  await pool.query(
    `INSERT INTO work_logs (session_id, user_id, building_id, entry_time, duration_seconds, entry_lat, entry_lon, is_active, source)
     VALUES ($1,$2,1, CURRENT_DATE + INTERVAL '8 hours', 0, 39.741066, 64.427637, true, 'test')`,
    [s.id, UID]);
  return s.id;
}
const logActive = async (sid) => (await pool.query(`SELECT is_active FROM work_logs WHERE session_id=$1 ORDER BY id DESC LIMIT 1`, [sid])).rows[0].is_active;

(async () => {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const win = nowMins <= 990 ? 90 : 30;
  console.log(`\n--- F2 dynamic stale window — now=${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')} (window=${win} min) ---`);

  // Case 1: idle 40 min — within 90-min work window → must SURVIVE
  let sid = await makeSession(40);
  await closeStaleSessions();
  let a1 = await logActive(sid);
  rec('idle 40 min during work hours → log stays ACTIVE (90-min grace)', a1 === true, 'is_active=' + a1);

  // Case 2: idle 100 min — beyond 90-min window → must be CLOSED
  sid = await makeSession(100);
  await closeStaleSessions();
  let a2 = await logActive(sid);
  const sess = (await pool.query(`SELECT total_seconds FROM work_sessions WHERE id=$1`, [sid])).rows[0];
  rec('idle 100 min → log CLOSED + total recalculated', a2 === false, 'is_active=' + a2 + ' total_seconds=' + sess.total_seconds);

  await clean();
  console.log('\n  (cleaned user 52 test data)');
  console.log('  NOTE: after 16:30 the same code path uses the 30-min window (STALE_PING_MINUTES_AFTER).');
  await pool.end();
  process.exit(0);
})();
