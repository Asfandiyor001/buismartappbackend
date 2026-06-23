// ═══════════════════════════════════════════════════════════
// 18:00 AUTO-CLOSE JOB
// Har kuni 18:00 (Dush–Shan) barcha ochiq sessiyalarni yopadi.
// 00:05 da kechagi yopilmagan sessiyalar tozalanadi (xavfsizlik).
//
// MUHIM (schema bilan moslik):
//   - status = 'done'  (work_sessions CHECK: active|done|absent|vacation|sick —
//     'closed' QABUL QILINMAYDI, constraint violation beradi)
//   - notifications.type = 'davomat'  (CHECK: davomat|topshiriq|jadval|baho|
//     ogohlantirish|tizim — 'auto_close' QABUL QILINMAYDI)
//   - checkout_reason = 'auto_cron'  (CHECK yo'q — ruxsat etiladi)
//   - last_exit_time = '16:30:00'  (kanonik ish tugash vaqti — EOD)
//
// IDEMPOTENTLIK: WHERE is_finished = false — allaqachon yopilgan sessiyalarga
//   qayta tegmaydi. Bu job birinchi yopuvchi, dailyReport (23:59) zaxira.
// ═══════════════════════════════════════════════════════════
const cron = require('node-cron');
const pool = require('../config/database');
const { sendPushNotification } = require('../utils/pushNotification');
const { workedSecondsSql, REGULAR_CAP, TOTAL_CAP } = require('../utils/workTime');

// F2: ping kelmasa logni yopish chegarasi — vaqtga bog'liq.
//   Ish vaqtida (≤16:30) 90 daqiqa: Doze/GPS qisqa uzilishlari logni erta yopmasin.
//   16:30 dan keyin 30 daqiqa: qoldiq sessiyalarni tezroq yakunlash.
const STALE_PING_MINUTES_WORK = 90;   // ish vaqti (nowMins <= 990 = 16:30)
const STALE_PING_MINUTES_AFTER = 30;  // ish vaqtidan keyin

const pad2 = (n) => String(n).padStart(2, '0');
/** JS Date → 'HH:MM' (server local = Asia/Tashkent) */
const toHHMM = (d) => `${pad2(new Date(d).getHours())}:${pad2(new Date(d).getMinutes())}`;

