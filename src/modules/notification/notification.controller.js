const notificationService = require('./notification.service');
const { success, error } = require('../../utils/response');

const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (userId == null || !Number.isFinite(Number(userId))) {
      return error(res, 'Foydalanuvchi aniqlanmadi', 401);
    }
    const limit = req.query.limit;
    const offset = req.query.offset;
    const data = await notificationService.getMyNotifications(
      Number(userId),
      limit,
      offset
    );
    return success(res, data, 'Xabarlar');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const markAsRead = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (userId == null || !Number.isFinite(Number(userId))) {
      return error(res, 'Foydalanuvchi aniqlanmadi', 401);
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return error(res, 'Noto\'g\'ri identifikator', 400);
    }
    const row = await notificationService.markAsRead(Number(userId), id);
    return success(res, row, 'O\'qilgan deb belgilandi');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

const markAllRead = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (userId == null || !Number.isFinite(Number(userId))) {
      return error(res, 'Foydalanuvchi aniqlanmadi', 401);
    }
    const data = await notificationService.markAllRead(Number(userId));
    return success(res, data, 'Barchasi o\'qilgan');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const deleteNotification = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (userId == null || !Number.isFinite(Number(userId))) {
      return error(res, 'Foydalanuvchi aniqlanmadi', 401);
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return error(res, 'Noto\'g\'ri identifikator', 400);
    }
    const data = await notificationService.deleteNotification(Number(userId), id);
    return success(res, data, 'O\'chirildi');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

const savePushToken = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (userId == null || !Number.isFinite(Number(userId))) {
      return error(res, 'Foydalanuvchi aniqlanmadi', 401);
    }
    const { push_token: pushToken } = req.body || {};
    if (!pushToken) {
      return error(res, 'push_token majburiy', 400);
    }
    const data = await notificationService.savePushToken(Number(userId), pushToken);
    return success(res, data, 'Push token saqlandi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

module.exports = {
  getMyNotifications,
  markAsRead,
  markAllRead,
  deleteNotification,
  savePushToken,
};
