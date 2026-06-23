require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/database');

async function main() {
  // Bugun muammoli sessiyalarni topish:
  // - gps_lost sababi bilan yopilgan log bor, duration_seconds <= 1
  // - va aktiv (recheckin) log ham bor
  const { rows: affected } = await pool.query(`
    SELECT DISTINCT
      ws.id         AS session_id,
      ws.user_id,
      u.full_name,
      ws.total_seconds,
      bad_log.id          AS bad_log_id,
      bad_log.entry_time  AS bad_entry,
      good_log.id         AS good_log_id,
      good_log.entry_time AS good_entry
    FROM work_sessions ws
    JOIN users u ON u.id = ws.user_id
    JOIN work_logs bad_log ON (
      bad_log.session_id = ws.id
      AND bad_log.is_active = false
      AND bad_log.checkout_reason = 'gps_lost'
      AND COALESCE(bad_log.duration_seconds, 0) <= 1
    )
    JOIN work_logs good_log ON (
      good_log.session_id = ws.id
      AND good_log.is_active = true
    )
    WHERE ws.work_date = CURRENT_DATE
    ORDER BY ws.user_id
  `);

  if (!affected.length) {
    console.log('\n✅ Bugun muammoli sessiya topilmadi!');
    await pool.end();
    return;
  }

  console.log(`\n⚠️  ${affected.length} ta muammoli sessiya topildi:\n`);
  affected.forEach(r => {
    const entry    = new Date(r.bad_entry).toTimeString().slice(0,8);
    const recheckin = new Date(r.good_entry).toTimeString().slice(0,8);
    console.log(`  ID ${String(r.user_id).padEnd(4)} ${r.full_name}`);
    console.log(`         Sessiya: ${r.session_id} | Total: ${r.total_seconds}s | Log: ${entry} → gps_lost(0s) → Recheckin: ${recheckin}`);
  });

  console.log('\n🔧 Tuzatilmoqda...\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let fixed = 0;

    for (const r of affected) {
      const duration = Math.floor(
        (new Date(r.good_entry) - new Date(r.bad_entry)) / 1000
      );
      if (duration <= 0) {
        console.log(`  ⚠️  ID ${r.user_id}: duration manfiy/nol (${duration}s), o'tkazildi`);
        continue;
      }

      // Log yopish vaqtini va sababini to'g'rilash
      await client.query(
        `UPDATE work_logs
         SET exit_time = $1, duration_seconds = $2, checkout_reason = 'auto_gps'
         WHERE id = $3`,
        [r.good_entry, duration, r.bad_log_id]
      );

      // Sessiya total_seconds ni qayta hisoblash
      const { rows: [totals] } = await client.query(
        `SELECT COALESCE(SUM(duration_seconds), 0)::bigint AS total
         FROM work_logs
         WHERE session_id = $1 AND duration_seconds IS NOT NULL`,
        [r.session_id]
      );
      const total    = parseInt(totals.total, 10);
      const regular  = Math.min(total, 8 * 3600);
      const overtime = Math.max(0, total - regular);

      await client.query(
        `UPDATE work_sessions
         SET total_seconds=$1, regular_seconds=$2, overtime_seconds=$3, updated_at=NOW()
         WHERE id=$4`,
        [total, regular, overtime, r.session_id]
      );

      const h = Math.floor(duration/3600);
      const m = Math.floor((duration%3600)/60);
      const th = Math.floor(total/3600);
      const tm = Math.floor((total%3600)/60);
      console.log(`  ✅ ID ${r.user_id} (${r.full_name}): +${h}s ${m}d qaytarildi → jami ${th}s ${tm}d`);
      fixed++;
    }

    await client.query('COMMIT');
    console.log(`\n✅ Jami ${fixed} ta sessiya tuzatildi!`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Xato:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
