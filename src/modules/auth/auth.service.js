// src/modules/auth/auth.service.js
const pool = require('../../config/database');
const bcrypt = require('bcryptjs');
const { signToken } = require('../../config/jwt');

const login = async (phone, password) => {
  // 1. Bazadan foydalanuvchini telefon raqami orqali qidirish
  const userResult = await pool.query('SELECT * FROM users WHERE phone = $1 AND is_active = true', [phone]);
  const user = userResult.rows[0];

  if (!user) {
    throw new Error('Telefon raqam yoki parol noto\'g\'ri');
  }

  // 2. Kiritilgan parolni bazadagi hashlangan parol bilan solishtirish
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new Error('Telefon raqam yoki parol noto\'g\'ri');
  }

  // 3. Qo'shimcha ma'lumotlarni tortib olish (agar xodim bo'lsa)
  let extraInfo = {};
  if (user.role === 'staff' || user.role === 'admin') {
    const staffResult = await pool.query('SELECT department, position FROM staff_profiles WHERE user_id = $1', [user.id]);
    if (staffResult.rows.length > 0) {
      extraInfo = staffResult.rows[0];
    }
  }

  // 4. Token yaratish
  const payload = { id: user.id, role: user.role };
  const token = signToken(payload);

  // 5. So'nggi kirish (last_login) vaqtini yangilash
  await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  // Maxfiy ma'lumotlarni javob qaytarishdan oldin o'chirib tashlaymiz
  delete user.password_hash;
  delete user.biometric_key;

  return {
    user: { ...user, ...extraInfo },
    token
  };
};

const biometricLogin = async (userId, bioKey) => {
  const userResult = await pool.query('SELECT * FROM users WHERE id = $1 AND is_active = true', [userId]);
  const user = userResult.rows[0];

  if (!user || !user.biometric_key) {
    throw new Error('Foydalanuvchi yoki biometrik ma\'lumot topilmadi');
  }

  const isMatch = await bcrypt.compare(bioKey, user.biometric_key);
  if (!isMatch) throw new Error('Biometrik kalit noto\'g\'ri');

  const payload = { id: user.id, role: user.role };
  const token = signToken(payload);

  await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  delete user.password_hash;
  delete user.biometric_key;

  return { user, token };
};

const changePassword = async (userId, oldPass, newPass) => {
  const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const user = userResult.rows[0];

  if (!user) throw new Error('Foydalanuvchi topilmadi');

  // Eski parolni tekshirish
  const isMatch = await bcrypt.compare(oldPass, user.password_hash);
  if (!isMatch) throw new Error('Eski parol noto\'g\'ri kiritildi');

  // Yangi parolni shifrlash (hash)
  const salt = await bcrypt.genSalt(10);
  const newHash = await bcrypt.hash(newPass, salt);

  // Bazaga yangi parolni yozish
  await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);
  
  return true;
};

/** JWT bilan kirgan foydalanuvchi uchun xavfsiz profil (maxfiy ustunlarsiz). */
const getMe = async (userId) => {
  const uid = Number(userId);
  if (!Number.isFinite(uid)) {
    throw new Error('Noto\'g\'ri foydalanuvchi');
  }
  const res = await pool.query(
    `SELECT id, full_name, phone, role, avatar_url, is_active, last_login, created_at
     FROM users WHERE id = $1`,
    [uid]
  );
  const row = res.rows[0];
  if (!row) {
    throw new Error('Foydalanuvchi topilmadi');
  }
  return row;
};

module.exports = {
  login,
  biometricLogin,
  changePassword,
  getMe,
};