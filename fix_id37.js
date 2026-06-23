require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/database');

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Log 1 ning haqiqiy chiqish vaqti = Log 2 boshlangan vaqt (11:39:45)
    const LOG1_ID    = 1; // work_logs dagi birinchi log
    const SESSION_ID = 817;

    // Log 1 ni topamiz (08:45 da kirgan, gps_lost bilan yopilgan)
    const { rows: [log1] } = await client.query(
      `SELECT id, entry_time, exit_time, duration_seconds
       FROM work_logs
       WHERE user_id = 37
         AND DATE(entry_time) = CURRENT_DATE
         AND checkout_reason = 'gps_lost'
         AND is_active = false
       ORDER BY entry_time ASC LIMIT 1`
    );

    if (!log1) {
      console.log('❌ Log 1 topilmadi');
      await client.query('ROLLBACK');
      return;
    }

    // Log 2 boshlangan vaqtni olish (11:39:45)
    const { rows: [log2] } = await client.query(
      `SELECT entry_time FROM work_logs
       WHERE user_id = 37
         AND DATE(entry_time) = CURRENT_DATE
         AND checkout_reason = 'manual'
         AND is_active = true
       LIMIT 1`
    );

    if (!log2) {
      console.log('❌ Log 2 topilmadi');
      await client.query('ROLLBACK');
      return;
    }

    const entryMs  = new Date(log1.entry_time).getTime();
    const exitMs   = new Date(log2.entry_time).getTime();
    const duration = Math.floor((exitMs - entryMs) / 1000); // soniyalarda

    console.log('\n📊 TUZATISH:');
    console.log('  Log 1 kirdi:', log1.entry_time);
    console.log('  Log 1 chiqdi (to\'g\'ri):', log2.entry_time);
    console.log('  Yo\'qolgan vaqt:', Math.floor(duration/3600) + 's ' + Math.floor((duration%3600)/60) + 'd');

    // Log 1 ni to'g'ri yangilash
    await client.query(
      `UPDATE work_logs SET
         exit_time        = $1,
         duration_seconds = $2,
         checkout_reason  = 'auto_gps'
       WHERE id = $3`,
      [log2.entry_time, duration, log1.id]
    );

    // Sessiyani qayta hisoblash
    const { rows: [totals] } = await client.query(
      `SELECT COALESCE(SUM(duration_seconds), 0)::bigint AS total
       FROM work_logs
       WHERE session_id = $1 AND duration_seconds IS NOT NULL`,
      [SESSION_ID]
    );

    const total      = parseInt(totals.total, 10);
    const regular    = Math.min(total, 8 * 3600);
    const overtime   = Math.max(0, total - regular);

    await client.query(
      `UPDATE work_sessions SET
         total_seconds    = $1,
         regular_seconds  = $2,
         overtime_seconds = $3,
         updated_at       = NOW()
       WHERE id = $4`,
      [total, regular, overtime, SESSION_ID]
    );

    await client.query('COMMIT');

    console.log('\n✅ TUZATILDI:');
    console.log('  Jami vaqt:', Math.floor(total/3600) + 's ' + Math.floor((total%3600)/60) + 'd');
    console.log('  Asosiy:', Math.floor(regular/3600) + 's ' + Math.floor((regular%3600)/60) + 'd');
    if (overtime > 0) console.log('  Qo\'shimcha:', Math.floor(overtime/3600) + 's ' + Math.floor((overtime%3600)/60) + 'd');

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Xato:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
