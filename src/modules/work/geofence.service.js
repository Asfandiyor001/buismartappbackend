const pool = require('../../config/database');
const { nowStr } = require('../../utils/time');
const { workedSecondsSql, REGULAR_CAP: WT_REGULAR_CAP } = require('../../utils/workTime');

/** Ish kuni qat'iy oxiri — 18:00 (daqiqada). Bundan keyin yangi log/sessiya ochilmaydi. */
const EOD_MINUTES = 18 * 60; // 1080

const safeExitTime = (entryTime, proposedExitTime) => {
  const entry = new Date(entryTime);
  const exit = new Date(proposedExitTime);
  return exit >= entry ? exit : entry;
};

const AUTO_CHECKOUT_MINUTES = 60;
/** No ping for this long → auto-finish session at last_ping_at (ghost-session guard). */
const INACTIVE_SESSION_MINUTES = 60;
/** GPS coordinates can drift by this much even indoors — add buffer before outside countdown. */
const GPS_DRIFT_TOLERANCE_M = 50;
/** Extra radius (m) tolerated for the very first check-in of the day.
 *  Accounts for GPS accuracy variance (phones can report ±50 m indoors). */
const CHECKIN_GPS_BUFFER_M = 50;

const WORK_END_HOUR = 16;
const WORK_END_MINUTE = 30;
const REGULAR_CAP = 8 * 3600;

const workEndOfDay = (date) => {
  const d = new Date(date);
  d.setHours(WORK_END_HOUR, WORK_END_MINUTE, 0, 0);
  return d;
};

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

