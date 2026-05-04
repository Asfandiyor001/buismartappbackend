const cron = require('node-cron');
const pool = require('../config/database');
const reportService = require('../modules/report/report.service');

async function generatePreviousMonthReports() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = prev.getFullYear();
  const month = prev.getMonth() + 1;

  const staffRes = await pool.query(
    `SELECT id FROM users WHERE role = 'staff'`
  );

  let n = 0;
  for (const row of staffRes.rows) {
    try {
      await reportService.getMonthlyReport(row.id, year, month);
      n += 1;
    } catch (e) {
      console.error('[monthlyReport.job] user', row.id, e.message);
    }
  }

  console.log(`[monthlyReport.job] Generated monthly reports for ${n} staff (${year}-${month})`);
}

function register() {
  cron.schedule('0 1 1 * *', () => {
    generatePreviousMonthReports().catch((e) =>
      console.error('[monthlyReport.job]', e)
    );
  });
}

module.exports = { register, generatePreviousMonthReports };
