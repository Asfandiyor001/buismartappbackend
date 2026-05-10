const cron = require('node-cron');
const pool = require('../config/database');

async function markAbsentStaff() {
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 0) {
    console.log('[absentCheck] Yakshanba — skip');
    return;
  }

  const res = await pool.query(
    `INSERT INTO work_sessions (user_id, work_date, status, is_finished)
     SELECT u.id, CURRENT_DATE, 'absent', true
     FROM users u
     WHERE u.role = 'staff'
       AND u.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM work_sessions ws
         WHERE ws.user_id = u.id AND ws.work_date = CURRENT_DATE
       )
     ON CONFLICT (user_id, work_date) DO NOTHING
     RETURNING id`
  );
  const n = res.rowCount;
  console.log(`[absentCheck.job] Marked ${n} staff as absent (new rows)`);
}

function register() {
  cron.schedule('0 10 * * 1-6', () => {
    markAbsentStaff().catch((e) => console.error('[absentCheck.job]', e));
  });
}

module.exports = { register, markAbsentStaff };
