// src/config/database.js
const { Pool } = require('pg');
const config = require('./env');

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
});

// Bazada xatolik bo'lsa ko'rsatish
pool.on('error', (err, client) => {
  console.error('PostgreSQL bazasida xatolik:', err);
  process.exit(-1);
});

// ENG MUHIM QATOR: pool ni tashqariga chiqarish
module.exports = pool;