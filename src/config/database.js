const { Pool } = require('pg');

// Sessiya vaqt mintaqasini KAFOLATLAB qotiramiz: server default TZ qanday
// bo'lishidan qat'i nazar har bir ulanish Asia/Tashkent bilan ochiladi.
// timestamp WITHOUT time zone ustunlari LOKAL Toshkent vaqtini saqlaydi,
// shu sabab sessiya TZ aynan shu bo'lishi to'g'ri natijani kafolatlaydi.
const commonOptions = {
  options: '-c timezone=Asia/Tashkent',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// Railway / bulut hosting DATABASE_URL (connection string) beradi.
// Agar u mavjud bo'lsa — o'shandan ulanamiz; aks holda local DB_* sozlamalari.
// SSL faqat kerak bo'lganda yoqiladi (DB_SSL=true) — Railway ichki tarmog'i SSL talab qilmaydi.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      ...commonOptions,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'BuiSmartApp',
      ...commonOptions,
    });

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool xatosi:', err.message);
});

module.exports = pool;
