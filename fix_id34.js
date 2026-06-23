require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/database');

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const SESSION_ID = 815;

    const { rows: [log1] } = await client.query(
      `SELECT id, entry_time FROM work_logs
       WHERE user_id = 34
         AND DATE(entry_time) = CURRENT_DATE
         AND checkout_reason = 'gps_lost'
         AND is_active = false
       ORDER BY entry_time ASC LIMIT 1`
    );
    if (!log1) { console.log('❌ Log 1 topilmadi'); await client.query('ROLLBACK'); return; }

    const { rows: [log2] } = await client.query(
      `SELECT entry_time FROM work_logs
       WHERE user_id = 34
         AND DATE(entry_time) = CURRENT_DATE
         AND is_active = true
       LIMIT 1`
    );
    if (!log2) { console.log('❌ Log 2 topilmadi'); await client.query('ROLLBACK'); return; }

    const duration = Math.floor((new Date(log2.entry_time) - new Date(log1.entry_time)) / 1000);
    console.log('\n📊 TUZATISH:');
    console.log('  Log 1 kirdi:', new Date(log1.entry_time).toTimeString().slice(0,8));
    console.log('  Log 1 chiqdi (to\'g\'ri):', new Date(log2.entry_time).toTimeString().slice(0,8));
    console.log('  Yo\'qolgan vaqt:', Math.floor(duration/3600)+'s', Math.floor((duration%3600)/60)+'d');

    await client.query(
      `UPDATE work_logs SET exit_time=$1, duration_seconds=$2, checkout_reason='auto_gps' WHERE id=$3`,
      [log2.entry_time, duration, log1.id]
    );

    const { rows: [totals] } = await client.query(
      `SELECT COALESCE(SUM(duration_seconds),0)::bigint AS total FROM work_logs
       WHERE session_id=$1 AND duration_seconds IS NOT NULL`,
      [SESSION_ID]
    );
    const total    = parseInt(totals.total, 10);
    const regular  = Math.min(total, 8*3600);
    const overtime = Math.max(0, total - regular);

    await client.query(
      `UPDATE work_sessions SET total_seconds=$1, regular_seconds=$2, overtime_seconds=$3, updated_at=NOW() WHERE id=$4`,
      [total, regular, overtime, SESSION_ID]
    );

    await client.query('COMMIT');
    console.log('\n✅ TUZATILDI:');
    console.log('  Jami (yopilgan loglar):', Math.floor(total/3600)+'s', Math.floor((total%3600)/60)+'d');
    console.log('  (Log 2 aktiv davom etyapti — live total yanada ko\'p)');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Xato:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}
main();
