// src/config/jwt.js
const jwt = require('jsonwebtoken');
const config = require('./env'); // oldin yaratgan env.js faylimiz

const signToken = (payload) => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (error) {
    return null; // Token xato yoki muddati o'tgan bo'lsa null qaytaradi
  }
};

module.exports = {
  signToken,
  verifyToken,
};