/**
 * "Lazy Employee" Workday Simulation — User ID 10 — 2026-04-29
 *
 * Timeline:
 *   08:30 - 09:30  Bino 1 (ID 1)   — 1h 00m = 3600s
 *   09:30 - 12:00  OUTSIDE          — not counted (1.5h gap)
 *   12:00 - 13:00  Bino 2 (ID 2)   — 1h 00m = 3600s
 *   13:00 - 14:40  LONG LUNCH       — not counted (1h40m gap)
 *   14:40 - 15:40  Bino 1 (ID 1)   — 1h 00m = 3600s
 *   15:40 - 16:30  Bino 3 (ID 3)   — 0h 50m = 3000s
 *
 *   TOTAL WORK: 3600+3600+3600+3000 = 13800 s = 3h 50min
 *   TOTAL GAPS: 9000+6000            = 15000 s (not counted)
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

const USER_ID   = 10;
const WORK_DATE = '2026-04-29';

// ── Timestamps ──────────────────────────────────────────
const T = {
  checkin1:      '2026-04-29 08:30:00',
  checkout1:     '2026-04-29 09:30:00',  // leaves Bino 1
  // outside 09:30-12:00
  checkin2:      '2026-04-29 12:00:00',
  checkout2:     '2026-04-29 13:00:00',  // leaves Bino 2 for lunch
  // outside 13:00-14:40
  checkin3:      '2026-04-29 14:40:00',
  switch_time:   '2026-04-29 15:40:00',  // switches Bino 1 → Bino 3
  checkout_final:'2026-04-29 16:30:00',
};

// ── Durations (seconds) ─────────────────────────────────
const SEC = {
  log1: 3600,   // 08:30-09:30
  log2: 3600,   // 12:00-13:00
  log3: 3600,   // 14:40-15:40
  log4: 3000,   // 15:40-16:30
  break_total: 9000 + 6000,  // 09:30-12:00 + 13:00-14:40 = 15000s
};
const SEC_TOTAL = SEC.log1 + SEC.log2 + SEC.log3 + SEC.log4; // 13800

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Clean up ───────────────────────────────────────
    console.log('► Cleaning existing data for user 10 on 2026-04-29…');

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

    // ── 2. work_session ───────────────────────────────────
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
        '08:30:00', '16:30:00',
        $3, $3, 0, $4,
        'done', true, $5::timestamp,
        3, 3,
        $6::timestamp, $7::timestamp
      )
      RETURNING id
    `, [
      USER_ID, WORK_DATE,
      SEC_TOTAL,
      SEC.break_total,
      T.checkout_final,
      T.checkin1,
      T.checkout_final,
    ]);
    const sessionId = sessionRes.rows[0].id;
    console.log(`   session_id = ${sessionId}`);

    // ── 3. work_logs ──────────────────────────────────────
    console.log('► Inserting 4 work_logs…');

    const insertLog = async (buildingId, entry, exit, duration) => {
      const res = await client.query(`
        INSERT INTO work_logs (
          session_id, user_id, building_id,
          entry_time, exit_time, duration_seconds,
          is_active, is_overtime,
          entry_type, exit_type, checkout_reason,
          created_at
        ) VALUES (
          $1, $2, $3,
          $4::timestamp, $5::timestamp, $6,
          false, false, 'gps', 'gps', 'auto_gps',
          $4::timestamp
        ) RETURNING id
      `, [sessionId, USER_ID, buildingId, entry, exit, duration]);
      return res.rows[0].id;
    };

    const id1 = await insertLog(1, T.checkin1,    T.checkout1,     SEC.log1);
    const id2 = await insertLog(2, T.checkin2,    T.checkout2,     SEC.log2);
    const id3 = await insertLog(1, T.checkin3,    T.switch_time,   SEC.log3);
    const id4 = await insertLog(3, T.switch_time, T.checkout_final,SEC.log4);

    console.log(`   log ${id1}: Bino 1  08:30-09:30  ${SEC.log1}s`);
    console.log(`   log ${id2}: Bino 2  12:00-13:00  ${SEC.log2}s`);
    console.log(`   log ${id3}: Bino 1  14:40-15:40  ${SEC.log3}s`);
    console.log(`   log ${id4}: Bino 3  15:40-16:30  ${SEC.log4}s`);

    // ── 4. notifications ──────────────────────────────────
    console.log('► Inserting notifications…');

    const notif = async (title, body, data, ts) => {
      await client.query(`
        INSERT INTO notifications (user_id, type, title, body, data, is_read, created_at)
        VALUES ($1, 'davomat', $2, $3, $4::jsonb, false, $5::timestamp)
      `, [USER_ID, title, body, JSON.stringify(data), ts]);
    };

    // Event 1: Check-in at Bino 1
    await notif(
      'Ishga keldi ✅',
      "Bino 1 ga kirdingiz (08:30)",
      { event: 'checkin', building_id: 1, session_id: sessionId, log_id: id1 },
      T.checkin1
    );

    // Event 2: Left Bino 1 (checkout/geofence exit)
    await notif(
      'Binoni tark etdi 🚶',
      "Bino 1 dan chiqdingiz (09:30). Vaqt hisoblanmaydi.",
      { event: 'geofence_exit', building_id: 1, session_id: sessionId, log_id: id1 },
      T.checkout1
    );

    // Event 3: Re-entered Bino 2
    await notif(
      'Binoga qaytdi 🏢',
      "Bino 2 ga kirdingiz (12:00)",
      { event: 'checkin', building_id: 2, session_id: sessionId, log_id: id2 },
      T.checkin2
    );

    // Event 4: Left Bino 2 (lunch)
    await notif(
      'Tushlik tanaffusi 🍽️',
      "Bino 2 dan chiqdingiz (13:00). Tushlik tanaffusi boshlandi.",
      { event: 'geofence_exit', building_id: 2, session_id: sessionId, log_id: id2 },
      T.checkout2
    );

    // Event 5: Re-entered Bino 1
    await notif(
      'Binoga qaytdi 🏢',
      "Bino 1 ga kirdingiz (14:40)",
      { event: 'checkin', building_id: 1, session_id: sessionId, log_id: id3 },
      T.checkin3
    );

    // Event 6: Switch Bino 1 → Bino 3
    await notif(
      'Bino almashtirdi 🔄',
      "Bino 1 dan Bino 3 ga o'tdingiz (15:40)",
      { event: 'switch', from_building_id: 1, to_building_id: 3, session_id: sessionId, log_id: id4 },
      T.switch_time
    );

    // Event 7: Final checkout from Bino 3
    await notif(
      'Ishdan chiqdi 🏁',
      `Bino 3 dan chiqdingiz. Ish kuni yakunlandi (16:30). Jami haqiqiy ish vaqti: 3 soat 50 daqiqa.`,
      { event: 'checkout', building_id: 3, session_id: sessionId, log_id: id4, total_seconds: SEC_TOTAL },
      T.checkout_final
    );

    console.log('   7 notifications inserted.');

    // ── 5. Commit ─────────────────────────────────────────
    await client.query('COMMIT');

    console.log('\n✅ Slacker simulation complete!');
    console.log(`   Session ID      : ${sessionId}`);
    console.log('   Work logs       : 4 records');
    console.log(`   Total work time : ${SEC_TOTAL} s = 3h 50min`);
    console.log(`   Total gaps/break: ${SEC.break_total} s = 4h 10min (uncounted)`);
    console.log('   Notifications   : 7 events');

    // ── 6. Verification ───────────────────────────────────
    console.log('\n──── Verification ────');
    const v = await client.query(`
      SELECT
        ws.id                AS session_id,
        ws.work_date,
        ws.first_entry_time,
        ws.last_exit_time,
        ws.total_seconds,
        ws.break_seconds,
        ROUND(ws.total_seconds::numeric / 3600, 2) AS total_hours,
        ws.buildings_visited,
        ws.building_switches,
        ws.status,
        ws.is_finished,
        (SELECT COUNT(*)::int FROM work_logs wl  WHERE wl.session_id = ws.id)  AS log_count,
        (SELECT COUNT(*)::int FROM notifications n
           WHERE n.user_id = ws.user_id
             AND n.type = 'davomat'
             AND n.created_at::date = ws.work_date)                             AS notif_count
      FROM work_sessions ws
      WHERE ws.user_id = $1 AND ws.work_date = $2
    `, [USER_ID, WORK_DATE]);

    console.table(v.rows);

    console.log('\n──── Work Logs Detail ────');
    const logs = await client.query(`
      SELECT
        wl.id, wl.building_id,
        wl.entry_time::time(0)   AS entry,
        wl.exit_time::time(0)    AS exit,
        wl.duration_seconds,
        ROUND(wl.duration_seconds::numeric / 60, 0) AS duration_min
      FROM work_logs wl
      WHERE wl.session_id = $1
      ORDER BY wl.entry_time
    `, [sessionId]);
    console.table(logs.rows);

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
