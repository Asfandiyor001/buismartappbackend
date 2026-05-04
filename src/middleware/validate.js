// src/middleware/validate.js
const Joi = require('joi');
const { error } = require('../utils/response');

// Login uchun sxema
const loginSchema = Joi.object({
  phone: Joi.string().required().messages({
    'string.empty': 'Telefon raqam kiritilishi shart',
    'any.required': 'Telefon raqam kiritilishi shart'
  }),
  password: Joi.string().min(4).required().messages({
    'string.min': 'Parol kamida 4 ta belgidan iborat bo\'lishi kerak',
    'string.empty': 'Parol kiritilishi shart',
    'any.required': 'Parol kiritilishi shart'
  })
});

// Biometrik login uchun sxema
const biometricSchema = Joi.object({
  userId: Joi.number().required(),
  bioKey: Joi.string().required()
});

// Parolni o'zgartirish uchun sxema
const changePasswordSchema = Joi.object({
  oldPass: Joi.string().required(),
  newPass: Joi.string().min(4).required()
});

// Umumiy validatsiya funksiyasi
const validate = (schema) => {
  return (req, res, next) => {
    const { error: validationError } = schema.validate(req.body);
    
    if (validationError) {
      const errorMessage = validationError.details.map(i => i.message).join(', ');
      return error(res, errorMessage, 400);
    }
    
    next();
  };
};

module.exports = {
  loginSchema,
  biometricSchema,
  changePasswordSchema,
  validate
};