process.env.TZ = 'Asia/Tashkent';
require('@dotenvx/dotenvx').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const { wakeStaleDevices } = require('../src/jobs/gpsWatchdog.job');

(async () => {
  console.log('\n--- GPS Watchdog Test ---');
  try {
    const result = await wakeStaleDevices();
    console.log(`  checked=${result.checked} woken=${result.woken}`);
    console.log('  ✅ gpsWatchdog.wakeStaleDevices() ishladi');
  } catch (e) {
    console.log('  ❌ ERROR:', e.message);
  }
  process.exit(0);
})();
