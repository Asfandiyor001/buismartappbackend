process.env.TZ = process.env.TZ || 'Asia/Tashkent';

require('@dotenvx/dotenvx').config();

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET .env da aniqlanmagan!');
  process.exit(1);
}

const app = require('./src/app');
const config = require('./src/config/env');
const pool = require('./src/config/database');
const { startCronJobs } = require('./src/jobs');

const PORT = config.port || 5000;

// Avval PostgreSQL bazaga ulanamiz, ulanish o'xshasa keyin serverni yoqamiz
pool.connect()
  .then((client) => {
    console.log('✅ PostgreSQL (BuiSmartApp) bazasiga muvaffaqiyatli ulandi!');
    client.release(); // Ulanishni joyiga qaytarish

    // Serverni belgilangan portda eshitishni boshlash
    app.listen(PORT, () => {
      console.log(`🚀 Server http://localhost:${PORT} manzilida ishga tushdi`);
      startCronJobs();
    });
  })
  .catch((err) => {
    console.error('❌ Bazaga ulanishda xatolik yuz berdi:', err.message);
    process.exit(1); // Xato bo'lsa serverni to'xtatish
  });

process.on('unhandledRejection', (reason, promise) => {
  console.error('[server] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught Exception:', err);
  process.exit(1);
});