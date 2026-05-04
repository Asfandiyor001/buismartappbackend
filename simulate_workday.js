/**
 * Full Workday Simulation — User ID 3 — 2026-04-29
 *
 * Timeline:
 *   08:05  Check-in at Bino 1 (building_id = 1)
 *   11:00  Switch to Bino 2 (building_id = 2)  — closes Bino-1 log
 *   13:00  Leaves for lunch  — closes Bino-2 log
 *   14:00  Returns to Bino 1 (building_id = 1)
 *   16:30  Final checkout    — closes Bino-1 afternoon log
 *   16:50  Session finalized (away from all buildings)
 *
 * Durations:
 *   Bino-1 morning  08:05-11:00 = 2h55m = 10500s
 *   Bino-2 pre-lunch 11:00-13:00 = 2h   =  7200s
 *   Lunch break     13:00-14:00 = 1h    =  3600s  (not counted)
 *   Bino-1 afternoon 14:00-16:30 = 2h30m=  9000s
 *   TOTAL WORK: 26700 s = 7h 25min
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'BuiSmartApp',
});

const USER_ID   = 3;
const WORK_DATE = '2026-04-29';

const T_CHECKIN     = '2026-04-29 08:05:00';
const T_SWITCH      = '2026-04-29 11:00:00';
const T_LUNCH_START = '2026-04-29 13:00:00';
const T_LUNCH_END   = '2026-04-29 14:00:00';
const T_CHECKOUT    = '2026-04-29 16:30:00';
const T_FINALIZED   = '2026-04-29 16:50:00';

const SEC_MORNING   = 10500; // 08:05-11:00
const SEC_PRELUNCH  = 7200;  // 11:00-13:00
const SEC_AFTERNOON = 9000;  // 14:00-16:30
const SEC_BREAK     = 3600;  // lunch
const SEC_TOTAL     = SEC_MORNING + SEC_PRELUNCH + SEC_AFTERNOON; // 26700

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Clean up any existing data for this user+date
    console.log('► Cleaning existing data for user 3 on 2026-04-29…');

    await client.query(`
      DELETE FROM work_logs
      WHERE session_id IN (
        SELECT id FROM work_sessions
        WHERE user_id = $1 AND work_date = $2
      )
    `, [USER_ID, WORK_DATE]);

    await client.query(`
      DELETE FROM work_sessions
      WHERE user_id = $1 AND work_date = $2
    `, [USER_ID, WORK_DATE]);

    await client.query(`
      DELETE FROM notifications
      WHERE user_id = $1
        AND type = 'davomat'
        AND created_at::date = $2::date
    `, [USER_ID, WORK_DATE]);

    // 2. Create work_session
    console.log('► Creating work_session…');
    const sessionRes = await client.query(`
      INSERT INTO work_sessions (
        user_id, work_date,
        first_entry_time, last_exit_time,
        total_seconds, regular_seconds, overtime_seconds, break_seconds,
        status, is_finished, finished_at,
        buildings_visited, building_switches,
        created_at, updated_at
      ) VALUES (
        $1, $2,
        '08:05:00', '16:30:00',
        $3, $3, 0, $4,
        'done', true, $5::timestamp,
        2, 1,
        $6::timestamp, $7::timestamp
      )
      RETURNING id
    `, [
      USER_ID, WORK_DATE,
      SEC_TOTAL,
      SEC_BREAK,
      T_FINALIZED,
      T_CHECKIN,
      T_FINALIZED,
    ]);
    const sessionId = sessionRes.rows[0].id;
    console.log(`   session_id = ${sessionId}`);

    // 3. Insert 3 work_log records
    console.log('► Inserting work_logs…');

    const log1 = await client.query(`
      INSERT INTO work_logs (
        session_id, user_id, building_id,
        entry_time, exit_time, duration_seconds,
        is_active, is_overtime,
        entry_type, exit_type, checkout_reason,
        created_at
      ) VALUES (
        $1, $2, 1,
        $3::timestamp, $4::timestamp, $5,
        false, false, 'gps', 'gps', 'auto_gps',
        $3::timestamp
      ) RETURNING id
    `, [sessionId, USER_ID, T_CHECKIN, T_SWITCH, SEC_MORNING]);
    console.log(`   log1 id=${log1.rows[0].id}  Bino-1 morning  08:05-11:00  ${SEC_MORNING}s`);

    const log2 = await client.query(`
      INSERT INTO work_logs (
        session_id, user_id, building_id,
        entry_time, exit_time, duration_seconds,
        is_active, is_overtime,
        entry_type, exit_type, checkout_reason,
        created_at
      ) VALUES (
        $1, $2, 2,
        $3::timestamp, $4::timestamp, $5,
        false, false, 'gps', 'gps', 'auto_gps',
        $3::timestamp
      ) RETURNING id
    `, [sessionId, USER_ID, T_SWITCH, T_LUNCH_START, SEC_PRELUNCH]);
    console.log(`   log2 id=${log2.rows[0].id}  Bino-2 pre-lunch 11:00-13:00  ${SEC_PRELUNCH}s`);

    const log3 = await client.query(`
      INSERT INTO work_logs (
        session_id, user_id, building_id,
        entry_time, exit_time, duration_seconds,
        is_active, is_overtime,
        entry_type, exit_type, checkout_reason,
        created_at
      ) VALUES (
        $1, $2, 1,
        $3::timestamp, $4::timestamp, $5,
        false, false, 'gps', 'gps', 'auto_gps',
        $3::timestamp
      ) RETURNING id
    `, [sessionId, USER_ID, T_LUNCH_END, T_CHECKOUT, SEC_AFTERNOON]);
    console.log(`   log3 id=${log3.rows[0].id}  Bino-1 afternoon 14:00-16:30  ${SEC_AFTERNOON}s`);

    // 4. Insert notifications
    console.log('► Inserting notifications…');

    await client.query(`
      INSERT INTO notifications (user_id, type, title, body, data, is_read, created_at)
      VALUES ($1, 'davomat', $2, $3, $4::jsonb, false, $5::timestamp)
    `, [
      USER_ID,
      'Ishga keldi ✅',
      'Siz Bino 1 ga kirdingiz (08:05)',
      JSON.stringify({ event: 'checkin', building_id: 1, session_id: sessionId, log_id: log1.rows[0].id }),
      T_CHECKIN,
    ]);

    await client.query(`
      INSERT INTO notifications (user_id, type, title, body, data, is_read, created_at)
      VALUES ($1, 'davomat', $2, $3, $4::jsonb, false, $5::timestamp)
    `, [
      USER_ID,
      'Bino almashtirdi 🔄',
      "Bino 1 dan Bino 2 ga o'tdingiz (11:00)",
      JSON.stringify({ event: 'switch', from_building_id: 1, to_building_id: 2, session_id: sessionId, log_id: log2.rows[0].id }),
      T_SWITCH,
    ]);

    await client.query(`
      INSERT INTO notifications (user_id, type, title, body, data, is_read, created_at)
      VALUES ($1, 'davomat', $2, $3, $4::jsonb, false, $5::timestamp)
    `, [
      USER_ID,
      'Ishdan chiqdi 🏁',
      'Siz Bino 1 dan chiqdingiz. Ish kuni yakunlandi (16:30). Jami: 7 soat 25 daqiqa.',
      JSON.stringify({ event: 'checkout', building_id: 1, session_id: sessionId, log_id: log3.rows[0].id, total_seconds: SEC_TOTAL }),
      T_CHECKOUT,
    ]);

    console.log('   3 notifications inserted.');

    // 5. Commit
    await client.query('COMMIT');
    console.log('\n✅ Simulation complete!');
    console.log(`   Session ID   : ${sessionId}`);
    console.log('   Work logs    : 3 records');
    console.log(`   Total work   : ${SEC_TOTAL} s = 7h 25min`);
    console.log(`   Break        : ${SEC_BREAK} s = 1h`);
    console.log('   Notifications: 3 (checkin, switch, checkout)');

    // 6. Verification
    console.log('\n──── Verification query ────');
    const verify = await client.query(`
      SELECT
        ws.id                AS session_id,
        ws.work_date,
        ws.first_entry_time,
        ws.last_exit_time,
        ws.total_seconds,
        ws.break_seconds,
        ws.buildings_visited,
        ws.building_switches,
        ws.status,
        ws.is_finished,
        (SELECT COUNT(*)::int FROM work_logs wl WHERE wl.session_id = ws.id)   AS log_count,
        (SELECT COUNT(*)::int FROM notifications n
           WHERE n.user_id = ws.user_id
             AND n.type = 'davomat'
             AND n.created_at::date = ws.work_date)                             AS notif_count
      FROM work_sessions ws
      WHERE ws.user_id = $1 AND ws.work_date = $2
    `, [USER_ID, WORK_DATE]);

    console.table(verify.rows);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✗ ERROR — transaction rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
