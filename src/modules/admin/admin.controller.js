const adminService = require('./admin.service');
const { success, error } = require('../../utils/response');

const ALLOWED_NOTIFY_TYPES = new Set([
  'davomat',
  'topshiriq',
  'jadval',
  'baho',
  'ogohlantirish',
  'tizim',
]);

const getStudentsList = async (req, res) => {
  try {
    const filters = {
      search: req.query.search || null,
      group_name: req.query.group_name || req.query.group || null,
      year: req.query.year != null && req.query.year !== '' ? req.query.year : null,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    };
    const data = await adminService.getStudentsForAdmin(filters);
    return success(res, data, 'Talabalar ro\'yxati');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getStudentAdmin = async (req, res) => {
  try {
    const data = await adminService.getStudentAdminDetail(req.params.id);
    return success(res, data, 'Talaba kartochkasi');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

const getAllStaff = async (req, res) => {
  try {
    const filters = {
      department: req.query.department || null,
      position: req.query.position || null,
      isActive:
        req.query.isActive === 'true'
          ? true
          : req.query.isActive === 'false'
            ? false
            : null,
      search: req.query.search || null,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    };
    const data = await adminService.getAllStaff(filters);
    return success(res, data, 'Xodimlar ro\'yxati');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getActiveNow = async (req, res) => {
  try {
    const data = await adminService.getActiveNow();
    return success(res, data, 'Hozir binodagilar');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getStaffDetail = async (req, res) => {
  try {
    const data = await adminService.getStaffDetail(req.params.id);
    return success(res, data, 'Xodim kartochkasi');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

const updateStaffStatus = async (req, res) => {
  try {
    const { isActive } = req.body || {};
    if (typeof isActive !== 'boolean') {
      return error(res, 'isActive (boolean) majburiy', 400);
    }
    const data = await adminService.updateStaffStatus(
      req.params.id,
      isActive,
      req.user.id
    );
    return success(res, data, 'Holat yangilandi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const generateQR = async (req, res) => {
  try {
    const { scheduleId } = req.body || {};
    const data = await adminService.generateQR(scheduleId, req.user.id);
    return success(res, data, 'QR yaratildi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const getOverview = async (req, res) => {
  try {
    const data = await adminService.getOverview();
    return success(res, data, 'Umumiy ko\'rinish');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const sendBroadcastNotification = async (req, res) => {
  try {
    const { userIds, type, title, body } = req.body || {};
    if (!title || !body) {
      return error(res, 'title va body majburiy', 400);
    }
    if (!type || !ALLOWED_NOTIFY_TYPES.has(String(type))) {
      return error(res, 'type noto\'g\'ri yoki majburiy emas', 400);
    }
    const data = await adminService.sendBroadcastNotification(
      req.user.id,
      userIds,
      type,
      title,
      body
    );
    return success(res, data, 'Xabarlar yuborildi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const getStaffDocuments = async (req, res) => {
  try {
    const data = await adminService.getStaffDocuments(req.params.id);
    return success(res, data, 'Xodim hujjatlari');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

const getStaffVacations = async (req, res) => {
  try {
    const data = await adminService.getStaffVacations(req.params.id);
    return success(res, data, "Xodim ta'tillari");
  } catch (err) {
    return error(res, err.message, 404);
  }
};

const getStaffRewards = async (req, res) => {
  try {
    const data = await adminService.getStaffRewards(req.params.id);
    return success(res, data, 'Xodim mukofotlari');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

const getStaffWorkLogs = async (req, res) => {
  try {
    const data = await adminService.getStaffWorkLogs(req.params.id, req.query.date || null);
    return success(res, data, 'Ish jurnali');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

const getAbsentToday = async (req, res) => {
  try {
    const data = await adminService.getAbsentToday();
    return success(res, data, 'Bugun kelmagan xodimlar');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

module.exports = {
  getAllStaff,
  getActiveNow,
  getStaffDetail,
  updateStaffStatus,
  generateQR,
  getOverview,
  getStudentsList,
  getStudentAdmin,
  sendBroadcastNotification,
  getStaffDocuments,
  getStaffVacations,
  getStaffRewards,
  getStaffWorkLogs,
  getAbsentToday,
};
