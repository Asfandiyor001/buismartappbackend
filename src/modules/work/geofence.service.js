const pool = require('../../config/database');
const { nowStr } = require('../../utils/time');

const AUTO_CHECKOUT_MINUTES = 15;
/** No ping for this long → auto-finish session at last_ping_at (ghost-session guard). */
const INACTIVE_SESSION_MINUTES = 30;

const WORK_END_HOUR = 16;
const WORK_END_MINUTE = 30;
const REGULAR_CAP = 8 * 3600;

function isPastWorkEnd(date = new Date()) {
  const h = date.getHours();
  const m = date.getMinutes();
  return h > WORK_END_HOUR || (h === WORK_END_HOUR && m >= WORK_END_MINUTE);
}

function formatBugunIshBody(totalSeconds) {
  const total = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `Bugun ${h} soat ${m} daqiqa ishladingiz.`;
}

async function notifyDavomatCheckIn(dbOrClient, userId, atDate = new Date()) {
  await dbOrClient.query(
    `INSERT INTO notifications (user_id, type, title, body)
     VALUES ($1, 'davomat', $2, $3)`,
    [
      userId,
      'Binoga kirildi ✓',
      `Bino hududiga kirdingiz — ${nowStr(atDate)}`,
    ]
  );
}

async function notifyDavomatCheckOut(dbOrClient, userId, totalSeconds) {
  await dbOrClient.query(
    `INSERT INTO notifications (user_id, type, title, body)
     VALUES ($1, 'davomat', $2, $3)`,
    [
      userId,
      'Ish kuni yakunlandi ✓',
      formatBugunIshBody(totalSeconds),
    ]
  );
}

async function finalizePing(pingId, result) {
  if (!pingId || !result || !result.action) return;
  try {
    await pool.query('UPDATE gps_pings SET action = $1 WHERE id = $2', [
      result.action,
      pingId,
    ]);
  } catch (_) {
    /* ping row still stored; action update is best-effort */
  }
}

/** Nearest active building and distance in meters (Haversine). */
async function nearestBuilding(lat, lon) {
  const buildings = await pool.query(
    `
    SELECT *,
      (2 * 6371000 * asin(least(1, sqrt(
        power(sin(radians(($1::float8 - latitude::float8) / 2)), 2) +
        cos(radians($1::float8)) * cos(radians(latitude::float8)) *
        power(sin(radians(($2::float8 - longitude::float8) / 2)), 2)
      )))) AS dist_m
    FROM buildings
    WHERE is_active = true
    ORDER BY dist_m ASC
    LIMIT 1
  `,
    [lat, lon]
  );
  return buildings.rows[0] || null;
}

async function recalcSession(sessionId, client) {
  const dbOrClient = client || pool;
  const { rows } = await dbOrClient.query(
    `
    SELECT COALESCE(SUM(duration_seconds), 0)::bigint AS total
    FROM work_logs
    WHERE session_id = $1 AND duration_seconds IS NOT NULL
  `,
    [sessionId]
  );

  const total = parseInt(rows[0].total, 10);
  const regular = Math.min(total, REGULAR_CAP);

  const now = new Date();
  const isOT = isPastWorkEnd(now);
  const overtime = isOT ? Math.max(0, total - REGULAR_CAP) : 0;

  await dbOrClient.query(
    `
    UPDATE work_sessions SET
      total_seconds    = $1,
      regular_seconds  = $2,
      overtime_seconds = $3,
      updated_at       = NOW()
    WHERE id = $4
  `,
    [total, regular, overtime, sessionId]
  );

  return { total, regular, overtime };
}

async function getTodaySession(userId, client) {
  const dbOrClient = client || pool;
  const { rows } = await dbOrClient.query(
    `
    SELECT ws.*,
      wl.id          AS active_log_id,
      wl.building_id AS active_building_id,
      wl.entry_time  AS active_entry_time
    FROM work_sessions ws
    LEFT JOIN work_logs wl
      ON wl.session_id = ws.id AND wl.is_active = true
    WHERE ws.user_id = $1 AND ws.work_date = CURRENT_DATE
  `,
    [userId]
  );

  return rows[0] || null;
}

