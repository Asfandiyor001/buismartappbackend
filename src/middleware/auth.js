// src/middleware/auth.js
const { verifyToken } = require('../config/jwt');
const { error } = require('../utils/response');
const { hasToken } = require('../utils/tokenBlacklist');

const authenticate = async (req, res, next) => {
  // So'rovning 'headers' qismidan tokenni qidiramiz
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(res, 'Kirish taqiqlangan. Token taqdim etilmadi!', 401);
  }

  // 'Bearer shkjdhfs...' dagi 'Bearer' so'zini olib tashlab, faqat tokenni o'zini olamiz
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return error(res, 'Yaroqsiz yoki muddati o\'tgan token!', 401);
  }

  if (await hasToken(token)) {
    return res.status(401).json({ success: false, message: 'Token bekor qilingan' });
  }

  // Agar token to'g'ri bo'lsa, foydalanuvchi ma'lumotlarini req.user ga ulaymiz
  req.user = decoded; 
  next(); // Keyingi bosqichga ruxsat
};

module.exports = authenticate;