async function autoCloseAllSessions() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const now = new Date();
    const closeTime = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    console.log(`[autoClose.job] Boshlandi: ${closeTime}`);

    // 1) Bugungi barcha aktiv work_logs ni yopish
    const logsResult = await client.query(
      `UPDATE work_logs SET
         exit_time        = NOW(),
         exit_lat         = COALESCE(exit_lat, entry_lat),
         exit_lon         = COALESCE(exit_lon, entry_lon),
         duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - entry_time))::INT),
         is_active        = false,
         checkout_reason  = 'auto_cron'
       WHERE is_active = true
         AND DATE(entry_time) = CURRENT_DATE
       RETURNING id, user_id, session_id`
    );
    console.log(`[autoClose.job] Yopilgan loglar: ${logsResult.rowCount}`);

    // 2a) Bugungi yopilmagan sessiyalarni yopish + EFFEKTIV chiqish vaqtini o'rnatish.
    // last_exit_time = oxirgi log chiqishi (18:00 cap), log bo'lmasa 16:30 (kanonik).
    // WHERE is_finished = false — idempotentlik: allaqachon yopilganlarga tegma.
    const sessionsResult = await client.query(
      `UPDATE work_sessions ws SET
         status           = 'done',
         is_finished      = true,
         finished_at      = NOW(),
         outside_since    = NULL,
         last_ping_at     = NOW(),
         auto_checkout    = true,
         updated_at       = NOW(),
         last_exit_time   = (LEAST(
           CURRENT_DATE + INTERVAL '18 hours',
           COALESCE(
             (SELECT MAX(exit_time) FROM work_logs
               WHERE session_id = ws.id AND exit_time IS NOT NULL),
             CURRENT_DATE + INTERVAL '16 hours 30 minutes'
           )
         ))::time
       WHERE ws.work_date = CURRENT_DATE
         AND ws.is_finished = false
       RETURNING id, user_id`
    );
    console.log(`[autoClose.job] Yopilgan sessiyalar: ${sessionsResult.rowCount}`);

    // 2b) Endi total/regular/overtime ni KANONIK formula bilan qayta hisoblash.
    // is_finished=true va last_exit_time o'rnatilgan — formula chiqish vaqtigacha
    // bo'lgan oraliqni (abet ayrilgan) hisoblaydi, GPS bo'shliqlarini to'ldiradi.
    const workedExpr = workedSecondsSql('ws');
    await client.query(
      `UPDATE work_sessions ws SET
         total_seconds    = calc.worked,
         regular_seconds  = LEAST(calc.worked, ${REGULAR_CAP}),
         overtime_seconds = GREATEST(0, calc.worked - ${REGULAR_CAP}),
         updated_at       = NOW()
       FROM (
         SELECT ws.id, (${workedExpr})::int AS worked
         FROM work_sessions ws
         WHERE ws.work_date = CURRENT_DATE AND ws.is_finished = true
       ) calc
       WHERE ws.id = calc.id`
    );

    // total_seconds ni xabarnoma uchun qayta o'qiymiz (2b dan keyingi qiymat)
    if (sessionsResult.rowCount > 0) {
      const ids = sessionsResult.rows.map((r) => r.id);
      const totalsRes = await client.query(
        `SELECT id, user_id, total_seconds FROM work_sessions WHERE id = ANY($1::int[])`,
        [ids]
      );
      const byId = new Map(totalsRes.rows.map((r) => [r.id, r]));
      for (const r of sessionsResult.rows) {
        const t = byId.get(r.id);
        if (t) r.total_seconds = t.total_seconds;
      }
    }

    // 3) Har sessiyaga in-app xabarnoma (type='davomat' — schema ruxsati)
    for (const session of sessionsResult.rows) {
      const total = Number(session.total_seconds) || 0;
      const hours = Math.floor(total / 3600);
      const mins = Math.floor((total % 3600) / 60);
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'davomat', $2, $3)`,
        [
          session.user_id,
          '🕕 Ish kuni tugadi',
          `Bugungi ish vaqtingiz: ${hours} soat ${mins} daqiqa. Tizim avtomatik yopdi.`,
        ]
      );
    }

    await client.query('COMMIT');
    console.log(
      `[autoClose.job] Yakunlandi: ${sessionsResult.rowCount} sessiya, ${logsResult.rowCount} log`
    );

    // 4) Push notification — commit'dan keyin (tashqi HTTP txn ichida emas)
    try {
      const { sendPushToUser } = require('../utils/pushNotification');
      for (const session of sessionsResult.rows) {
        const total = Number(session.total_seconds) || 0;
        const hours = Math.floor(total / 3600);
        const mins = Math.floor((total % 3600) / 60);
        await sendPushToUser(
          session.user_id,
          '🕕 Ish kuni tugadi',
          `Bugungi ish vaqtingiz: ${hours}s ${mins}d. Tizim avtomatik yopdi.`,
          pool
        );
      }
    } catch (e) {
      console.error('[autoClose.job] Push xatosi:', e.message);
    }

    return {
      closedSessions: sessionsResult.rowCount,
      closedLogs: logsResult.rowCount,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    console.error('[autoClose.job] Xato:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function midnightCleanup() {
  console.log('[autoClose.job] Tungi tozalash boshlandi');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Kechagi (yoki undan oldingi) yopilmagan loglarni yopish — entry + 9 soat cap
    await client.query(
      `UPDATE work_logs SET
         exit_time        = entry_time + INTERVAL '9 hours',
         duration_seconds = LEAST(
           GREATEST(0, EXTRACT(EPOCH FROM (NOW() - entry_time))::INT),
           ${TOTAL_CAP}
         ),
         is_active        = false,
         checkout_reason  = 'auto_cron'
       WHERE is_active = true
         AND DATE(entry_time) < CURRENT_DATE`
    );

    await client.query(
      `UPDATE work_sessions SET
         status        = 'done',
         is_finished   = true,
         auto_checkout = true,
         updated_at    = NOW()
       WHERE is_finished = false
         AND work_date < CURRENT_DATE`
    );

    await client.query('COMMIT');
    console.log('[autoClose.job] Tungi tozalash tugadi');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    console.error('[autoClose.job] Tungi tozalash xatosi:', err.message);
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════
// JOB A — STALE SESSION CHECK (har 5 daqiqada, ish vaqtida)
// Ping 30+ daqiqa kelmagan aktiv sessiyalarni yopadi.
//   - outside_since bor  → real chiqish vaqti = outside_since
//   - outside_since yo'q → app yopilgan/ping to'xtagan = last_ping_at
// MUHIM: chiqish vaqti NOW() emas, oxirgi ma'lum vaqt — shuning uchun
//   ish vaqtini oshirib yubormaydi. Xato yopilsa ham, xodim ilovani
//   ochib binoda ping yuborsa, sessiya avtomatik qayta ochiladi
//   (geofence auto_recheckin + resurrectSessionIfClosed).
// ═══════════════════════════════════════════════════════════
async function closeStaleSessions() {
  const client = await pool.connect();
  const closed = [];
  try {
    await client.query('BEGIN');

    // F2: dinamik stale oynasi — ish vaqtida (≤16:30) 90 daq, keyin 30 daq.
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const staleMinutes = nowMins <= 990 ? STALE_PING_MINUTES_WORK : STALE_PING_MINUTES_AFTER;

    const { rows: stale } = await client.query(
      `SELECT ws.id, ws.user_id, u.full_name, u.push_token,
              ws.last_ping_at, ws.outside_since,
              EXTRACT(EPOCH FROM (NOW() - ws.last_ping_at)) / 60 AS mins_since_ping
       FROM work_sessions ws
       JOIN users u ON u.id = ws.user_id
       WHERE ws.work_date = CURRENT_DATE
         AND ws.is_finished = false
         AND ws.status = 'active'
         AND ws.last_ping_at IS NOT NULL
         AND ws.last_ping_at < NOW() - ($1 * INTERVAL '1 minute')`,
      [staleMinutes]
    );

    for (const s of stale) {
      const exitTime = s.outside_since || s.last_ping_at; // JS Date
      const exitStr = toHHMM(exitTime);

      // Aktiv logni oxirgi ma'lum vaqtda yopish.
      // GREATEST(exit, entry) — exit_time HECH QACHON entry_time'dan oldin bo'lmaydi
      // (check_valid_duration: exit_time >= entry_time). Ish vaqtidan keyin qayta
      // ochilgan log (entry > exit) bo'lsa, dur=0 bilan yopiladi.
      await client.query(
        `UPDATE work_logs SET
           exit_time        = GREATEST($1::timestamptz, entry_time),
           exit_lat         = COALESCE(exit_lat, entry_lat),
           exit_lon         = COALESCE(exit_lon, entry_lon),
           duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (GREATEST($1::timestamptz, entry_time) - entry_time))::INT),
           is_active        = false,
           checkout_reason  = 'auto_stale'
         WHERE session_id = $2 AND is_active = true`,
        [exitTime, s.id]
      );

      // Sessiyani YOPMAYMIZ — faqat total_seconds ni yangilaymiz va
      // status 'active' (is_finished=false) holida qoladi.
      // Sababli: GPS signal yo'qolishi = xodim ketdi degan ma'no emas.
      // Xodim qayta ping yuborganda geofence yangi work_log ochadi (auto_recheckin).
      // UI da 'stale_active' ko'rinadi (aloqa yo'q), session esa saqlanadi.
      // total_seconds — KANONIK formula (kirish→hozir oraliq − abet, GPS bo'shliqlar to'ldirilgan).
      await client.query(
        `UPDATE work_sessions ws SET
           outside_since    = NULL,
           last_ping_at     = $1::timestamptz,
           updated_at       = NOW(),
           total_seconds    = calc.worked,
           regular_seconds  = LEAST(calc.worked, ${REGULAR_CAP}),
           overtime_seconds = GREATEST(0, calc.worked - ${REGULAR_CAP})
         FROM (
           SELECT ws.id, (${workedSecondsSql('ws')})::int AS worked
           FROM work_sessions ws WHERE ws.id = $2
         ) calc
         WHERE ws.id = calc.id`,
        [exitTime, s.id]
      );

      // In-app bildirishnoma (type='davomat' — schema ruxsati)
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'davomat', $2, $3)`,
        [
          s.user_id,
          '📡 GPS signal yo\'qoldi',
          `Oxirgi signal ${Math.floor(s.mins_since_ping)} daqiqa oldin keldi. Ilova qayta ochilganda tizim ish vaqtini davom ettiradi.`,
        ]
      );

      closed.push({
        userId: s.user_id, fullName: s.full_name, pushToken: s.push_token,
        exitStr, mins: Math.floor(s.mins_since_ping),
      });
    }

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* */ }
    console.error('[autoClose.job] Stale check xato:', err.message);
    client.release();
    return { closed: 0 };
  }
  client.release();

  // Push — commit'dan keyin (tashqi HTTP txn ichida emas)
  for (const c of closed) {
    console.log(`[autoClose.job] Stale yopildi: ${c.fullName} (${c.mins} daq ping yo'q, chiqish=${c.exitStr})`);
    if (c.pushToken) {
      try {
        await sendPushNotification(
          c.pushToken,
          '🏢 Avtomatik chiqish',
          `Siz ${c.exitStr} da chiqib ketdingiz. Ish sessiyangiz yopildi.`
        );
      } catch (_) { /* push xatosi yopishni buzmasin */ }
    }
  }
  return { closed: closed.length };
}

