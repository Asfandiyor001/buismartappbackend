const authService = require('./auth.service');
const { success, error } = require('../../utils/response');
const { addToken } = require('../../utils/tokenBlacklist');

const login = async (req, res) => {
  try {
    const { phone, password } = req.body;
    const result = await authService.login(phone, password);
    return success(res, result, 'Tizimga muvaffaqiyatli kirdingiz');
  } catch (err) {
    return error(res, err.message, 401);
  }
};

const biometricLogin = async (req, res) => {
  try {
    const { userId, bioKey } = req.body;
    const result = await authService.biometricLogin(userId, bioKey);
    return success(res, result, 'Biometrik tasdiqlash muvaffaqiyatli');
  } catch (err) {
    return error(res, err.message, 401);
  }
};

const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      addToken(token);
    }
    return success(res, null, 'Tizimdan muvaffaqiyatli chiqdingiz');
  } catch (err) {
    return error(res, 'Chiqishda xatolik yuz berdi', 500);
  }
};

const changePassword = async (req, res) => {
  try {
    const { oldPass, newPass } = req.body;
    const userId = req.user.id;
    await authService.changePassword(userId, oldPass, newPass);
    return success(res, null, 'Parol muvaffaqiyatli o\'zgartirildi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const me = async (req, res) => {
  try {
    const user = await authService.getMe(req.user.id);
    return success(res, user, 'Profil');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

module.exports = {
  login,
  biometricLogin,
  logout,
  changePassword,
  me,
};
