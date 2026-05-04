const dailyReportJob = require('./dailyReport.job');
const absentCheckJob = require('./absentCheck.job');
const monthlyReportJob = require('./monthlyReport.job');

function startCronJobs() {
  dailyReportJob.register();
  absentCheckJob.register();
  monthlyReportJob.register();
  console.log('⏰ Cron ishlar ro\'yxatdan o\'tkazildi');
}

module.exports = { startCronJobs };
