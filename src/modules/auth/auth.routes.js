// src/modules/auth/auth.routes.js
const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { validate, loginSchema, biometricSchema, changePasswordSchema } = require('../../middleware/validate');
const authenticate = require('../../middleware/auth');
const rateLimit = require('express-rate-limit');

// Brute-force himoya: 1 daqiqada faqat 10 ta login urinishiga ruxsat!
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 daqiqa
  max: 10,
  message: { success: false, message: 'Juda ko\'p urinishlar! Iltimos, 1 daqiqadan so\'ng qayta urinib ko\'ring.' }
});

// Ochiq yo'laklar (Token kerak emas)
router.post('/login', loginLimiter, validate(loginSchema), authController.login);
router.post('/biometric', loginLimiter, validate(biometricSchema), authController.biometricLogin);

// Yopiq yo'laklar (Token va authenticate qorovuli shart)
router.get('/me', authenticate, authController.me);
router.post('/logout', authenticate, authController.logout);
router.put('/change-password', authenticate, validate(changePasswordSchema), authController.changePassword);

module.exports = router;