require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/database');

async function main() {
  const { rows: [user] } = await pool.query(
    'SELECT id, full_name, phone FROM users WHERE id = 37'
  );
  console.log('\n👤 XODIM:', user?.full_name, '| Tel:', user?.phone);

  const { rows: sess } = await pool.query(`
    SELECT id, status, is_finished, first_entry_time,
           total_seconds, regular_seconds, overtime_seconds,
           last_ping_at, outside_since, finished_at, auto_checkout
    FROM work_sessions WHERE user_id = 37 AND work_date = CURRENT_DATE
  `);

  if (!sess.length) {
    console.log('❌ Bugun sessiya yo\'q!');
  } else {
    const s = sess[0];
    console.log('\n📋 SESSIYA:');
    console.log('  ID:', s.id, '| Status:', s.status, '| Tugadimi:', s.is_finished);
    console.log('  Kirdi:', s.first_entry_time);
    console.log('  Jami soniya:', s.total_seconds, '=', Math.floor(s.total_seconds/3600)+'s', Math.floor((s.total_seconds%3600)/60)+'d');
    console.log('  Oxirgi ping:', s.last_ping_at);
    console.log('  Tashqarida:', s.outside_since);
    console.log('  Tugash vaqti:', s.finished_at);
    console.log('  Auto checkout:', s.auto_checkout);
  }

  const { rows: logs } = await pool.query(`
    SELECT id, building_id, entry_time, exit_time,
           duration_seconds, is_active, checkout_reason
    FROM work_logs WHERE user_id = 37 AND DATE(entry_time) = CURRENT_DATE
    ORDER BY entry_time ASC
  `);

  console.log('\n📝 WORK LOGS (' + logs.length + ' ta):');
  logs.forEach((l, i) => {
    const dur = l.duration_seconds ? Math.floor(l.duration_seconds/60)+'d' : 'hali davomda';
    console.log(`  ${i+1}) Kirdi: ${l.entry_time} | Chiqdi: ${l.exit_time || 'YOQ'} | ${dur} | Aktiv: ${l.is_active} | Sabab: ${l.checkout_reason}`);
  });

  const { rows: pings } = await pool.query(`
    SELECT id, is_inside, distance_m, accuracy_m, action, created_at
    FROM gps_pings WHERE user_id = 37 AND DATE(created_at) = CURRENT_DATE
    ORDER BY created_at DESC LIMIT 15
  `);

  console.log('\n📡 SO\'NGI PINGLAR (' + pings.length + ' ta):');
  pings.forEach(p => {
    const t = new Date(p.created_at).toTimeString().slice(0,8);
    console.log(`  ${t} | Ichkari: ${p.is_inside} | Masofa: ${p.distance_m}m | Accuracy: ${p.accuracy_m}m | Action: ${p.action}`);
  });

  await pool.end();
}
main().catch(e => { console.error('Xato:', e.message); process.exit(1); });
