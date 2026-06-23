// ═══════════════════════════════════════════════════════════
// GPS WATCHDOG — telefon restart / app o'ldirilganda
// xodimning qurilmasini push notification orqali uyg'otadi.
//
// Har 10 daqiqada (08:00–17:50, Dush–Shan):
//   1. Aktiv sessiyasi bor + oxirgi ping 15+ daqiqa oldingi xodimlarni topadi
//   2. Push notification yuboradi (data.action = 'gps_wake')
//   3. Mobil ilova notification handler orqali GPS taskni qayta boshlaydi
//
// Spamdan himoya: har xodimga 30 daqiqada 1 marta push yuboriladi.
// ═══════════════════════════════════════════════════════════
const cron = require('node-cron');
const pool = require('../config/database');
const { sendPushNotification } = require('../utils/pushNotification');

const STALE_THRESHOLD_MINUTES = 15;
const MIN_INTERVAL_BETWEEN_WAKES_MS = 30 * 60 * 1000;

const lastWakeSent = new Map();

function cleanupOldEntries() {
  const cutoff = Date.now() - MIN_INTERVAL_BETWEEN_WAKES_MS * 2;
  for (const [uid, ts] of lastWakeSent) {
    if (ts < cutoff) lastWakeSent.delete(uid);
  }
}

async function wakeStaleDevices() {
  const now = new Date();
  const hour = now.getHours();
  const dow = now.getDay();
  if (dow === 0 || hour < 7 || hour >= 18) return { woken: 0, checked: 0 };

  const { rows } = await pool.query(`
    SELECT u.id, u.full_name, u.push_token,
           ws.id AS session_id, ws.status,
           ROUND(EXTRACT(EPOCH FROM (NOW() - ws.last_ping_at)) / 60) AS min_since_ping
    FROM users u
    JOIN work_sessions ws ON ws.user_id = u.id AND ws.work_date = CURRENT_DATE
    WHERE u.role IN ('staff', 'admin', 'prorektor')
      AND u.is_active = true
      AND u.push_token IS NOT NULL
      AND u.push_token != ''
      AND ws.status = 'active'
      AND ws.is_finished = false
      AND ws.last_ping_at < NOW() - ($1 || ' minutes')::INTERVAL
  `, [String(STALE_THRESHOLD_MINUTES)]);

  let woken = 0;
  const nowMs = Date.now();

  for (const staff of rows) {
    const lastSent = lastWakeSent.get(staff.id) || 0;
    if (nowMs - lastSent < MIN_INTERVAL_BETWEEN_WAKES_MS) continue;

    try {
      await sendPushNotification(
        staff.push_token,
        '📍 GPS kuzatuv to\'xtadi',
        'Davomat uchun ilovani oching yoki bildirishmani bosing.',
        { action: 'gps_wake', userId: staff.id }
      );
      lastWakeSent.set(staff.id, nowMs);
      woken++;
    } catch (_) {}
  }

  if (woken > 0) {
    console.log(`[gpsWatchdog] ${woken}/${rows.length} xodimga GPS wake push yuborildi`);
  }

  cleanupOldEntries();
  return { woken, checked: rows.length };
}

function register() {
  cron.schedule('*/10 8-17 * * 1-6', () => {
    wakeStaleDevices().catch(e =>
      console.error('[gpsWatchdog] failed:', e.message)
    );
  }, { timezone: 'Asia/Tashkent' });

  cron.schedule('30,40,50 7 * * 1-6', () => {
    wakeStaleDevices().catch(e =>
      console.error('[gpsWatchdog] failed:', e.message)
    );
  }, { timezone: 'Asia/Tashkent' });

  console.log('[gpsWatchdog] Rejalashtirildi: har 10 daq (07:30–17:50, Dush–Shan)');
}

module.exports = { register, wakeStaleDevices };
