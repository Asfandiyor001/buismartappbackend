// ═══════════════════════════════════════════════════════════
// EXPO PUSH NOTIFICATION yuborish (Expo Push API)
// Node 18+ global fetch ishlatiladi — node-fetch shart emas.
// ═══════════════════════════════════════════════════════════
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo push token formatini tekshirish */
function isExpoToken(token) {
  return (
    typeof token === 'string' &&
    (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))
  );
}

async function sendPushNotification(expoPushToken, title, body, data = {}) {
  if (!isExpoToken(expoPushToken)) return;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify({
          to: expoPushToken,
          title,
          body,
          sound: 'default',
          priority: 'high',
          channelId: 'default',
          data,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    console.log(`[push] Yuborildi: ${expoPushToken.slice(0, 24)}...`);
  } catch (err) {
    console.log('[push] Xato:', err.message);
  }
}

async function sendPushToUser(userId, title, body, pool, data = {}) {
  try {
    const result = await pool.query(
      `SELECT push_token FROM users WHERE id = $1 AND push_token IS NOT NULL`,
      [userId]
    );
    const token = result.rows[0]?.push_token;
    if (token) {
      await sendPushNotification(token, title, body, data);
    }
  } catch (err) {
    console.log('[push] sendPushToUser xato:', err.message);
  }
}

async function sendPushToAll(title, body, pool, data = {}) {
  try {
    const result = await pool.query(
      `SELECT id, push_token FROM users
       WHERE push_token IS NOT NULL AND role IN ('staff','prorektor')`
    );
    for (const user of result.rows) {
      await sendPushNotification(user.push_token, title, body, data);
    }
  } catch (err) {
    console.log('[push] sendPushToAll xato:', err.message);
  }
}

module.exports = { sendPushNotification, sendPushToUser, sendPushToAll };
