const pool = require('../../config/database');

const ALLOWED_TYPES = new Set([
  'davomat',
  'topshiriq',
  'jadval',
  'baho',
  'ogohlantirish',
  'tizim',
]);

async function getMyNotifications(userId, limit = 20, offset = 0) {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const off = Math.max(Number(offset) || 0, 0);

  const [list, unread, total] = await Promise.all([
    pool.query(
      `SELECT id, type, title, body, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, lim, off]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM notifications
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1`,
      [userId]
    ),
  ]);

  return {
    notifications: list.rows,
    unreadCount: unread.rows[0].c,
    total: total.rows[0].c,
  };
}

async function markAsRead(userId, notificationId) {
  const res = await pool.query(
    `UPDATE notifications SET is_read = true, read_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, type, title, body, is_read, read_at, created_at`,
    [notificationId, userId]
  );
  if (res.rowCount === 0) {
    throw new Error('Xabarnoma topilmadi');
  }
  return res.rows[0];
}

async function markAllRead(userId) {
  const res = await pool.query(
    `UPDATE notifications SET is_read = true, read_at = NOW()
     WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return { updatedCount: res.rowCount };
}

async function deleteNotification(userId, notificationId) {
  const res = await pool.query(
    `DELETE FROM notifications
     WHERE id = $1 AND user_id = $2`,
    [notificationId, userId]
  );
  if (res.rowCount === 0) {
    throw new Error('Xabarnoma topilmadi');
  }
  return { success: true };
}

async function sendNotification(userId, type, title, body, data = null) {
  if (!ALLOWED_TYPES.has(String(type))) {
    throw new Error('Xabarnoma turi noto\'g\'ri');
  }
  const res = await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, type, title, body, data == null ? null : data]
  );
  return res.rows[0];
}

module.exports = {
  getMyNotifications,
  markAsRead,
  markAllRead,
  deleteNotification,
  sendNotification,
};