async function closeActiveLog(logId, exitTime, reason, client) {
  const dbOrClient = client || pool;
  await dbOrClient.query(
    `
    UPDATE work_logs SET
      exit_time        = $1,
      duration_seconds = EXTRACT(EPOCH FROM ($2::timestamptz - entry_time::timestamptz))::INT,
      is_active        = false,
      checkout_reason  = $3
    WHERE id = $4
  `,
    [exitTime, exitTime, reason, logId]
  );
}

/**
 * Admin / cron helper: sessions stuck "active" with no fresh ping are closed at last_ping_at.
 * Exit time = last known live moment; checkout_reason = system_timeout.
 */
async function finalizeInactiveSessions() {
  const staleMin = Number(INACTIVE_SESSION_MINUTES);
  if (!Number.isFinite(staleMin) || staleMin < 1 || staleMin > 24 * 60) {
    throw new Error('INACTIVE_SESSION_MINUTES must be between 1 and 1440');
  }

  const { rows: candidates } = await pool.query(
    `
    SELECT id, last_ping_at
    FROM work_sessions
    WHERE status = 'active'
      AND is_finished = false
      AND last_ping_at IS NOT NULL
      AND last_ping_at < NOW() - (${staleMin} * INTERVAL '1 minute')
    ORDER BY id
  `
  );

  let finalized = 0;

  for (const row of candidates) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: locked } = await client.query(
        `
        SELECT id, last_ping_at, user_id
        FROM work_sessions
        WHERE id = $1
          AND status = 'active'
          AND is_finished = false
          AND last_ping_at IS NOT NULL
          AND last_ping_at < NOW() - (${staleMin} * INTERVAL '1 minute')
        FOR UPDATE
      `,
        [row.id]
      );

      const sess = locked[0];
      if (!sess) {
        await client.query('COMMIT');
        continue;
      }

      const exitAt = sess.last_ping_at;

      const { rows: activeLogs } = await client.query(
        `
        SELECT id FROM work_logs
        WHERE session_id = $1 AND is_active = true
        LIMIT 1
      `,
        [sess.id]
      );

      if (activeLogs[0]) {
        await closeActiveLog(activeLogs[0].id, exitAt, 'system_timeout', client);
      }

      const totals = await recalcSession(sess.id, client);
      await notifyDavomatCheckOut(client, sess.user_id, totals.total);

      await client.query(
        `
        UPDATE work_sessions SET
          status          = 'done',
          is_finished     = true,
          finished_at     = $2::timestamptz,
          last_exit_time  = ($2::timestamptz)::time,
          outside_since   = NULL,
          updated_at      = NOW()
        WHERE id = $1
      `,
        [sess.id, exitAt]
      );

      await client.query('COMMIT');
      finalized += 1;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        /* */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  return { finalized, scanned: candidates.length };
}

/**
 * Same-day return after gps_lost (or any path that set done/finished): reopen session
 * so admins see the worker as active again when a new work_log is opened.
 */
async function resurrectSessionIfClosed(sessionId, client) {
  const dbOrClient = client || pool;
  await dbOrClient.query(
    `
    UPDATE work_sessions SET
      status       = 'active',
      is_finished  = false,
      finished_at  = NULL,
      updated_at   = NOW()
    WHERE id = $1
      AND (status = 'done' OR is_finished = true)
  `,
    [sessionId]
  );
}

async function openNewLog(sessionId, userId, buildingId, lat, lon, client) {
  const dbOrClient = client || pool;
  await resurrectSessionIfClosed(sessionId, client);
  const { rows } = await dbOrClient.query(
    `
    INSERT INTO work_logs
      (session_id, user_id, building_id, entry_time,
       entry_lat, entry_lon, is_active, checkout_reason)
    VALUES ($1, $2, $3, NOW(), $4, $5, true, 'manual')
    RETURNING *
  `,
    [sessionId, userId, buildingId, lat, lon]
  );
  return rows[0];
}

