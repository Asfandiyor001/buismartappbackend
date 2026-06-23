/**
 * AGENT 4b — faithful validation of the two checks that the sync-offline path
 * cannot exercise:  (A) outside_since via the LIVE processPing path,
 *                   (B) canonical work-time formula = 27000s (7.5h) with lunch gap.
 * Writes results to tests/_agent4b.json
 */
process.env.TZ = 'Asia/Tashkent';
require('@dotenvx/dotenvx').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const geo = require('../src/modules/work/geofence.service');
const { workedSecondsSql, REGULAR_CAP } = require('../src/utils/workTime');

const pool = new Pool({ host: 'localhost', port: 5432, user: 'postgres', password: 'asfan2005', database: 'BuiSmartApp' });
const UID = 52;
const INSIDE = { lat: 39.741066, lon: 64.427637 };
const OUTSIDE = { lat: 41.2995, lon: 69.2401 };
const res = [];
const rec = (name, pass, detail) => { res.push({ name, pass: !!pass, detail }); console.log(`  ${pass ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`); };

async function cleanToday() {
  await pool.query(`DELETE FROM work_logs WHERE user_id=$1 AND DATE(entry_time AT TIME ZONE 'Asia/Tashkent')=CURRENT_DATE`, [UID]);
  await pool.query(`DELETE FROM gps_pings WHERE user_id=$1 AND DATE(created_at AT TIME ZONE 'Asia/Tashkent')=CURRENT_DATE`, [UID]);
  await pool.query(`DELETE FROM work_sessions WHERE user_id=$1 AND work_date=CURRENT_DATE`, [UID]);
}

async function testOutsideLive() {
  console.log('\n--- (A) outside_since via LIVE processPing ---');
  await cleanToday();
  // 1) live inside ping → checkin
  const r1 = await geo.processPing(UID, INSIDE.lat, INSIDE.lon, 8);
  // backdate all pings 120s so debounce (>15s) passes for the next live ping
  await pool.query(`UPDATE gps_pings SET created_at = NOW() - INTERVAL '120 seconds' WHERE user_id=$1`, [UID]);
  // seed one prior OUTSIDE ping 90s ago so the "prev outside in 5 min" guard passes
  await pool.query(
    `INSERT INTO gps_pings (user_id, latitude, longitude, accuracy_m, building_id, distance_m, is_inside, created_at)
     VALUES ($1,$2,$3,12,NULL,5000,false, NOW() - INTERVAL '90 seconds')`,
    [UID, OUTSIDE.lat, OUTSIDE.lon]
  );
  rec('checkin via live ping → session active', r1.action === 'auto_checkin', 'action=' + r1.action);

  // 2) live outside ping → should start outside countdown (outside_since set)
  const r2 = await geo.processPing(UID, OUTSIDE.lat, OUTSIDE.lon, 12);
  let s = await pool.query(`SELECT outside_since FROM work_sessions WHERE user_id=$1 AND work_date=CURRENT_DATE`, [UID]);
  rec('SIM4 outside ping → outside_since SET', s.rows[0] && s.rows[0].outside_since != null, 'action=' + r2.action + ' outside_since=' + (s.rows[0] && s.rows[0].outside_since));

  // 3) return inside → outside_since cleared. Backdate last ping so debounce passes.
  await pool.query(`UPDATE gps_pings SET created_at = NOW() - INTERVAL '60 seconds' WHERE user_id=$1 AND created_at > NOW() - INTERVAL '30 seconds'`, [UID]);
  await pool.query(`UPDATE gps_pings SET created_at = NOW() - INTERVAL '60 seconds' WHERE user_id=$1`, [UID]);
  const r3 = await geo.processPing(UID, INSIDE.lat, INSIDE.lon, 8);
  s = await pool.query(`SELECT outside_since FROM work_sessions WHERE user_id=$1 AND work_date=CURRENT_DATE`, [UID]);
  rec('SIM5 return inside → outside_since CLEARED', s.rows[0] && s.rows[0].outside_since == null, 'action=' + r3.action + ' outside_since=' + (s.rows[0] && s.rows[0].outside_since));
}

