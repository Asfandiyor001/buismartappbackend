require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/database');

async function main() {
  const { rows: [user] } = await pool.query('SELECT id, full_name, phone FROM users WHERE id = 34');
  console.log('\n👤 XODIM:', user?.full_name, '|', user?.phone);

  const { rows: sess } = await pool.query(
    `SELECT id, status, is_finished, first_entry_time, total_seconds, last_ping_at, auto_checkout
     FROM work_sessions WHERE user_id = 34 AND work_date = CURRENT_DATE`
  );
  if (!sess.length) { console.log('Bugun sessiya yoq!'); await pool.end(); return; }
  const s = sess[0];
  console.log('\n📋 SESSIYA ID:', s.id, '| Status:', s.status, '| Tugadimi:', s.is_finished);
  console.log('  Kirdi:', s.first_entry_time);
  console.log('  Total:', s.total_seconds, '=', Math.floor(s.total_seconds/3600)+'s', Math.floor((s.total_seconds%3600)/60)+'d');
  console.log('  Oxirgi ping:', s.last_ping_at);
  console.log('  Auto checkout:', s.auto_checkout);

  const { rows: logs } = await pool.query(
    `SELECT id, entry_time, exit_time, duration_seconds, is_active, checkout_reason
     FROM work_logs WHERE user_id = 34 AND DATE(entry_time) = CURRENT_DATE ORDER BY entry_time ASC`
  );
  console.log('\n📝 WORK LOGS (' + logs.length + ' ta):');
  logs.forEach((l, i) => {
    const dur = l.duration_seconds != null ? Math.floor(l.duration_seconds/60)+'d' : 'davomda';
    const entry = new Date(l.entry_time).toTimeString().slice(0,8);
    const exit  = l.exit_time ? new Date(l.exit_time).toTimeString().slice(0,8) : 'YOQ';
    console.log(`  ${i+1}) Kirdi: ${entry} | Chiqdi: ${exit} | ${dur} | Aktiv: ${l.is_active} | Sabab: ${l.checkout_reason}`);
  });

  const { rows: pings } = await pool.query(
    `SELECT is_inside, distance_m, accuracy_m, action, created_at
     FROM gps_pings WHERE user_id = 34 AND DATE(created_at) = CURRENT_DATE
     ORDER BY created_at DESC LIMIT 12`
  );
  console.log('\n📡 SO\'NGI PINGLAR:');
  pings.forEach(p => {
    const t = new Date(p.created_at).toTimeString().slice(0,8);
    console.log(`  ${t} | Ichkari: ${p.is_inside} | ${p.distance_m}m | Action: ${p.action}`);
  });

  await pool.end();
}
main().catch(e => { console.error('Xato:', e.message); process.exit(1); });
