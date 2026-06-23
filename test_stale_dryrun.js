require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/database');

const STALE_PING_MINUTES = 30;
const t = (d) => d ? new Date(d).toLocaleTimeString('uz-UZ',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}) : '—';

async function main() {
  console.log('\n═══ STALE DRY-RUN (faqat o\'qish, hech narsa o\'zgarmaydi) ═══\n');
  console.log('Hozir:', new Date().toLocaleString('uz-UZ'));

  // JOB A mantiqi: 30+ daq ping kelmagan aktiv sessiyalar
  const { rows: stale } = await pool.query(
    `SELECT ws.id, ws.user_id, u.full_name,
            ws.last_ping_at, ws.outside_since, ws.status, ws.is_finished,
            EXTRACT(EPOCH FROM (NOW() - ws.last_ping_at))/60 AS mins_since_ping
     FROM work_sessions ws JOIN users u ON u.id = ws.user_id
     WHERE ws.work_date = CURRENT_DATE
       AND ws.is_finished = false
       AND ws.status = 'active'
       AND ws.last_ping_at IS NOT NULL
       AND ws.last_ping_at < NOW() - INTERVAL '${STALE_PING_MINUTES} minutes'`
  );

  console.log(`\nJOB A topadi: ${stale.length} ta stale sessiya\n`);
  stale.forEach(s => {
    const exit = s.outside_since || s.last_ping_at;
    console.log(`  ID ${s.user_id} ${s.full_name}`);
    console.log(`    oxirgi ping: ${t(s.last_ping_at)} (${Math.floor(s.mins_since_ping)} daq oldin)`);
    console.log(`    → yopiladi: ${t(exit)} da (sabab: ${s.outside_since ? 'outside_since' : 'last_ping_at'})`);
  });

  // JOB B mantiqi: barcha aktiv (16:31 da)
  const { rows: active } = await pool.query(
    `SELECT ws.id, ws.user_id, u.full_name, ws.last_ping_at
     FROM work_sessions ws JOIN users u ON u.id = ws.user_id
     WHERE ws.work_date = CURRENT_DATE AND ws.is_finished = false AND ws.status = 'active'`
  );
  console.log(`\nJOB B (16:31) yopadi: ${active.length} ta aktiv sessiya`);

  await pool.end();
  console.log('\n═══════════════════════════════════════════════════════════\n');
}
main().catch(e => { console.error('Xato:', e.message); process.exit(1); });
