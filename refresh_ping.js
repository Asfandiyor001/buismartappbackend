require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/database');
const { processPing } = require('./src/modules/work/geofence.service');

const LAT = 39.741066;
const LON = 64.427637;
const ACC = 18;
const IDS = [46, 47, 48, 49, 50, 51, 52, 53, 54, 55];

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('HOZIRGI VAQTDA PING — ID 46–55');
  console.log('='.repeat(60));

  for (const id of IDS) {
    // Debounce ni chetlab o'tish uchun last ping ni tozalaymiz
    await pool.query(
      `UPDATE work_sessions SET last_ping_at = NOW() - INTERVAL '2 minutes'
       WHERE user_id = $1 AND work_date = CURRENT_DATE`,
      [id]
    );

    const result = await processPing(id, LAT, LON, ACC);
    const { rows: [u] } = await pool.query(
      `SELECT full_name FROM users WHERE id = $1`, [id]
    );
    console.log(`✓ ${String(id).padEnd(4)} ${(u?.full_name||'').padEnd(34)} → ${result.action}`);
  }

  console.log('='.repeat(60));
  console.log('✅ Ping yuborildi. Dashboard yangilang (F5).\n');
  await pool.end();
}

main().catch(e => { console.error('Xato:', e.message); process.exit(1); });
