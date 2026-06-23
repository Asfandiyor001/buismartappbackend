require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/database');

const IDS = [46, 47, 48, 49, 50, 51, 52, 53, 54, 55];
const REGULAR_CAP = 8 * 3600;

async function main() {
  console.log('============================================================');
  console.log('CHECKOUT — ID 46–55');
  console.log('============================================================');

  const client = await pool.connect();
  try {
    for (const userId of IDS) {
      await client.query('BEGIN');

      const { rows: [user] } = await client.query(
        'SELECT full_name FROM users WHERE id = $1', [userId]
      );

      // Aktiv sessiya va log
      const { rows: [sess] } = await client.query(`
        SELECT ws.id AS session_id, wl.id AS log_id, wl.entry_time
        FROM work_sessions ws
        LEFT JOIN work_logs wl ON wl.session_id = ws.id AND wl.is_active = true
        WHERE ws.user_id = $1 AND ws.work_date = CURRENT_DATE AND ws.is_finished = false
      `, [userId]);

      if (!sess) {
        console.log(`⚠️  ${userId} ${user?.full_name} — aktiv sessiya yo'q`);
        await client.query('ROLLBACK');
        continue;
      }

      const now = new Date();

      // Aktiv logni yopish
      if (sess.log_id) {
        const entryMs  = new Date(sess.entry_time).getTime();
        const duration = Math.max(0, Math.floor((now.getTime() - entryMs) / 1000));
        await client.query(`
          UPDATE work_logs SET
            exit_time        = NOW(),
            duration_seconds = $1,
            is_active        = false,
            checkout_reason  = 'auto_gps'
          WHERE id = $2
        `, [duration, sess.log_id]);
      }

      // Sessiya total ni hisoblash
      const { rows: [totals] } = await client.query(`
        SELECT COALESCE(SUM(duration_seconds), 0)::bigint AS total
        FROM work_logs WHERE session_id = $1 AND duration_seconds IS NOT NULL
      `, [sess.session_id]);

      const total    = parseInt(totals.total, 10);
      const regular  = Math.min(total, REGULAR_CAP);
      const overtime = Math.max(0, total - REGULAR_CAP);

      const exitStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

      await client.query(`
        UPDATE work_sessions SET
          total_seconds    = $1,
          regular_seconds  = $2,
          overtime_seconds = $3,
          status           = 'done',
          is_finished      = true,
          finished_at      = NOW(),
          last_exit_time   = $4::TIME,
          outside_since    = NULL,
          updated_at       = NOW()
        WHERE id = $5
      `, [total, regular, overtime, exitStr, sess.session_id]);

      await client.query('COMMIT');

      const h = Math.floor(total/3600);
      const m = Math.floor((total%3600)/60);
      console.log(`✓ ${userId}   ${(user?.full_name || '').padEnd(35)} → chiqdi | Jami: ${h}s ${m}d`);
    }

    console.log('============================================================');
    console.log('✅ 10 ta xodim ishni tugatdi. Dashboard yangilang (F5).');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Xato:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