function register() {
  // Stale check trigger — har 5 daqiqada ping to'xtagan sessiyalarni yopadi
  const runStaleCheck = () =>
    closeStaleSessions().catch((e) =>
      console.error('[autoClose.job] stale check failed:', e.message)
    );

  // 07:30–07:55 (Dush–Shan) — erta kelganlar uchun stale check (cron */5 soat 7 ni
  // 07:00 dan boshlardi, shuning uchun aniq daqiqalar yoziladi: 30,35,40,45,50,55)
  cron.schedule('30,35,40,45,50,55 7 * * 1-6', runStaleCheck, {
    timezone: 'Asia/Tashkent',
  });

  // 08:00–17:55 (Dush–Shan) — asosiy ish vaqti stale check
  cron.schedule('*/5 8-17 * * 1-6', runStaleCheck, {
    timezone: 'Asia/Tashkent',
  });
  console.log('[autoClose.job] Stale-session check rejalashtirildi: har 5 daq (07:30–17:55, Dush–Shan)');

  // 18:00 Dush–Shan (Yakshanba 0 — kirmaydi) — QATTIQ DEADLINE: barchasini yopadi.
  // 16:30 dan keyin ishlaganlar bu vaqtgacha kuzatiladi (qo'shimcha vaqt sanaladi),
  // ketganlar esa stale check (30 daq ping yo'q) orqali ~17:00 da yopiladi.
  cron.schedule(
    '0 18 * * 1-6',
    () => {
      console.log('[autoClose.job] 18:00 trigger');
      autoCloseAllSessions().catch((e) =>
        console.error('[autoClose.job] 18:00 failed:', e.message)
      );
    },
    { timezone: 'Asia/Tashkent' }
  );

  // 00:05 har kuni — tungi tozalash
  cron.schedule(
    '5 0 * * *',
    () => {
      midnightCleanup().catch((e) =>
        console.error('[autoClose.job] cleanup failed:', e.message)
      );
    },
    { timezone: 'Asia/Tashkent' }
  );

  console.log('[autoClose.job] Rejalashtirildi: 18:00 (Dush–Shan), 00:05 tozalash (Asia/Tashkent)');
}

module.exports = {
  register,
  autoCloseAllSessions,
  midnightCleanup,
  closeStaleSessions,
};
