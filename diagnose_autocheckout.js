require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/database');

const t = (d) => d ? new Date(d).toLocaleTimeString('uz-UZ', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }) : '—';

async function main() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  AUTO-CHECKOUT DIAGNOSTIKA — ', new Date().toLocaleString('uz-UZ'));
  console.log('══════════════════════════════════════════════');

  // 1) Bugungi aktiv (yopilmagan) sessiyalar
  const { rows: active } = await pool.query(`
    SELECT ws.id, ws.user_id, u.full_name, ws.status, ws.is_finished,
           ws.outside_since, ws.last_ping_at, ws.auto_checkout, ws.total_seconds,
           EXTRACT(EPOCH FROM (NOW() - ws.last_ping_at))/60 AS ping_age_min,
           EXTRACT(EPOCH FROM (NOW() - ws.outside_since))/60 AS outside_min
    FROM work_sessions ws JOIN users u ON u.id = ws.user_id
    WHERE ws.work_date = CURRENT_DATE AND ws.is_finished = false
    ORDER BY ws.last_ping_at ASC
  `);
  console.log(`\n📋 [1] BUGUNGI AKTIV SESSIYALAR: ${active.length} ta\n`);
  active.forEach(r => {
    console.log(`  ID ${String(r.user_id).padEnd(4)} ${(r.full_name||'').padEnd(34)}`);
    console.log(`         status=${r.status} finished=${r.is_finished} auto_co=${r.auto_checkout}`);
    console.log(`         oxirgi_ping=${t(r.last_ping_at)} (${Math.round(r.ping_age_min)} daq oldin) | outside_since=${r.outside_since ? t(r.outside_since)+' ('+Math.round(r.outside_min)+' daq)' : 'NULL'}`);
  });

  // 2) So'nggi 3 soatdagi pinglar (umumiy)
  const { rows: pings } = await pool.query(`
    SELECT gp.user_id, u.full_name, gp.is_inside, gp.distance_m, gp.action, gp.created_at
    FROM gps_pings gp JOIN users u ON u.id = gp.user_id
    WHERE gp.created_at > NOW() - INTERVAL '3 hours'
    ORDER BY gp.created_at DESC LIMIT 25
  `);
  console.log(`\n📡 [2] SO'NGGI 3 SOATDAGI PINGLAR: ${pings.length} ta\n`);
  pings.forEach(p => {
    console.log(`  ${t(p.created_at)} | ID ${String(p.user_id).padEnd(4)} | ${p.is_inside?'ICHKARI':'TASHQARI'} | ${Math.round(p.distance_m)}m | ${p.action}`);
  });

  // 3) outside_since bo'lgan sessiyalar
  const { rows: outside } = await pool.query(`
    SELECT ws.user_id, u.full_name, ws.outside_since,
           EXTRACT(EPOCH FROM (NOW() - ws.outside_since))/60 AS min_outside
    FROM work_sessions ws JOIN users u ON u.id = ws.user_id
    WHERE ws.work_date = CURRENT_DATE AND ws.outside_since IS NOT NULL
  `);
  console.log(`\n🚪 [3] outside_since SET BO'LGAN SESSIYALAR: ${outside.length} ta\n`);
  outside.forEach(r => console.log(`  ID ${r.user_id} ${r.full_name} — ${Math.round(r.min_outside)} daqiqa tashqarida (since ${t(r.outside_since)})`));

  // 4) So'nggi 2 soatdagi TASHQARI pinglar (har bir user)
  const { rows: outPings } = await pool.query(`
    SELECT gp.user_id, u.full_name, gp.distance_m, gp.created_at
    FROM gps_pings gp JOIN users u ON u.id = gp.user_id
    WHERE gp.created_at > NOW() - INTERVAL '2 hours' AND gp.is_inside = false
    ORDER BY gp.user_id, gp.created_at DESC
  `);
  console.log(`\n🔴 [4] SO'NGGI 2 SOATDAGI TASHQARI PINGLAR: ${outPings.length} ta\n`);
  if (!outPings.length) console.log('  ⚠️  HECH QANDAY TASHQARI PING YO\'Q! (ping kelmayapti yoki hamma ichkarida)');
  outPings.forEach(p => console.log(`  ${t(p.created_at)} | ID ${p.user_id} ${p.full_name} | ${Math.round(p.distance_m)}m`));

  // 5) auto_checkout tarixi
  const { rows: hist } = await pool.query(`
    SELECT ws.user_id, u.full_name, ws.auto_checkout, ws.status, ws.work_date, ws.total_seconds
    FROM work_sessions ws JOIN users u ON u.id = ws.user_id
    WHERE ws.auto_checkout = true ORDER BY ws.work_date DESC LIMIT 8
  `);
  console.log(`\n📜 [5] AUTO_CHECKOUT TARIXI: ${hist.length} ta\n`);
  hist.forEach(r => console.log(`  ${r.work_date.toISOString().slice(0,10)} | ID ${r.user_id} ${r.full_name} | ${r.status}`));

  // 6) Eng so'nggi pingning yoshini har bir aktiv user uchun
  console.log(`\n⏱️  [6] AKTIV USERLAR — ENG SO'NGGI PING TAHLILI\n`);
  for (const s of active) {
    const { rows: [lastPing] } = await pool.query(`
      SELECT is_inside, distance_m, created_at,
             EXTRACT(EPOCH FROM (NOW() - created_at))/60 AS age_min
      FROM gps_pings WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
    `, [s.user_id]);
    if (!lastPing) { console.log(`  ID ${s.user_id} ${s.full_name}: ping YO'Q`); continue; }
    console.log(`  ID ${String(s.user_id).padEnd(4)} ${(s.full_name||'').padEnd(30)} → so'nggi: ${t(lastPing.created_at)} (${Math.round(lastPing.age_min)} daq oldin) ${lastPing.is_inside?'ICHKARI':'TASHQARI'} ${Math.round(lastPing.distance_m)}m`);
  }

  await pool.end();
  console.log('\n══════════════════════════════════════════════\n');
}
main().catch(e => { console.error('Xato:', e.message); process.exit(1); });
