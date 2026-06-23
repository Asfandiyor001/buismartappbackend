const pool = require('../config/database');

async function addToken(token, expiresAt) {
  try {
    await pool.query(
      `INSERT INTO token_blacklist (token, expires_at)
       VALUES ($1, $2) ON CONFLICT (token) DO NOTHING`,
      [token, expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    );
  } catch (e) {
    console.error('[tokenBlacklist] addToken error:', e.message);
  }
}

async function hasToken(token) {
  try {
    const res = await pool.query(
      `SELECT 1 FROM token_blacklist WHERE token = $1 AND expires_at > NOW() LIMIT 1`,
      [token]
    );
    return res.rows.length > 0;
  } catch (e) {
    console.error('[tokenBlacklist] hasToken error:', e.message);
    return false;
  }
}

async function cleanExpired() {
  try {
    await pool.query(`DELETE FROM token_blacklist WHERE expires_at <= NOW()`);
  } catch (e) {
    console.error('[tokenBlacklist] cleanExpired error:', e.message);
  }
}

module.exports = { addToken, hasToken, cleanExpired };
