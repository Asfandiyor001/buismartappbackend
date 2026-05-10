const pool = require('../../config/database');
const { isInsideBuilding } = require('../../utils/gps');
const { nowStr, todayStr, formatDuration } = require('../../utils/time');

const WORK_END_HOUR = 16;
const WORK_END_MINUTE = 30;
const REGULAR_CAP = 8 * 3600;

function isPastWorkEnd(date = new Date()) {
  const h = date.getHours();
  const m = date.getMinutes();
  return h > WORK_END_HOUR || (h === WORK_END_HOUR && m >= WORK_END_MINUTE);
}

function workdaysInMonth(year, month) {
  let count = 0;
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) count += 1;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function addDaysYmd(ymd, days) {
  const [y, mo, da] = ymd.split('-').map(Number);
  const d = new Date(y, mo - 1, da);
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * @param {number} userId
 * @param {number} buildingId
 * @param {number} lat
 * @param {number} lon
 */
async function checkIn(userId, buildingId, lat, lon) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bRes = await client.query(
      'SELECT * FROM buildings WHERE id = $1 AND is_active = true',
      [buildingId]
    );
    const building = bRes.rows[0];
    if (!building) {
      throw new Error('Bino topilmadi');
    }

    if (!isInsideBuilding(lat, lon, building)) {
      throw new Error('Siz binoda emassiz (GPS tasdiqlanmadi)');
    }

    const activeRes = await client.query(
      `SELECT * FROM work_logs
       WHERE user_id = $1 AND is_active = true
       LIMIT 1`,
      [userId]
    );
    if (activeRes.rows.length > 0) {
      throw new Error('Siz allaqachon biror binoda belgilangansiz');
    }

    let sessionRes = await client.query(
      `SELECT * FROM work_sessions
       WHERE user_id = $1 AND work_date = CURRENT_DATE`,
      [userId]
    );
    let session = sessionRes.rows[0];

    if (!session) {
      const ins = await client.query(
        `INSERT INTO work_sessions (user_id, work_date, status)
         VALUES ($1, CURRENT_DATE, 'active')
         RETURNING *`,
        [userId]
      );
      session = ins.rows[0];
    } else if (session.is_finished) {
      // Aktiv log bo'lsa — haqiqatan band
      const activeLogRes = await client.query(
        'SELECT id FROM work_logs WHERE session_id = $1 AND is_active = true LIMIT 1',
        [session.id]
      );
      if (activeLogRes.rows.length > 0) {
        throw new Error('Siz allaqachon biror binoda belgilangansiz');
      }
      // Aktiv log yo'q — xodim tushlikdan qaytgan, sessiyani qayta ochamiz
      await client.query(
        `UPDATE work_sessions SET
           is_finished = false,
           status = 'active',
           finished_at = NULL,
           updated_at = NOW()
         WHERE id = $1`,
        [session.id]
      );
      session = { ...session, is_finished: false, status: 'active' };
    }

    const logsBefore = await client.query(
      'SELECT COUNT(*)::int AS c FROM work_logs WHERE session_id = $1',
      [session.id]
    );
    const priorLogCount = logsBefore.rows[0].c;

    const logIns = await client.query(
      `INSERT INTO work_logs (
         session_id, user_id, building_id,
         entry_time, entry_lat, entry_lon, is_active
       ) VALUES ($1, $2, $3, NOW(), $4, $5, true)
       RETURNING *`,
      [session.id, userId, buildingId, lat, lon]
    );
    const log = logIns.rows[0];

    await client.query(
      `UPDATE work_sessions SET
         first_entry_time = COALESCE(first_entry_time, CURRENT_TIME),
         buildings_visited = buildings_visited + 1,
         building_switches = building_switches + $2,
         status = 'active',
         updated_at = NOW()
       WHERE id = $1`,
      [session.id, priorLogCount > 0 ? 1 : 0]
    );

    const sessionUp = await client.query(
      'SELECT * FROM work_sessions WHERE id = $1',
      [session.id]
    );
    session = sessionUp.rows[0];

    const timeLabel = nowStr();
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES ($1, 'davomat', $2, $3)`,
      [
        userId,
        'Binoga kirildi ✓',
        `${building.name} ga kirdingiz — ${timeLabel}`,
      ]
    );

    await client.query('COMMIT');
    return { log, session, building };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function checkOut(userId, lat, lon) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const logRes = await client.query(
      `SELECT wl.*, b.name AS building_name, b.latitude, b.longitude, b.radius_m
       FROM work_logs wl
       JOIN buildings b ON b.id = wl.building_id
       WHERE wl.user_id = $1 AND wl.is_active = true
       LIMIT 1`,
      [userId]
    );
    const row = logRes.rows[0];
    if (!row) {
      throw new Error('Siz hech qaysi binoda belgilanmagansiz');
    }

    const logId = row.id;
    const sessionId = row.session_id;

    const updLog = await client.query(
      `UPDATE work_logs SET
         exit_time = NOW(),
         exit_lat = $1,
         exit_lon = $2,
         duration_seconds = EXTRACT(EPOCH FROM (NOW() - entry_time))::int,
         is_active = false
       WHERE id = $3
       RETURNING *`,
      [lat, lon, logId]
    );
    const log = updLog.rows[0];

    const sumRes = await client.query(
      `SELECT COALESCE(SUM(duration_seconds), 0)::bigint AS total
       FROM work_logs WHERE session_id = $1`,
      [sessionId]
    );
    const total = Number(sumRes.rows[0].total);
    const regularSeconds = Math.min(total, REGULAR_CAP);
    const isOvertime = isPastWorkEnd();
    const overtimeSeconds = isOvertime ? Math.max(0, total - REGULAR_CAP) : 0;

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
      [total, regularSeconds, overtimeSeconds, sessionId]
    );

    const sessionRes = await client.query(
      'SELECT * FROM work_sessions WHERE id = $1',
      [sessionId]
    );
    const session = sessionRes.rows[0];

    const totalFormatted = formatDuration(total);
    const overtimeFormatted = formatDuration(overtimeSeconds);

    await client.query(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES ($1, 'davomat', $2, $3)`,
      [
        userId,
        'Ish kuni yakunlandi ✓',
        `Bugun ${totalFormatted} ishladingiz. Qo'shimcha: ${overtimeFormatted}`,
      ]
    );

    await client.query('COMMIT');
    return {
      log,
      session,
      totalFormatted,
      overtimeFormatted,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getToday(userId) {
  const res = await pool.query(
    `SELECT
      ws.*,

      -- Live total: closed logs + current active log duration
      (
        COALESCE(
          (SELECT SUM(duration_seconds)
           FROM work_logs
           WHERE session_id = ws.id
             AND is_active = false
             AND duration_seconds IS NOT NULL),
        0)
        +
        COALESCE(
          (SELECT EXTRACT(EPOCH FROM (NOW() - entry_time))::INT
           FROM work_logs
           WHERE session_id = ws.id
             AND is_active = true
           LIMIT 1),
        0)
      ) AS live_total_seconds,

      -- Active log info
      (SELECT json_build_object(
        'id', wl.id,
        'buildingId', wl.building_id,
        'buildingName', b.name,
        'buildingShort', b.short_name,
        'entryTime', wl.entry_time,
        'secondsInBuilding',
          EXTRACT(EPOCH FROM (NOW() - wl.entry_time))::INT,
        'isActive', wl.is_active,
        'checkoutReason', wl.checkout_reason
      )
      FROM work_logs wl
      JOIN buildings b ON b.id = wl.building_id
      WHERE wl.session_id = ws.id
        AND wl.is_active = true
      LIMIT 1) AS active_log,

      -- All logs today with live duration for active entry
      (SELECT json_agg(
        json_build_object(
          'id', wl.id,
          'buildingId', wl.building_id,
          'buildingName', b.name,
          'buildingShort', b.short_name,
          'entryTime', wl.entry_time,
          'exitTime', wl.exit_time,
          'durationSeconds',
            CASE
              WHEN wl.is_active = true
              THEN EXTRACT(EPOCH FROM (NOW() - wl.entry_time))::INT
              ELSE wl.duration_seconds
            END,
          'isActive', wl.is_active,
          'isOvertime', wl.is_overtime,
          'checkoutReason', wl.checkout_reason
        ) ORDER BY wl.entry_time
      )
      FROM work_logs wl
      JOIN buildings b ON b.id = wl.building_id
      WHERE wl.session_id = ws.id) AS logs

    FROM work_sessions ws
    WHERE ws.user_id = $1
      AND ws.work_date = CURRENT_DATE`,
    [userId]
  );

  if (res.rows.length === 0) return null;
  const row = res.rows[0];

  const liveTotal  = parseInt(row.live_total_seconds || 0);
  const now        = new Date();
  const nowMins    = now.getHours() * 60 + now.getMinutes();
  const WORK_END_MINS = 16 * 60 + 30; // 990

  const activeLog = row.active_log
    ? (typeof row.active_log === 'string' ? JSON.parse(row.active_log) : row.active_log)
    : null;
  const logs = row.logs
    ? (typeof row.logs === 'string' ? JSON.parse(row.logs) : row.logs)
    : [];

  const isAfterWork  = nowMins > WORK_END_MINS;
  const hasActiveLog = activeLog !== null;

  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0;
  const isDayOff = dayOfWeek === 0;

  const liveRegular  = Math.min(liveTotal, 8 * 3600);
  // Overtime only accrues when staff is actively inside a building AND it is past 16:30
  const liveOvertime = (isAfterWork && hasActiveLog)
    ? Math.max(0, liveTotal - 8 * 3600)
    : 0;

  return {
    id: row.id,
    workDate: row.work_date,
    status: row.status,
    isFinished: row.is_finished,
    firstEntryTime: row.first_entry_time,
    lastExitTime: row.last_exit_time,
    totalSeconds: Number(row.total_seconds) || 0,
    regularSeconds: Number(row.regular_seconds) || 0,
    overtimeSeconds: Number(row.overtime_seconds) || 0,
    buildingsVisited: row.buildings_visited,
    buildingSwitches: row.building_switches,
    liveTotal,
    liveRegular,
    liveOvertime,
    isAfterWork,
    hasActiveLog,
    activeLog,
    logs,
    isWeekend,
    isDayOff,
  };
}

async function getWeek(userId, fromDate) {
  const toDate = addDaysYmd(fromDate, 7);
  const res = await pool.query(
    `SELECT work_date, total_seconds, regular_seconds,
            overtime_seconds, status, buildings_visited,
            first_entry_time, last_exit_time
     FROM work_sessions
     WHERE user_id = $1
       AND work_date >= $2::date
       AND work_date < $3::date
     ORDER BY work_date ASC`,
    [userId, fromDate, toDate]
  );

  const byDate = new Map();
  for (const r of res.rows) {
    const key =
      r.work_date instanceof Date
        ? todayStr(r.work_date)
        : String(r.work_date).slice(0, 10);
    byDate.set(key, r);
  }

  const out = [];
  for (let i = 0; i < 7; i += 1) {
    const key = addDaysYmd(fromDate, i);
    out.push(byDate.has(key) ? byDate.get(key) : null);
  }
  return out;
}

async function getMonth(userId, year, month) {
  const res = await pool.query(
    `SELECT ws.*,
            COUNT(wl.id)::int AS total_logs,
            COALESCE(SUM(wl.duration_seconds), 0)::bigint AS computed_total
     FROM work_sessions ws
     LEFT JOIN work_logs wl ON wl.session_id = ws.id
     WHERE ws.user_id = $1
       AND EXTRACT(YEAR FROM ws.work_date) = $2
       AND EXTRACT(MONTH FROM ws.work_date) = $3
     GROUP BY ws.id
     ORDER BY ws.work_date ASC`,
    [userId, year, month]
  );

  const rows = res.rows;
  let sumTotal = 0;
  let sumRegular = 0;
  let sumOvertime = 0;
  let presentDays = 0;

  for (const r of rows) {
    sumTotal += Number(r.total_seconds) || 0;
    sumRegular += Number(r.regular_seconds) || 0;
    sumOvertime += Number(r.overtime_seconds) || 0;
    const hasPresence =
      (Number(r.total_seconds) || 0) > 0 || r.first_entry_time != null;
    if (hasPresence) presentDays += 1;
  }

  const workdays = workdaysInMonth(year, month);
  const attendancePct =
    workdays > 0 ? Math.round((presentDays / workdays) * 10000) / 100 : 0;

  const summary = {
    totalDays: presentDays,
    totalHours: Math.round((sumTotal / 3600) * 100) / 100,
    regularHours: Math.round((sumRegular / 3600) * 100) / 100,
    overtimeHours: Math.round((sumOvertime / 3600) * 100) / 100,
    attendancePct,
  };

  return { sessions: rows, summary };
}

async function getActiveLog(userId) {
  const res = await pool.query(
    `SELECT wl.*, b.name AS building_name, b.short_name AS building_short_name
     FROM work_logs wl
     JOIN buildings b ON b.id = wl.building_id
     WHERE wl.user_id = $1 AND wl.is_active = true
     LIMIT 1`,
    [userId]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  const secondsInBuilding = row.entry_time
    ? Math.floor((Date.now() - new Date(row.entry_time).getTime()) / 1000)
    : 0;
  return {
    id: row.id,
    buildingId: row.building_id,
    buildingName: row.building_name,
    buildingShort: row.building_short_name,
    entryTime: row.entry_time,
    secondsInBuilding,
    isActive: row.is_active,
    checkoutReason: row.checkout_reason,
  };
}

async function resetTodaySession(userId) {
  const sessionRes = await pool.query(
    'SELECT * FROM work_sessions WHERE user_id = $1 AND work_date = CURRENT_DATE',
    [userId]
  );
  const session = sessionRes.rows[0];
  if (!session) {
    throw new Error('Bugungi sessiya topilmadi');
  }

  const activeLogRes = await pool.query(
    'SELECT id FROM work_logs WHERE session_id = $1 AND is_active = true LIMIT 1',
    [session.id]
  );
  if (activeLogRes.rows.length > 0) {
    throw new Error('Avval binoni tasdiqlang (aktiv kirish mavjud)');
  }

  await pool.query(
    `UPDATE work_sessions SET
       is_finished = false,
       status = 'active',
       finished_at = NULL,
       updated_at = NOW()
     WHERE id = $1`,
    [session.id]
  );

  return { message: 'Sessiya qayta faollashtirildi', sessionId: session.id };
}

module.exports = {
  checkIn,
  checkOut,
  getToday,
  getWeek,
  getMonth,
  getActiveLog,
  resetTodaySession,
};
