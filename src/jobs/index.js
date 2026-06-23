const dailyReportJob = require('./dailyReport.job');
const absentCheckJob = require('./absentCheck.job');
const monthlyReportJob = require('./monthlyReport.job');
const autoCloseJob = require('./autoClose.job');
const notificationCronJob = require('./notificationCron.job');
const dataRetentionJob = require('./dataRetention.job');
const gpsWatchdogJob = require('./gpsWatchdog.job');

function startCronJobs() {
  dailyReportJob.register();
  absentCheckJob.register();
  monthlyReportJob.register();
  autoCloseJob.register();
  notificationCronJob.register();
  dataRetentionJob.register();
  gpsWatchdogJob.register();
  console.log('⏰ Cron ishlar ro\'yxatdan o\'tkazildi');
}

module.exports = { startCronJobs };
