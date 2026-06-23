require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/database');
const t = (d) => d ? new Date(d).toLocaleString('uz-UZ',{hour12:false}) : '—';

(async () => {
  // Constraint ta'rifi
  const { rows: con } = await pool.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE conname = 'check_valid_duration'`);
  console.log('CONSTRAINT:');
  con.forEach(c => console.log('  ', c.def));

  // ID 131 ning bugungi sessiyasi + barcha loglari
  const { rows: sess } = await pool.query(`
    SELECT id, status, is_finished, first_entry_time, last_ping_at
    FROM work_sessions WHERE user_id=131 AND work_date=CURRENT_DATE`);
  console.log('\nSESSIYA:', JSON.stringify(sess[0]));

  const { rows: logs } = await pool.query(`
    SELECT id, entry_time, exit_time, duration_seconds, is_active, checkout_reason
    FROM work_logs WHERE session_id=$1 ORDER BY entry_time`, [sess[0].id]);
  console.log('\nLOGLAR:');
  logs.forEach(l => console.log(
    `  log#${l.id} kirdi=${t(l.entry_time)} chiqdi=${t(l.exit_time)} ` +
    `dur=${l.duration_seconds} active=${l.is_active} sabab=${l.checkout_reason}`));

  await pool.end();
})().catch(e => { console.error('Xato:', e.message); process.exit(1); });