async function testFormula() {
  console.log('\n--- (B) canonical work-time formula (lunch gap → 27000s) ---');
  await cleanToday();
  // closed historical session: 08:00–13:00 + 14:00–16:30  (1h lunch gap)
  const { rows: [sess] } = await pool.query(
    `INSERT INTO work_sessions (user_id, work_date, first_entry_time, last_exit_time, status, is_finished, buildings_visited, last_ping_at)
     VALUES ($1, CURRENT_DATE, '08:00:00', '16:30:00', 'done', true, 1, CURRENT_DATE + INTERVAL '16 hours 30 minutes')
     RETURNING id`, [UID]);
  const sid = sess.id;
  const mkLog = (h1, m1, h2, m2) => pool.query(
    `INSERT INTO work_logs (session_id, user_id, building_id, entry_time, exit_time, duration_seconds, entry_lat, entry_lon, is_active, source)
     VALUES ($1,$2,1, CURRENT_DATE + ($3||' hours')::interval + ($4||' minutes')::interval,
                       CURRENT_DATE + ($5||' hours')::interval + ($6||' minutes')::interval,
                       EXTRACT(EPOCH FROM ((CURRENT_DATE + ($5||' hours')::interval + ($6||' minutes')::interval) - (CURRENT_DATE + ($3||' hours')::interval + ($4||' minutes')::interval)))::int,
                       $7,$8,false,'test')`,
    [sid, UID, String(h1), String(m1), String(h2), String(m2), INSIDE.lat, INSIDE.lon]);
  await mkLog(8, 0, 13, 0);   // 18000s
  await mkLog(14, 0, 16, 30); // 9000s  → logSum 27000

  // recalc with the production canonical SQL
  const workedExpr = workedSecondsSql('ws');
  const { rows } = await pool.query(
    `UPDATE work_sessions ws SET
       total_seconds=calc.worked,
       regular_seconds=LEAST(calc.worked, ${REGULAR_CAP}),
       overtime_seconds=GREATEST(0, calc.worked - ${REGULAR_CAP})
     FROM (SELECT ws.id, (${workedExpr})::int AS worked FROM work_sessions ws WHERE ws.id=$1) calc
     WHERE ws.id=calc.id
     RETURNING ws.total_seconds, ws.regular_seconds, ws.overtime_seconds`, [sid]);
  const t = rows[0];
  rec('SIM3 formula total_seconds = 27000 (±300)', Math.abs(t.total_seconds - 27000) <= 300, `total=${t.total_seconds} (${(t.total_seconds/3600).toFixed(2)}h) regular=${t.regular_seconds} ot=${t.overtime_seconds}`);
  rec('SIM3 total ≤ 9h cap (32400)', t.total_seconds <= 32400, 'total=' + t.total_seconds);

  // continuous-presence case (no lunch gap) → logSum floor includes lunch
  await cleanToday();
  const { rows: [s2] } = await pool.query(
    `INSERT INTO work_sessions (user_id, work_date, first_entry_time, last_exit_time, status, is_finished, buildings_visited, last_ping_at)
     VALUES ($1, CURRENT_DATE, '08:00:00', '16:30:00', 'done', true, 1, CURRENT_DATE + INTERVAL '16 hours 30 minutes') RETURNING id`, [UID]);
  await pool.query(
    `INSERT INTO work_logs (session_id, user_id, building_id, entry_time, exit_time, duration_seconds, entry_lat, entry_lon, is_active, source)
     VALUES ($1,$2,1, CURRENT_DATE + INTERVAL '8 hours', CURRENT_DATE + INTERVAL '16 hours 30 minutes', 30600, $3,$4,false,'test')`,
    [s2.id, UID, INSIDE.lat, INSIDE.lon]);
  const { rows: r2 } = await pool.query(
    `UPDATE work_sessions ws SET total_seconds=calc.worked, regular_seconds=LEAST(calc.worked, ${REGULAR_CAP}), overtime_seconds=GREATEST(0, calc.worked-${REGULAR_CAP})
     FROM (SELECT ws.id,(${workedExpr})::int AS worked FROM work_sessions ws WHERE ws.id=$1) calc WHERE ws.id=calc.id
     RETURNING ws.total_seconds, ws.regular_seconds, ws.overtime_seconds`, [s2.id]);
  rec('continuous presence (no lunch gap) → logSum floor counts lunch (8.5h, capped ≤9h)', r2[0].total_seconds === 30600, `total=${r2[0].total_seconds} (${(r2[0].total_seconds/3600).toFixed(2)}h)`);
}

(async () => {
  try { await testOutsideLive(); } catch (e) { console.error('A fatal:', e.message); rec('outside_live suite', false, e.message); }
  try { await testFormula(); } catch (e) { console.error('B fatal:', e.message); rec('formula suite', false, e.message); }
  await cleanToday(); // leave DB clean
  fs.writeFileSync(path.join(__dirname, '_agent4b.json'), JSON.stringify({ tests: res, passed: res.filter(x => x.pass).length, total: res.length }, null, 2));
  console.log('\nWrote tests/_agent4b.json (and cleaned user 52 test data)');
  await pool.end();
  process.exit(0);
})();
