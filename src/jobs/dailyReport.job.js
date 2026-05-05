const cron = require('node-cron');
const pool = require('../config/database');

const REGULAR_CAP = 8 * 3600;

function isPastWorkEnd(date = new Date()) {
  const h = date.getHours();
  const m = date.getMinutes();
  return h > 16 || (h === 16 && m >= 30);
}

async function autoCloseOpenSessions() {
  const sessionsRes = await pool.query(
    `SELECT id, user_id FROM work_sessions
     WHERE work_date = CURRENT_DATE AND is_finished = false`
  );

  let closed = 0;
  for (const ws of sessionsRes.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const logRes = await client.query(
        `SELECT * FROM work_logs
         WHERE session_id = $1 AND is_active = true
         LIMIT 1`,
        [ws.id]
      );
      const activeLog = logRes.rows[0];

      // Use 16:30 Tashkent time (+05) as the canonical exit time so cron
      // running at 23:59 does not count the gap as worked hours.
      // Pass an explicit timezone-offset string to avoid timestamptz vs
      // timestamp-without-timezone mismatch on the PostgreSQL side.
      const todayDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const workEndStr = `${todayDate} 16:30:00+05`;

      if (activeLog) {
        await client.query(
          `UPDATE work_logs SET
             exit_time = $1::timestamptz,
             exit_lat = COALESCE(entry_lat, 0),
             exit_lon = COALESCE(entry_lon, 0),
             duration_seconds = EXTRACT(EPOCH FROM ($1::timestamptz - entry_time::timestamptz))::int,
             is_active = false
           WHERE id = $2`,
          [workEndStr, activeLog.id]
        );
      }

      const sumRes = await client.query(
        `SELECT COALESCE(SUM(duration_seconds), 0)::bigint AS total
         FROM work_logs WHERE session_id = $1`,
        [ws.id]
      );
      const total = Number(sumRes.rows[0].total);
      const regularSeconds = Math.min(total, REGULAR_CAP);
      // Cron fires at 23:59 — always past work end, so any seconds over 8 h are overtime
      const overtimeSeconds = Math.max(0, total - REGULAR_CAP);

      await client.query(
        `UPDATE work_sessions SET
           total_seconds = $1,
           regular_seconds = $2,
           overtime_seconds = $3,
           last_exit_time = '16:30:00',
           updated_at = NOW(),
           is_finished = true,
           finished_at = $4,
           status = 'done'
         WHERE id = $5`,
        [total, regularSeconds, overtimeSeconds, workEndStr, ws.id]
      );

      await client.query('COMMIT');
      closed += 1;
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        /* ignore */
      }
      console.error('[dailyReport.job]', e);
    } finally {
      client.release();
    }
  }

  console.log(`[dailyReport.job] Auto-closed ${closed} sessions`);
}

function register() {
  cron.schedule('59 23 * * *', () => {
    autoCloseOpenSessions().catch((e) => console.error('[dailyReport.job]', e));
  });
}

module.exports = { register, autoCloseOpenSessions };