async function processPing(userId, lat, lon, accuracy) {
  const building = await nearestBuilding(lat, lon);
  if (!building) {
    return { action: 'no_buildings' };
  }

  const distM = Number(building.dist_m);
  const isInside = distM <= Number(building.radius_m);

  const pingIns = await pool.query(
    `
    INSERT INTO gps_pings
      (user_id, latitude, longitude, accuracy_m,
       building_id, distance_m, is_inside)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `,
    [
      userId,
      lat,
      lon,
      accuracy,
      isInside ? building.id : null,
      distM,
      isInside,
    ]
  );
  const pingId = pingIns.rows[0].id;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Work-time guards — computed once per ping cycle
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const WORK_START_MINS = 480; // 08:00
    const WORK_END_MINS   = 990; // 16:30
    const ABET_START_MINS = 780; // 13:00
    const ABET_END_MINS   = 840; // 14:00

    const session = await getTodaySession(userId, client);

    if (isInside) {
      if (!session) {
        // Do not auto-checkin before work starts (08:00)
        if (nowMins < WORK_START_MINS) {
          await client.query('ROLLBACK');
          const out = { action: 'before_work_time', message: 'Ish vaqti boshlanmagan (08:00 dan)' };
          await finalizePing(pingId, out);
          return out;
        }
        // Do not create a new session after work ends (16:30)
        if (nowMins > WORK_END_MINS) {
          await client.query('ROLLBACK');
          const out = { action: 'after_work_time', message: 'Ish vaqti tugagan (16:30 dan keyin)' };
          await finalizePing(pingId, out);
          return out;
        }

        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
          now.getMinutes()
        ).padStart(2, '0')}`;

        const {
          rows: [newSession],
        } = await client.query(
          `
          INSERT INTO work_sessions
            (user_id, work_date, first_entry_time,
             status, last_ping_at, buildings_visited)
          VALUES ($1, CURRENT_DATE, $2::TIME, 'active', NOW(), 1)
          RETURNING *
        `,
          [userId, timeStr]
        );

        await openNewLog(newSession.id, userId, building.id, lat, lon, client);
        await notifyDavomatCheckIn(client, userId, now);
        await client.query('COMMIT');
        const out = {
          action: 'auto_checkin',
          buildingId: building.id,
          buildingName: building.name,
        };
        await finalizePing(pingId, out);
        return out;
      }

      if (session.active_log_id && session.active_building_id === building.id) {
        await client.query(
          `
          UPDATE work_sessions SET
            last_ping_at  = NOW(),
            outside_since = NULL
          WHERE id = $1
        `,
          [session.id]
        );
        await client.query('COMMIT');
        const out = { action: 'inside_same', buildingId: building.id };
        await finalizePing(pingId, out);
        return out;
      }

      if (session.active_log_id && session.active_building_id !== building.id) {
        await closeActiveLog(session.active_log_id, new Date(), 'auto_gps', client);
        const totalsSwitch = await recalcSession(session.id, client);
        await notifyDavomatCheckOut(client, userId, totalsSwitch.total);
        await openNewLog(session.id, userId, building.id, lat, lon, client);
        await notifyDavomatCheckIn(client, userId);
        await client.query(
          `
          UPDATE work_sessions SET
            last_ping_at      = NOW(),
            outside_since     = NULL,
            building_switches = building_switches + 1,
            buildings_visited = buildings_visited + 1
          WHERE id = $1
        `,
          [session.id]
        );
        await recalcSession(session.id, client);
        await client.query('COMMIT');
        const out = {
          action: 'auto_switch',
          buildingId: building.id,
          buildingName: building.name,
        };
        await finalizePing(pingId, out);
        return out;
      }

      if (!session.active_log_id) {
        await openNewLog(session.id, userId, building.id, lat, lon, client);
        await notifyDavomatCheckIn(client, userId);
        await client.query(
          `
          UPDATE work_sessions SET
            last_ping_at  = NOW(),
            outside_since = NULL,
            status          = 'active',
            buildings_visited = buildings_visited + 1
          WHERE id = $1
        `,
          [session.id]
        );
        await client.query('COMMIT');
        const out = { action: 'auto_recheckin', buildingId: building.id };
        await finalizePing(pingId, out);
        return out;
      }
    } else {
      if (!session || session.is_finished) {
        await client.query('ROLLBACK');
        const out = { action: 'no_session' };
        await finalizePing(pingId, out);
        return out;
      }

      if (!session.active_log_id) {
        await client.query(
          `
          UPDATE work_sessions SET last_ping_at = NOW()
          WHERE id = $1
        `,
          [session.id]
        );
        await client.query('COMMIT');
        const out = { action: 'outside_no_log', distanceM: distM };
        await finalizePing(pingId, out);
        return out;
      }

      // After 16:30: close the active log immediately at exactly 16:30 and finish the session.
      // Do not wait for the 15-minute outside countdown once the work day is over.
      if (nowMins > WORK_END_MINS) {
        const exitTime = new Date();
        exitTime.setHours(WORK_END_HOUR, WORK_END_MINUTE, 0, 0);
        await closeActiveLog(session.active_log_id, exitTime, 'auto_gps', client);
        const totalsEOD = await recalcSession(session.id, client);
        await notifyDavomatCheckOut(client, userId, totalsEOD.total);
        await client.query(
          `
          UPDATE work_sessions SET
            is_finished   = true,
            status        = 'done',
            finished_at   = NOW(),
            outside_since = NULL,
            last_ping_at  = NOW()
          WHERE id = $1
        `,
          [session.id]
        );
        await client.query('COMMIT');
        const out = { action: 'auto_checkout_end_of_day', exitTime };
        await finalizePing(pingId, out);
        return out;
      }

      if (!session.outside_since) {
        await client.query(
          `
          UPDATE work_sessions SET
            outside_since = NOW(),
            last_ping_at  = NOW()
          WHERE id = $1
        `,
          [session.id]
        );
        await client.query('COMMIT');
        const out = { action: 'outside_start', distanceM: distM };
        await finalizePing(pingId, out);
        return out;
      }

      const outsideSince = new Date(session.outside_since);
      const minutesOutside = (now - outsideSince) / 1000 / 60;

      // Abet (13:00–14:00): suspend auto-checkout during lunch break.
      // Checked BEFORE the 15-minute countdown so staff leaving at 12:50+ are not penalised.
      const isAbetTime = nowMins >= ABET_START_MINS && nowMins < ABET_END_MINS;
      if (isAbetTime) {
        await client.query(
          `UPDATE work_sessions SET last_ping_at = NOW() WHERE id = $1`,
          [session.id]
        );
        await client.query('COMMIT');
        const out = { action: 'abet_time', skipped: true };
        await finalizePing(pingId, out);
        return out;
      }

      if (minutesOutside < AUTO_CHECKOUT_MINUTES) {
        await client.query(
          `
          UPDATE work_sessions SET last_ping_at = NOW()
          WHERE id = $1
        `,
          [session.id]
        );
        await client.query('COMMIT');
        const out = {
          action: 'outside_waiting',
          minutesOutside: Math.floor(minutesOutside),
        };
        await finalizePing(pingId, out);
        return out;
      }

      await closeActiveLog(session.active_log_id, outsideSince, 'auto_gps', client);
      const totalsCheckout = await recalcSession(session.id, client);
      await notifyDavomatCheckOut(client, userId, totalsCheckout.total);

      const exitTimeStr = `${String(outsideSince.getHours()).padStart(2, '0')}:${String(
        outsideSince.getMinutes()
      ).padStart(2, '0')}`;

      await client.query(
        `
        UPDATE work_sessions SET
          outside_since = NULL,
          last_ping_at  = NOW(),
          last_exit_time = $1::TIME,
          auto_checkout = true
        WHERE id = $2
      `,
        [exitTimeStr, session.id]
      );

      await client.query('COMMIT');
      const out = {
        action: 'auto_checkout',
        minutesOutside: Math.floor(minutesOutside),
        exitTime: outsideSince,
      };
      await finalizePing(pingId, out);
      return out;
    }

    await client.query('ROLLBACK');
    const out = { action: 'unknown' };
    await finalizePing(pingId, out);
    return out;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* already committed or no active transaction */
    }
    await finalizePing(pingId, { action: 'error' });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * processPingAt — same logic as processPing but uses a historical timestamp
 * for last_ping_at and for any new log's entry_time instead of NOW().
 */
async function processPingAt(userId, lat, lon, accuracy, timestamp) {
  const building = await nearestBuilding(lat, lon);
  if (!building) return { action: 'no_buildings' };

  const distM = Number(building.dist_m);
  const isInside = distM <= Number(building.radius_m);

  // Store historical ping
  const pingIns = await pool.query(
    `
    INSERT INTO gps_pings
      (user_id, latitude, longitude, accuracy_m,
       building_id, distance_m, is_inside, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
  `,
    [
      userId, lat, lon, accuracy,
      isInside ? building.id : null, distM, isInside,
      timestamp,
    ]
  );
  const pingId = pingIns.rows[0].id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const session = await getTodaySessionAt(userId, timestamp, client);

    if (isInside) {
      if (!session) {
        const timeStr = `${String(timestamp.getHours()).padStart(2, '0')}:${String(timestamp.getMinutes()).padStart(2, '0')}`;
        const { rows: [newSession] } = await client.query(
          `
          INSERT INTO work_sessions
            (user_id, work_date, first_entry_time, status, last_ping_at, buildings_visited)
          VALUES ($1, $2::date, $3::TIME, 'active', $4, 1)
          RETURNING *
        `,
          [userId, timestamp, timeStr, timestamp]
        );
        await openNewLogAt(newSession.id, userId, building.id, lat, lon, timestamp, client);
        await notifyDavomatCheckIn(client, userId, timestamp);
        await client.query('COMMIT');
        const out = { action: 'auto_checkin', buildingId: building.id, buildingName: building.name };
        await finalizePing(pingId, out);
        return out;
      }

      if (session.active_log_id && session.active_building_id === building.id) {
        await client.query(
          `UPDATE work_sessions SET last_ping_at = $1, outside_since = NULL WHERE id = $2`,
          [timestamp, session.id]
        );
        await client.query('COMMIT');
        const out = { action: 'inside_same', buildingId: building.id };
        await finalizePing(pingId, out);
        return out;
      }

      if (session.active_log_id && session.active_building_id !== building.id) {
        await closeActiveLog(session.active_log_id, timestamp, 'auto_gps', client);
        const totalsSwitchAt = await recalcSession(session.id, client);
        await notifyDavomatCheckOut(client, userId, totalsSwitchAt.total);
        await openNewLogAt(session.id, userId, building.id, lat, lon, timestamp, client);
        await notifyDavomatCheckIn(client, userId, timestamp);
        await client.query(
          `
          UPDATE work_sessions SET
            last_ping_at = $1, outside_since = NULL,
            building_switches = building_switches + 1,
            buildings_visited = buildings_visited + 1
          WHERE id = $2
        `,
          [timestamp, session.id]
        );
        await recalcSession(session.id, client);
        await client.query('COMMIT');
        const out = { action: 'auto_switch', buildingId: building.id, buildingName: building.name };
        await finalizePing(pingId, out);
        return out;
      }

      if (!session.active_log_id) {
        await openNewLogAt(session.id, userId, building.id, lat, lon, timestamp, client);
        await notifyDavomatCheckIn(client, userId, timestamp);
        await client.query(
          `
          UPDATE work_sessions SET
            last_ping_at = $1, outside_since = NULL,
            status = 'active', buildings_visited = buildings_visited + 1
          WHERE id = $2
        `,
          [timestamp, session.id]
        );
        await client.query('COMMIT');
        const out = { action: 'auto_recheckin', buildingId: building.id };
        await finalizePing(pingId, out);
        return out;
      }
    } else {
      if (!session || session.is_finished) {
        await client.query('ROLLBACK');
        const out = { action: 'no_session' };
        await finalizePing(pingId, out);
        return out;
      }
      await client.query(
        `UPDATE work_sessions SET last_ping_at = $1 WHERE id = $2`,
        [timestamp, session.id]
      );
      await client.query('COMMIT');
      const out = { action: 'outside', distanceM: distM };
      await finalizePing(pingId, out);
      return out;
    }

    await client.query('ROLLBACK');
    const out = { action: 'unknown' };
    await finalizePing(pingId, out);
    return out;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* */ }
    await finalizePing(pingId, { action: 'error' });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * autoCheckoutAt — immediately close the active work_log and session
 * at the given historical timestamp with checkout_reason = 'gps_lost'.
 *
 * Two cases handled:
 *  A) A log is still active (is_active = true)  → close it now with gps_lost.
 *  B) No active log (already closed by a later ping sync) → find the most
 *     recent log for this session whose exit_time >= gps_off timestamp and
 *     forcibly stamp its checkout_reason as 'gps_lost'.
 */
async function autoCheckoutAt(userId, timestamp) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const session = await getTodaySessionAt(userId, timestamp, client);

    if (!session || session.is_finished) {
      await client.query('ROLLBACK');
      return { action: 'no_active_session' };
    }

    const exitTimeStr = `${String(timestamp.getHours()).padStart(2, '0')}:${String(timestamp.getMinutes()).padStart(2, '0')}`;

    if (session.active_log_id) {
      // Case A: log is still open — close it at the historical timestamp
      await closeActiveLog(session.active_log_id, timestamp, 'gps_lost', client);

      // Explicit safety UPDATE: ensure checkout_reason is 'gps_lost' on the
      // closed row (guards against any future change in closeActiveLog's default)
      await client.query(
        `UPDATE work_logs SET checkout_reason = 'gps_lost' WHERE id = $1`,
        [session.active_log_id]
      );

      const totalsGps = await recalcSession(session.id, client);
      await notifyDavomatCheckOut(client, userId, totalsGps.total);

      await client.query(
        `
        UPDATE work_sessions SET
          outside_since  = NULL,
          last_ping_at   = $1,
          last_exit_time = $2::TIME,
          auto_checkout  = true,
          is_finished    = true,
          finished_at    = $1,
          status         = 'done'
        WHERE id = $3
      `,
        [timestamp, exitTimeStr, session.id]
      );

      await client.query('COMMIT');
      return { action: 'gps_lost_checkout', logId: session.active_log_id, exitTime: timestamp };
    }

    // Case B: no currently-active log (e.g. a subsequent offline ping already
    // auto-checked out the user).  Find the most-recent log for this session
    // that was closed at or after the gps_off timestamp and re-stamp it.
    const { rows: recentLogs } = await client.query(
      `
      SELECT id, exit_time, checkout_reason
      FROM work_logs
      WHERE session_id = $1
        AND is_active   = false
        AND exit_time  >= $2
      ORDER BY exit_time ASC
      LIMIT 1
    `,
      [session.id, timestamp]
    );

    if (recentLogs.length === 0) {
      await client.query('ROLLBACK');
      return { action: 'no_closeable_log' };
    }

    const targetLog = recentLogs[0];
    await client.query(
      `UPDATE work_logs SET checkout_reason = 'gps_lost' WHERE id = $1`,
      [targetLog.id]
    );

    const exitTimeStrB = targetLog.exit_time
      ? `${String(new Date(targetLog.exit_time).getHours()).padStart(2, '0')}:${String(
          new Date(targetLog.exit_time).getMinutes()
        ).padStart(2, '0')}`
      : null;
    if (exitTimeStrB) {
      await client.query(
        `
        UPDATE work_sessions SET
          last_exit_time = $1::TIME,
          auto_checkout  = true,
          is_finished    = true,
          finished_at    = COALESCE(finished_at, $2::timestamptz),
          status         = 'done'
        WHERE id = $3 AND is_finished = false
      `,
        [exitTimeStrB, targetLog.exit_time, session.id]
      );
    }

    const totalsRestamp = await recalcSession(session.id, client);
    await notifyDavomatCheckOut(client, userId, totalsRestamp.total);

    await client.query('COMMIT');
    return { action: 'gps_lost_restamped', logId: targetLog.id, exitTime: targetLog.exit_time };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* */ }
    throw err;
  } finally {
    client.release();
  }
}

/** getTodaySessionAt — like getTodaySession but for a specific date derived from timestamp */
async function getTodaySessionAt(userId, timestamp, client) {
  const dbOrClient = client || pool;
  const dateStr = timestamp.toISOString().slice(0, 10);
  const { rows } = await dbOrClient.query(
    `
    SELECT ws.*,
      wl.id          AS active_log_id,
      wl.building_id AS active_building_id,
      wl.entry_time  AS active_entry_time
    FROM work_sessions ws
    LEFT JOIN work_logs wl
      ON wl.session_id = ws.id AND wl.is_active = true
    WHERE ws.user_id = $1 AND ws.work_date = $2::date
  `,
    [userId, dateStr]
  );
  return rows[0] || null;
}

/** openNewLogAt — like openNewLog but with an explicit entry_time instead of NOW() */
async function openNewLogAt(sessionId, userId, buildingId, lat, lon, entryTime, client) {
  const dbOrClient = client || pool;
  await resurrectSessionIfClosed(sessionId, client);
  const { rows } = await dbOrClient.query(
    `
    INSERT INTO work_logs
      (session_id, user_id, building_id, entry_time,
       entry_lat, entry_lon, is_active, checkout_reason)
    VALUES ($1, $2, $3, $4, $5, $6, true, 'manual')
    RETURNING *
  `,
    [sessionId, userId, buildingId, entryTime, lat, lon]
  );
  return rows[0];
}

module.exports = {
  processPing,
  processPingAt,
  autoCheckoutAt,
  finalizeInactiveSessions,
};