async function notifyBinoAlmashtirish(dbOrClient, userId, newBuildingName) {
  await dbOrClient.query(
    `INSERT INTO notifications (user_id, type, title, body)
     VALUES ($1, 'davomat', $2, $3)`,
    [
      userId,
      'Bino almashtirildi',
      `Siz ${newBuildingName} ga o'tdingiz`,
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

/** Nearest active building and its distance in meters (Haversine).
 *  Returns the CLOSEST active building regardless of radius — callers compute
 *  `isInside = dist_m <= radius_m` themselves and drive outside-detection from it.
 *  (Previously this filtered `WHERE dist_m <= radius_m`, so any ping outside the
 *   radius returned null → `no_buildings`, leaving the entire outside-countdown /
 *   auto-checkout branch unreachable. F1 fix.)
 *  Returns null only when there are NO active buildings at all. */
async function nearestBuilding(lat, lon) {
  const buildings = await pool.query(
    `
    SELECT * FROM (
      SELECT *,
        (2 * 6371000 * asin(least(1, sqrt(
          power(sin(radians(($1::float8 - latitude::float8) / 2)), 2) +
          cos(radians($1::float8)) * cos(radians(latitude::float8)) *
          power(sin(radians(($2::float8 - longitude::float8) / 2)), 2)
        )))) AS dist_m
      FROM buildings
      WHERE is_active = true
    ) sub
    ORDER BY dist_m ASC
    LIMIT 1
  `,
    [lat, lon]
  );
  return buildings.rows[0] || null;
}

async function recalcSession(sessionId, client) {
  const dbOrClient = client || pool;

  // Kanonik formula: GREATEST(loglar yig'indisi, kirish→hozir/chiqish oraliq − abet), 9s cap.
  // GPS uzilgan bo'shliqlarni oraliq vaqt to'ldiradi (8 soat ishlab 54 daqiqa ko'rsatmaydi).
  const workedExpr = workedSecondsSql('ws');
  const isOT = isPastWorkEnd(new Date());

  const { rows } = await dbOrClient.query(
    `
    UPDATE work_sessions ws SET
      total_seconds    = calc.worked,
      regular_seconds  = LEAST(calc.worked, ${WT_REGULAR_CAP}),
      overtime_seconds = ${isOT ? `GREATEST(0, calc.worked - ${WT_REGULAR_CAP})` : '0'},
      updated_at       = NOW()
    FROM (
      SELECT ws.id, (${workedExpr})::int AS worked
      FROM work_sessions ws
      WHERE ws.id = $1
    ) calc
    WHERE ws.id = calc.id
    RETURNING ws.total_seconds AS total, ws.regular_seconds AS regular, ws.overtime_seconds AS overtime
  `,
    [sessionId]
  );

  const r = rows[0] || {};
  return {
    total: Number(r.total) || 0,
    regular: Number(r.regular) || 0,
    overtime: Number(r.overtime) || 0,
  };
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
  const { rows } = await dbOrClient.query(
    `SELECT entry_time FROM work_logs WHERE id = $1`,
    [logId]
  );
  const entryTime = rows[0]?.entry_time;
  if (!entryTime) {
    throw new Error(`closeActiveLog: work_log ${logId} not found`);
  }
  // Cap exit_time to entry + 9 hours (8h regular + 1h max overtime)
  // VA o'sha kunning 18:00 (EOD) chegarasi — qaysi biri kichik bo'lsa.
  // Bu 18:00 dan keyingi soxta log davomiyligini (masalan 20:27) oldini oladi.
  const entryDate = new Date(entryTime);
  const entryMs = entryDate.getTime();
  const eod = new Date(entryDate);
  eod.setHours(18, 0, 0, 0); // o'sha kun 18:00
  const maxExitMs = Math.min(entryMs + 9 * 60 * 60 * 1000, eod.getTime());
  const proposedMs = new Date(exitTime).getTime();
  const cappedExitMs = Math.min(proposedMs, maxExitMs);
  const safeExit = safeExitTime(entryTime, new Date(cappedExitMs));
  await dbOrClient.query(
    `
    UPDATE work_logs SET
      exit_time = GREATEST(
        entry_time + INTERVAL '1 millisecond',
        $1::timestamptz
      ),
      duration_seconds = GREATEST(0,
        EXTRACT(EPOCH FROM (
          GREATEST(
            entry_time + INTERVAL '1 millisecond',
            $1::timestamptz
          ) - entry_time
        ))::INT
      ),
      is_active        = false,
      checkout_reason  = $2
    WHERE id = $3
  `,
    [safeExit, reason, logId]
  );
}

/**
 * Admin / cron helper: sessions stuck "active" with no fresh ping are finalized.
 * Open logs from today close at current time; older logs close at 16:30 on the log's calendar day
 * (avoids stamping stale sessions with "now" after downtime). checkout_reason = system_timeout.
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
        SELECT id, last_ping_at, user_id, (work_date = CURRENT_DATE) AS is_today
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

      // BUGUNGI sessiyani bu yerda YOPMAYMIZ. Ping kelmasligi xodim ketganini
      // bildirmaydi — ko'pincha telefon harakatsiz (stol oldida) yoki ilova
      // fonda, GPS jim. Bu yerda yopish soxta "Ish tugatdi" + keyingi pingda
      // sessiya fragmentatsiyasiga (har gal yangi work_log) sabab bo'lardi.
      // Sessiya ochiq qoladi (UI da ping eskirsa "Aloqa yo'q" ko'rinadi).
      // Bugungi kun oxirini FAQAT 18:00 autoClose job va binodan chiqish
      // (outside-detection auto_checkout) boshqaradi. Bu funksiya esa faqat
      // o'tgan kunlarning yopilmay qolgan "ghost" sessiyalarini tozalaydi
      // (masalan server downtime'dan keyin).
      // Ish vaqtida (16:30 gacha) bugungi sessiyani staleness sababli YOPMAYMIZ —
      // ping yo'qligi ketganini bildirmaydi (telefon stol oldida / ilova fonda).
      // 16:30 dan KEYIN esa ish kuni tugadi — stale bugungi sessiyani ham yopamiz.
      if (sess.is_today) {
        const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
        if (nowMins < 990) { // 16:30 = 990 daqiqa
          await client.query('COMMIT');
          continue;
        }
        // 16:30 dan keyin — pastdagi yopish mantig'i bilan davom etamiz
      }

      // Grace period: if worker had an inside ping in the last 90 minutes,
      // they may still be in the building with lost connectivity — skip auto-finalize.
      const { rows: lastInsideRows } = await client.query(
        `SELECT created_at FROM gps_pings
         WHERE user_id = $1
           AND is_inside = true
         ORDER BY created_at DESC
         LIMIT 1`,
        [sess.user_id]
      );
      if (lastInsideRows.length > 0) {
        const minutesSinceLastInside =
          (Date.now() - new Date(lastInsideRows[0].created_at).getTime()) / 60000;
        if (minutesSinceLastInside < 90) {
          await client.query(
            `UPDATE work_sessions SET last_ping_at = NOW() WHERE id = $1`,
            [sess.id]
          );
          await client.query('COMMIT');
          console.log(
            `[finalizeInactiveSessions] user ${sess.user_id} — internet_outage_grace (last inside ${Math.round(minutesSinceLastInside)} min ago)`
          );
          continue;
        }
      }

      let exitAt = sess.last_ping_at;

      const { rows: activeLogs } = await client.query(
        `
        SELECT id, entry_time FROM work_logs
        WHERE session_id = $1 AND is_active = true
        LIMIT 1
      `,
        [sess.id]
      );

      const activeLog = activeLogs[0];
      if (activeLog) {
        const logDate = new Date(activeLog.entry_time).toDateString();
        const today = new Date().toDateString();
        let proposedExitTime;
        if (logDate === today) {
          proposedExitTime = new Date();
        } else {
          proposedExitTime = workEndOfDay(activeLog.entry_time);
        }
        exitAt = safeExitTime(activeLog.entry_time, proposedExitTime);
        await closeActiveLog(activeLog.id, proposedExitTime, 'system_timeout', client);
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
async function resurrectSessionIfClosed(sessionId, client, opts = {}) {
  const dbOrClient = client || pool;

  // Real-time (opts.realtime) holatda 18:00 dan keyin yopilgan sessiyani
  // QAYTA OCHMAYMIZ — ish kuni tugagan, kechki ping yangi ish vaqti yaratmasin.
  // Offline-sync (processPingAt) tarixiy vaqt bilan ishlaydi → bu chek o'tkazib yuboriladi.
  if (opts.realtime) {
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    if (nowMins >= EOD_MINUTES) return false;
  }

  // opts.entryTime: "HH:MM" formatida kirish vaqti — first_entry_time NULL bo'lsa shu vaqt o'rnatiladi.
  // absentCheck.job 10:00da sessiya first_entry_time=NULL bilan yaratadi; xodim keyin kelganda
  // bu COALESCE first_entry_time'ni to'ldiradi.
  const entryTimeVal = opts.entryTime || `${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')}`;

  const { rowCount } = await dbOrClient.query(
    `
    UPDATE work_sessions SET
      status           = 'active',
      is_finished      = false,
      finished_at      = NULL,
      first_entry_time = COALESCE(first_entry_time, $2::TIME),
      updated_at       = NOW()
    WHERE id = $1
      AND (status = 'done' OR is_finished = true)
  `,
    [sessionId, entryTimeVal]
  );
  return rowCount > 0;
}

async function openNewLog(sessionId, userId, buildingId, lat, lon, client) {
  const dbOrClient = client || pool;
  const nowStr = `${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')}`;
  await resurrectSessionIfClosed(sessionId, client, { realtime: true, entryTime: nowStr });
  // ON CONFLICT — partial unique index (idx_work_logs_one_active_per_session)
  // bir sessiyada bir vaqtning o'zida faqat BITTA aktiv log bo'lishini kafolatlaydi.
  // Konkurent ping (race condition) ikkinchi logni yaratolmaydi → duplicate yo'q.
  const { rows } = await dbOrClient.query(
    `
    INSERT INTO work_logs
      (session_id, user_id, building_id, entry_time,
       entry_lat, entry_lon, is_active, checkout_reason)
    VALUES ($1, $2, $3, NOW(), $4, $5, true, 'manual')
    ON CONFLICT (session_id) WHERE (is_active = true)
    DO NOTHING
    RETURNING *
  `,
    [sessionId, userId, buildingId, lat, lon]
  );
  if (rows[0]) return rows[0];
  // Konflikt bo'ldi — boshqa ping allaqachon aktiv log ochgan, mavjudini qaytaramiz
  const { rows: existing } = await dbOrClient.query(
    `SELECT * FROM work_logs
      WHERE session_id = $1 AND is_active = true
      ORDER BY id DESC LIMIT 1`,
    [sessionId]
  );
  return existing[0] || null;
}

async function processPing(userId, lat, lon, accuracy) {
  // Debounce: Expo Go foreground pings can arrive every few seconds.
  // Ignore pings that arrive within 25 s of the previous one to prevent
  // duplicate checkins or redundant DB writes.
  const lastPingResult = await pool.query(
    `SELECT created_at FROM gps_pings
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  if (lastPingResult.rows.length > 0) {
    const lastPing = new Date(lastPingResult.rows[0].created_at);
    const secondsSinceLastPing = (Date.now() - lastPing.getTime()) / 1000;
    if (secondsSinceLastPing < 15) {
      // Active session yo'q bo'lsa debounce'ni o'tkazib yuboramiz —
      // kunning birinchi checkin'i hech qachon bloklanmasin
      const { rows: activeSess } = await pool.query(
        `SELECT id FROM work_sessions
         WHERE user_id = $1 AND work_date = CURRENT_DATE AND is_finished = false
         LIMIT 1`,
        [userId]
      );
      if (activeSess.length > 0) {
        return { action: 'too_frequent', secondsSince: Math.floor(secondsSinceLastPing) };
      }
    }
  }

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

    // WORK_START_MINS — DB'dagi staff_profiles.work_start dan o'qiladi (masalan '08:30').
    // Profil topilmasa default 08:30 ishlatiladi.
    // EARLY_CHECKIN_BUFFER: ish boshlanishidan 60 daqiqa oldin checkin ruxsat (07:30 dan)
    const staffRes = await pool.query(
      `SELECT sp.work_start FROM staff_profiles sp WHERE sp.user_id = $1`,
      [userId]
    );
    const workStartStr = staffRes.rows[0]?.work_start || '08:30';
    const [wsh, wsm] = workStartStr.split(':').map(Number);
    const WORK_START_MINS       = wsh * 60 + wsm;
    const EARLY_CHECKIN_BUFFER  = 60; // daqiqa
    const EARLY_CHECKIN_START   = WORK_START_MINS - EARLY_CHECKIN_BUFFER; // 07:30

    const WORK_END_MINS   = 990;  // 16:30 — standart ish tugash, auto-checkout chegarasi
    const ABET_START_MINS = 780;  // 13:00 — abet boshlanishi
    const ABET_END_MINS   = 840;  // 14:00 — abet tugashi

    const dayOfWeek = now.getDay();
    // 0 = Yakshanba (dam olish); 1–6 = Dushanba–Shanba (ish kunlari)
    if (dayOfWeek === 0) {
      await client.query('ROLLBACK');
      const out = { action: 'day_off', message: 'Yakshanba — dam olish kuni' };
      await finalizePing(pingId, out);
      return out;
    }

    const session = await getTodaySession(userId, client);

    console.log(`[processPing] user=${userId} dist=${Math.round(distM)}m radius=${building.radius_m}m isInside=${isInside} nowMins=${nowMins} session=${session?.id ?? 'none'}`);

    if (isInside) {
      // 18:00 (EOD) dan keyin: ish kuni tugagan — yangi sessiya/log OCHMAYMIZ va
      // yopilgan sessiyani qayta tiklamaymiz. Faqat last_ping_at yangilanadi.
      // Bu kechki "ghost" loglarni (masalan 18:08→20:27) butunlay to'xtatadi.
      if (nowMins >= EOD_MINUTES) {
        if (session && !session.is_finished) {
          await client.query(
            `UPDATE work_sessions SET last_ping_at = NOW() WHERE id = $1`,
            [session.id]
          );
          await client.query('COMMIT');
        } else {
          await client.query('ROLLBACK');
        }
        const out = { action: 'work_day_ended', message: 'Ish kuni tugagan (18:00)' };
        await finalizePing(pingId, out);
        return out;
      }

      if (!session) {
        // Do not auto-checkin earlier than 60 min before work start (default: 07:30)
        if (nowMins < EARLY_CHECKIN_START) {
          await client.query('ROLLBACK');
          const earlyH = String(Math.floor(EARLY_CHECKIN_START / 60)).padStart(2, '0');
          const earlyM = String(EARLY_CHECKIN_START % 60).padStart(2, '0');
          const out = { action: 'before_work_time', message: `Juda erta (${earlyH}:${earlyM} dan checkin mumkin)` };
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
          ON CONFLICT (user_id, work_date) DO UPDATE
            SET last_ping_at = NOW()
          RETURNING *
        `,
          [userId, timeStr]
        );

        await openNewLog(newSession.id, userId, building.id, lat, lon, client);
        await notifyDavomatCheckIn(client, userId, now);
        await client.query('COMMIT');
        // Session ma'lumotlarini response'ga qo'shamiz — mobile qo'shimcha fetch qilmasin
        const { rows: [freshSession] } = await pool.query(
          `SELECT id, user_id, work_date, status, is_finished,
                  first_entry_time, total_seconds, last_ping_at
           FROM work_sessions
           WHERE user_id = $1 AND work_date = CURRENT_DATE
           ORDER BY id DESC LIMIT 1`,
          [userId]
        );
        const out = {
          action: 'auto_checkin',
          buildingId: building.id,
          buildingName: building.name,
          session: freshSession || null,
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
        await recalcSession(session.id, client);
        await notifyBinoAlmashtirish(client, userId, building.name);
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
        // FIX 3: Log re-checkin reason when returning after auto-checkout
        const { rows: recentCheckouts } = await client.query(
          `SELECT checkout_reason, exit_time FROM work_logs
           WHERE session_id = $1
           ORDER BY exit_time DESC NULLS LAST
           LIMIT 1`,
          [session.id]
        );
        if (recentCheckouts.length > 0) {
          const rc = recentCheckouts[0];
          if (['auto_gps', 'gps_lost', 'system_timeout'].includes(rc.checkout_reason)) {
            console.log(
              `[processPing] user ${userId} — auto re-checkin after '${rc.checkout_reason}' checkout at ${rc.exit_time}`
            );
          }
        }
        await openNewLog(session.id, userId, building.id, lat, lon, client);
        await notifyDavomatCheckIn(client, userId);
        await client.query(
          `
          UPDATE work_sessions SET
            last_ping_at     = NOW(),
            outside_since    = NULL,
            status           = 'active',
            buildings_visited = buildings_visited + 1,
            first_entry_time = COALESCE(first_entry_time, CURRENT_TIME)
          WHERE id = $1
        `,
          [session.id]
        );
        await client.query('COMMIT');
        const { rows: [freshSessionRe] } = await pool.query(
          `SELECT id, user_id, work_date, status, is_finished,
                  first_entry_time, total_seconds, last_ping_at
           FROM work_sessions
           WHERE user_id = $1 AND work_date = CURRENT_DATE
           ORDER BY id DESC LIMIT 1`,
          [userId]
        );
        const out = {
          action: 'auto_recheckin',
          buildingId: building.id,
          session: freshSessionRe || null,
        };
        await finalizePing(pingId, out);
        return out;
      }
    } else {
      // First-checkin GPS buffer: employee has no session yet and is within radius+20 m.
      // GPS accuracy indoors can be ±20 m; without this buffer the first ping of the day
      // returns no_session and the timer never starts even though the person is at work.
      const isInsideBuffered = distM <= Number(building.radius_m) + CHECKIN_GPS_BUFFER_M;
      if (!session && isInsideBuffered && nowMins >= EARLY_CHECKIN_START && nowMins <= WORK_END_MINS) {
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const { rows: [newSession] } = await client.query(
          `INSERT INTO work_sessions
             (user_id, work_date, first_entry_time, status, last_ping_at, buildings_visited)
           VALUES ($1, CURRENT_DATE, $2::TIME, 'active', NOW(), 1)
           ON CONFLICT (user_id, work_date) DO UPDATE
             SET last_ping_at = NOW()
           RETURNING *`,
          [userId, timeStr]
        );
        await openNewLog(newSession.id, userId, building.id, lat, lon, client);
        await notifyDavomatCheckIn(client, userId, now);
        await client.query('COMMIT');
        const { rows: [freshSession] } = await pool.query(
          `SELECT id, user_id, work_date, status, is_finished,
                  first_entry_time, total_seconds, last_ping_at
           FROM work_sessions
           WHERE user_id = $1 AND work_date = CURRENT_DATE
           ORDER BY id DESC LIMIT 1`,
          [userId]
        );
        const out = {
          action: 'auto_checkin',
          buildingId: building.id,
          buildingName: building.name,
          distanceM: distM,
          buffered: true,
          session: freshSession || null,
        };
        await finalizePing(pingId, out);
        console.log(`[processPing] user ${userId} — auto_checkin (GPS buffer) dist=${Math.round(distM)}m radius=${building.radius_m}m`);
        return out;
      }

      // GPS drift tolerance: treat as still inside if within radius + 50 m buffer.
      // Prevents false outside triggers from minor GPS jitter indoors.
      if (session && !session.is_finished && session.active_log_id) {
        const driftLimit = Number(building.radius_m) + GPS_DRIFT_TOLERANCE_M;
        if (distM <= driftLimit) {
          await client.query(
            `UPDATE work_sessions SET last_ping_at = NOW(), outside_since = NULL WHERE id = $1`,
            [session.id]
          );
          await client.query('COMMIT');
          const out = { action: 'inside_drift', distanceM: distM, driftLimit };
          await finalizePing(pingId, out);
          return out;
        }
      }

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
      // Do not wait for the outside countdown (AUTO_CHECKOUT_MINUTES) once the work day is over.
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

        try {
          const { sendPushToUser } = require('../../utils/pushNotification');
          await sendPushToUser(
            userId,
            '🏢 Ish kuni yakunlandi',
            'Ish vaqti tugadi. Chiqish avtomatik qayd etildi.',
            pool
          );
        } catch (_) { /* push xatosi checkout'ni buzmasin */ }

        const out = { action: 'auto_checkout_end_of_day', exitTime };
        await finalizePing(pingId, out);
        return out;
      }

      if (!session.outside_since) {
        // Require at least one previous outside ping in the last 5 minutes before
        // starting the countdown — single-ping GPS jitter should not trigger checkout.
        const { rows: prevOutside } = await client.query(
          `
          SELECT id FROM gps_pings
          WHERE user_id = $1
            AND is_inside = false
            AND created_at >= NOW() - INTERVAL '5 minutes'
            AND id < $2
          LIMIT 1
        `,
          [userId, pingId]
        );

        if (prevOutside.length === 0) {
          await client.query(
            `UPDATE work_sessions SET last_ping_at = NOW() WHERE id = $1`,
            [session.id]
          );
          await client.query('COMMIT');
          const out = { action: 'outside_first_ping', distanceM: distM };
          await finalizePing(pingId, out);
          return out;
        }

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
        // Abet paytida outside_since ni NULL qil — 14:00 dan keyin
        // xodim qaytib kelganda countdown noldan boshlansin, erta chiqish bo'lmasin
        await client.query(
          `UPDATE work_sessions SET last_ping_at = NOW(), outside_since = NULL WHERE id = $1`,
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

      // FIX 2: Grace period — if last inside ping was < 90 min ago, worker likely lost
      // internet while still inside the building; reset countdown and skip checkout.
      const { rows: lastInsidePingRows } = await client.query(
        `SELECT created_at FROM gps_pings
         WHERE user_id = $1
           AND is_inside = true
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
      );
      if (lastInsidePingRows.length > 0) {
        const minutesSinceLastInside =
          (Date.now() - new Date(lastInsidePingRows[0].created_at).getTime()) / 60000;
        if (minutesSinceLastInside < 90) {
          await client.query(
            `UPDATE work_sessions SET last_ping_at = NOW(), outside_since = NULL WHERE id = $1`,
            [session.id]
          );
          await client.query('COMMIT');
          const out = {
            action: 'internet_outage_grace',
            message: "So'nggi marta binoda edi, checkout kechiktirildi",
            minutesSinceLastInside: Math.round(minutesSinceLastInside),
          };
          await finalizePing(pingId, out);
          return out;
        }
      }

      // FIX 5: Notify user that auto-checkout is about to happen
      try {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body)
           VALUES ($1, 'ogohlantirish', 'GPS aloqa uzildi',
             'Tizim siz binoni tark etgandek qabul qildi. Agar binoda bo''lsangiz, ilovani oching.')`,
          [userId]
        );
      } catch (_) { /* notification failure must not block checkout */ }

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

      // Push notification (commit'dan keyin — txn ichida tashqi HTTP yo'q)
      try {
        const { sendPushToUser } = require('../../utils/pushNotification');
        await sendPushToUser(
          userId,
          '🏢 Avtomatik chiqish',
          `Siz binodan chiqib ketdingiz. Chiqish vaqti: ${exitTimeStr}`,
          pool
        );
      } catch (_) { /* push xatosi checkout'ni buzmasin */ }

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
        await recalcSession(session.id, client);
        await notifyBinoAlmashtirish(client, userId, building.name);
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
      // Guard: log < 60s old → GPS power-on glitch right after checkin, not real departure.
      // Prevents 0-duration logs when gps_off event arrives same second as checkin.
      const logAgeSec = (new Date(timestamp) - new Date(session.active_entry_time)) / 1000;
      if (logAgeSec < 60) {
        await client.query('ROLLBACK');
        console.log(`[autoCheckoutAt] user ${userId} — gps_lost ignored, log too fresh (${Math.round(logAgeSec)}s)`);
        return { action: 'gps_lost_ignored_too_soon', logAgeSec: Math.round(logAgeSec) };
      }

      // Case A: log is still open — close it at the historical timestamp
      await closeActiveLog(session.active_log_id, timestamp, 'gps_lost', client);

      // Explicit safety UPDATE: ensure checkout_reason is 'gps_lost' on the
      // closed row (guards against any future change in closeActiveLog's default)
      await client.query(
        `UPDATE work_logs SET checkout_reason = 'gps_lost' WHERE id = $1`,
        [session.active_log_id]
      );

      // MUHIM: sessiyani avval YAKUNLASH (is_finished + last_exit_time), keyin
      // recalcSession. Aks holda kanonik formula endTs = LEAST(NOW, 18:00) ni
      // ishlatadi (sessiya hali ochiq deb), va erta ketganda (masalan 16:40)
      // ish vaqti 18:00 gacha shishib ketadi (8s40d o'rniga 9soat cap).
      // Yakunlangandan keyin recalc endTs = last_exit_time (16:40) ni ishlatadi.
      await client.query(
        `
        UPDATE work_sessions SET
          outside_since  = NULL,
          last_ping_at   = $1::timestamptz,
          last_exit_time = $2::TIME,
          auto_checkout  = true,
          is_finished    = true,
          finished_at    = $1::timestamptz,
          status         = 'done'
        WHERE id = $3
      `,
        [timestamp, exitTimeStr, session.id]
      );

      const totalsGps = await recalcSession(session.id, client);
      await notifyDavomatCheckOut(client, userId, totalsGps.total);

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
  // Offline-sync (tarixiy) — realtime 18:00 cheki qo'llanmaydi
  const entryTimeStr = `${String(entryTime.getHours()).padStart(2,'0')}:${String(entryTime.getMinutes()).padStart(2,'0')}`;
  await resurrectSessionIfClosed(sessionId, client, { entryTime: entryTimeStr });
  const { rows } = await dbOrClient.query(
    `
    INSERT INTO work_logs
      (session_id, user_id, building_id, entry_time,
       entry_lat, entry_lon, is_active, checkout_reason)
    VALUES ($1, $2, $3, $4, $5, $6, true, 'manual')
    ON CONFLICT (session_id) WHERE (is_active = true)
    DO NOTHING
    RETURNING *
  `,
    [sessionId, userId, buildingId, entryTime, lat, lon]
  );
  if (rows[0]) return rows[0];
  const { rows: existing } = await dbOrClient.query(
    `SELECT * FROM work_logs
      WHERE session_id = $1 AND is_active = true
      ORDER BY id DESC LIMIT 1`,
    [sessionId]
  );
  return existing[0] || null;
}

module.exports = {
  safeExitTime,
  processPing,
  processPingAt,
  autoCheckoutAt,
  finalizeInactiveSessions,
  nearestBuilding,
};
