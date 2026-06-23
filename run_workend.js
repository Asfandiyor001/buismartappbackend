require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/database');
const { closeAllAtWorkEnd } = require('./src/jobs/autoClose.job');

(async () => {
  console.log('Haqiqiy closeAllAtWorkEnd() (JOB B) ishga tushyapti...\n');
  const res = await closeAllAtWorkEnd();
  console.log(`\nNatija: ${res.closed} ta sessiya yopildi.\n`);

  // Tekshiruv — ID 131 holati
  const { rows } = await pool.query(`
    SELECT ws.user_id, u.full_name, ws.status, ws.is_finished, ws.auto_checkout,
           ws.last_exit_time, ws.total_seconds,
           ws.total_seconds/3600 AS soat, (ws.total_seconds%3600)/60 AS daq
    FROM work_sessions ws JOIN users u ON u.id = ws.user_id
    WHERE ws.user_id = 131 AND ws.work_date = CURRENT_DATE`);
  rows.forEach(r => console.log(
    `ID ${r.user_id} ${r.full_name}: status=${r.status} finished=${r.is_finished} ` +
    `auto_co=${r.auto_checkout} chiqish=${r.last_exit_time} ` +
    `vaqt=${Math.floor(r.soat)}s ${Math.floor(r.daq)}d`));

  await pool.end();
})().catch(e => { console.error('Xato:', e.message); process.exit(1); });
