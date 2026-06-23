// ═══════════════════════════════════════════════════════════
// PUSH ESLATMA JOBLARI
//   08:45 Dush–Shan → kelmagan xodimlarga "Hali kelmadingiz"
//   17:45 Dush–Shan → checkout qilmaganlarga "18:00 da yopiladi"
//
// Har eslatma: push (Expo) + in-app notification (type='ogohlantirish').
// In-app yozuv push ishlamasa ham (masalan Expo Go) ko'rinadi.
// ═══════════════════════════════════════════════════════════
const cron = require('node-cron');
const pool = require('../config/database');
const { sendPushToUser } = require('../utils/pushNotification');

async function notifyAbsentStaff() {
  console.log('[notificationCron] 08:45 — kelmaganlarni tekshirish');
  const result = await pool.query(
    `SELECT u.id, u.full_name
       FROM users u
      WHERE u.role IN ('staff','prorektor')
        AND u.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM work_sessions ws
           WHERE ws.user_id = u.id AND ws.work_date = CURRENT_DATE
        )`
  );
  console.log(`[notificationCron] ${result.rowCount} xodim hali kelmagan`);

  for (const user of result.rows) {
    const title = '⚠️ Davomat eslatmasi';
    const body = `${user.full_name}, siz hali ish joyiga kirmadingiz. Ish vaqti 08:30 da boshlangan.`;
    try {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'ogohlantirish', $2, $3)`,
        [user.id, title, body]
      );
    } catch (e) {
      console.error('[notificationCron] in-app xato:', e.message);
    }
    await sendPushToUser(user.id, title, body, pool);
  }
}

async function notifyMissingCheckout() {
  console.log('[notificationCron] 17:45 — checkout eslatma');
  const result = await pool.query(
    `SELECT u.id, u.full_name, ws.total_seconds
       FROM users u
       JOIN work_sessions ws ON ws.user_id = u.id
      WHERE ws.work_date = CURRENT_DATE
        AND ws.is_finished = false
        AND u.is_active = true`
  );
  console.log(`[notificationCron] ${result.rowCount} xodim hali checkout qilmagan`);

  for (const user of result.rows) {
    const total = Number(user.total_seconds) || 0;
    const hours = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const title = '🕐 Ish vaqti tugamoqda';
    const body = `Bugungi ish vaqtingiz: ${hours}s ${mins}d. Tizim 18:00 da avtomatik yopadi.`;
    try {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'ogohlantirish', $2, $3)`,
        [user.id, title, body]
      );
    } catch (e) {
      console.error('[notificationCron] in-app xato:', e.message);
    }
    await sendPushToUser(user.id, title, body, pool);
  }
}

function register() {
  cron.schedule(
    '45 8 * * 1-6',
    () => {
      notifyAbsentStaff().catch((e) =>
        console.error('[notificationCron] absent failed:', e.message)
      );
    },
    { timezone: 'Asia/Tashkent' }
  );

  cron.schedule(
    '45 17 * * 1-6',
    () => {
      notifyMissingCheckout().catch((e) =>
        console.error('[notificationCron] checkout failed:', e.message)
      );
    },
    { timezone: 'Asia/Tashkent' }
  );

  console.log('[notificationCron] Rejalashtirildi: 08:45 kelmaganlar, 17:45 checkout (Asia/Tashkent)');
}

module.exports = { register, notifyAbsentStaff, notifyMissingCheckout };
