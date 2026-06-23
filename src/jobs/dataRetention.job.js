const cron = require('node-cron');
const pool = require('../config/database');

async function cleanOldGpsPings() {
  try {
    const res = await pool.query(
      `DELETE FROM gps_pings WHERE created_at < NOW() - INTERVAL '1 year'`
    );
    console.log(`[dataRetention] Deleted ${res.rowCount} old GPS pings`);
  } catch (e) {
    console.error('[dataRetention] cleanOldGpsPings error:', e.message);
  }
}

async function cleanOldNotifications() {
  try {
    const res = await pool.query(
      `DELETE FROM notifications
       WHERE created_at < NOW() - INTERVAL '6 months' AND is_read = true`
    );
    console.log(`[dataRetention] Deleted ${res.rowCount} old notifications`);
  } catch (e) {
    console.error('[dataRetention] cleanOldNotifications error:', e.message);
  }
}

function register() {
  cron.schedule('0 3 1 * *', async () => {
    console.log('[dataRetention] Monthly cleanup starting...');
    await cleanOldGpsPings();
    await cleanOldNotifications();
  }, { timezone: 'Asia/Tashkent' });
  console.log('[dataRetention] Job scheduled: 1st of each month at 03:00');
}

module.exports = { register, cleanOldGpsPings, cleanOldNotifications };
