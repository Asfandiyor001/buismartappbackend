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

      if (activeLog) {
        await client.query(
          `UPDATE work_logs SET
             exit_time = NOW(),
             exit_lat = COALESCE(entry_lat, 0),
             exit_lon = COALESCE(entry_lon, 0),
             duration_seconds = EXTRACT(EPOCH FROM (NOW() - entry_time))::int,
             is_active = false
           WHERE id = $1`,
          [activeLog.id]
        );
      }

      const sumRes = await client.query(
        `SELECT COALESCE(SUM(duration_seconds), 0)::bigint AS total
         FROM work_logs WHERE session_id = $1`,
        [ws.id]
      );
      const total = Number(sumRes.rows[0].total);
      const regularSeconds = Math.min(total, REGULAR_CAP);
      const now = new Date();
      const overtimeSeconds = isPastWorkEnd(now)
        ? Math.max(0, total - REGULAR_CAP)
        : 0;

      await client.query(
        `UPDATE work_sessions SET
           total_seconds = $1,
           regular_seconds = $2,
           overtime_seconds = $3,
           last_exit_time = CURRENT_TIME,
           updated_at = NOW(),
           is_finished = true,
           finished_at = NOW(),
           status = 'done'
         WHERE id = $4`,
        [total, regularSeconds, overtimeSeconds, ws.id]
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
