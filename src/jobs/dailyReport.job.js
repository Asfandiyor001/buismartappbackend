const cron = require('node-cron');
const pool = require('../config/database');
const { safeExitTime } = require('../modules/work/geofence.service');

const REGULAR_CAP = 8 * 3600;

const MAX_RETRIES = 10;
const RETRY_INTERVAL = 40; // minutes

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const retryTimeouts = new Map();

function clearRetryTimerFor(targetDate) {
  const id = retryTimeouts.get(targetDate);
  if (id) {
    clearTimeout(id);
    retryTimeouts.delete(targetDate);
  }
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
        const safeExit = safeExitTime(activeLog.entry_time, workEndStr);
        await client.query(
          `UPDATE work_logs SET
             exit_time = $1::timestamptz,
             exit_lat = COALESCE(entry_lat, 0),
             exit_lon = COALESCE(entry_lon, 0),
             duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - entry_time::timestamptz)))::int,
             is_active = false
           WHERE id = $2`,
          [safeExit, activeLog.id]
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

/** Same closing logic as autoCloseOpenSessions for an explicit calendar date (retry / startup). */
async function autoCloseOpenSessionsForDate(targetDate) {
  const sessionsRes = await pool.query(
    `SELECT id, user_id FROM work_sessions
     WHERE work_date = $1::date AND is_finished = false`,
    [targetDate]
  );

  let closed = 0;
  const workEndStr = `${targetDate} 16:30:00+05`;

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
        const safeExit = safeExitTime(activeLog.entry_time, workEndStr);
        await client.query(
          `UPDATE work_logs SET
             exit_time = $1::timestamptz,
             exit_lat = COALESCE(entry_lat, 0),
             exit_lon = COALESCE(entry_lon, 0),
             duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - entry_time::timestamptz)))::int,
             is_active = false
           WHERE id = $2`,
          [safeExit, activeLog.id]
        );
      }

      const sumRes = await client.query(
        `SELECT COALESCE(SUM(duration_seconds), 0)::bigint AS total
         FROM work_logs WHERE session_id = $1`,
        [ws.id]
      );
      const total = Number(sumRes.rows[0].total);
      const regularSeconds = Math.min(total, REGULAR_CAP);
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

  console.log(`[dailyReport.job] Auto-closed ${closed} sessions (date ${targetDate})`);
}

async function closeSessionsForDate(targetDate) {
  const { rows } = await pool.query(
    `
    SELECT COUNT(*)::text AS count
    FROM work_sessions
    WHERE work_date = $1::date
      AND is_finished = false
    `,
    [targetDate]
  );

  const count = parseInt(rows[0].count, 10);

  if (count === 0) {
    console.log(`[dailyReport] ${targetDate} — barcha sessiyalar yopilgan ✅`);
    return true;
  }

  console.log(`[dailyReport] ${targetDate} — ${count} ta yopilmagan sessiya, yopilmoqda...`);
  await autoCloseOpenSessionsForDate(targetDate);

  const { rows: rows2 } = await pool.query(
    `
    SELECT COUNT(*)::text AS count
    FROM work_sessions
    WHERE work_date = $1::date
      AND is_finished = false
    `,
    [targetDate]
  );

  const remaining = parseInt(rows2[0].count, 10);
  console.log(`[dailyReport] ${targetDate} — qoldi: ${remaining} ta`);
  return remaining === 0;
}

async function runWithRetry(targetDate, attempt = 1) {
  if (attempt > MAX_RETRIES) {
    console.log(`[dailyReport] ${targetDate} — ${MAX_RETRIES} marta urinildi, to'xtatildi`);
    clearRetryTimerFor(targetDate);
    return;
  }

  try {
    console.log(`[dailyReport] ${targetDate} — ${attempt}-urinish...`);
    const success = await closeSessionsForDate(targetDate);

    if (success) {
      clearRetryTimerFor(targetDate);
      console.log(`[dailyReport] ${targetDate} — muvaffaqiyatli ✅`);
      return;
    }

    console.log(
      `[dailyReport] ${attempt}-urinish muvaffaqiyatsiz, ${RETRY_INTERVAL} daqiqadan keyin qayta...`
    );
  } catch (e) {
    console.error(`[dailyReport] ${attempt}-urinish xatosi:`, e.message);
  }

  const tid = setTimeout(() => {
    retryTimeouts.delete(targetDate);
    runWithRetry(targetDate, attempt + 1).catch((err) =>
      console.error('[dailyReport.job]', err)
    );
  }, RETRY_INTERVAL * 60 * 1000);
  retryTimeouts.set(targetDate, tid);
}

async function runDailyReport() {
  const now = new Date();
  const hour = now.getHours();

  const targetDate =
    hour < 6
      ? (() => {
          const d = new Date(now);
          d.setDate(d.getDate() - 1);
          return d.toISOString().slice(0, 10);
        })()
      : now.toISOString().slice(0, 10);

  console.log(`[dailyReport] Boshlanmoqda: ${targetDate}`);
  await runWithRetry(targetDate, 1);
}

function register() {
  cron.schedule(
    '59 23 * * *',
    () => {
      runDailyReport().catch((e) => console.error('[dailyReport.job]', e));
    },
    { timezone: 'Asia/Tashkent' }
  );

  setTimeout(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    console.log(`[dailyReport] Startup tekshiruvi: ${yesterdayStr}`);
    runWithRetry(yesterdayStr, 1).catch((e) => console.error('[dailyReport.job]', e));
  }, 10000);
}

module.exports = { register, autoCloseOpenSessions };
