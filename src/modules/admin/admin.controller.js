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
      role: req.query.role || null,
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
    const staffId = Number(req.params.id);
    const isAdmin = ['admin', 'prorektor'].includes(req.user.role);
    if (!isAdmin && staffId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Ruxsat yo\'q' });
    }
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
    const staffId = Number(req.params.id);
    const isAdmin = ['admin', 'prorektor'].includes(req.user.role);
    if (!isAdmin && staffId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Ruxsat yo\'q' });
    }
    const data = await adminService.getStaffDocuments(req.params.id);
    return success(res, data, 'Xodim hujjatlari');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

const getStaffVacations = async (req, res) => {
  try {
    const staffId = Number(req.params.id);
    const isAdmin = ['admin', 'prorektor'].includes(req.user.role);
    if (!isAdmin && staffId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Ruxsat yo\'q' });
    }
    const data = await adminService.getStaffVacations(req.params.id);
    return success(res, data, "Xodim ta'tillari");
  } catch (err) {
    return error(res, err.message, 404);
  }
};

const getStaffRewards = async (req, res) => {
  try {
    const staffId = Number(req.params.id);
    const isAdmin = ['admin', 'prorektor'].includes(req.user.role);
    if (!isAdmin && staffId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Ruxsat yo\'q' });
    }
    const data = await adminService.getStaffRewards(req.params.id);
    return success(res, data, 'Xodim mukofotlari');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

const getStaffWorkLogs = async (req, res) => {
  try {
    const staffId = Number(req.params.id);
    const isAdmin = ['admin', 'prorektor'].includes(req.user.role);
    if (!isAdmin && staffId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Ruxsat yo\'q' });
    }
    const data = await adminService.getStaffWorkLogs(
      req.params.id,
      req.query.date  || null,
      req.query.from  || null,
      req.query.to    || null,
    );
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

const getStaffToday = async (req, res) => {
  try {
    const data = await adminService.getStaffTodayData();
    return success(res, data, 'Bugungi xodimlar holati');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// ── Binolar ─────────────────────────────────────────────

const listBuildings = async (req, res) => {
  try {
    const data = await adminService.listBuildings();
    return success(res, data, 'Binolar ro\'yxati');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const createBuilding = async (req, res) => {
  try {
    const data = await adminService.createBuilding(req.body);
    return success(res, data, 'Bino yaratildi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const updateBuilding = async (req, res) => {
  try {
    const data = await adminService.updateBuilding(req.params.id, req.body);
    return success(res, data, 'Bino yangilandi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const deleteBuilding = async (req, res) => {
  try {
    await adminService.deleteBuilding(req.params.id);
    return success(res, null, 'Bino o\'chirildi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

// ── Foydalanuvchilar ─────────────────────────────────────

const getAllUsers = async (req, res) => {
  try {
    const filters = {
      role: req.query.role || null,
      search: req.query.search || null,
      isActive:
        req.query.isActive === 'true'
          ? true
          : req.query.isActive === 'false'
            ? false
            : null,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    };
    const data = await adminService.getAllUsers(filters);
    return success(res, data, 'Foydalanuvchilar ro\'yxati');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const createUser = async (req, res) => {
  try {
    const data = await adminService.createUser(req.body);
    return success(res, data, 'Foydalanuvchi yaratildi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const updateUser = async (req, res) => {
  try {
    const data = await adminService.updateUser(req.params.id, req.body);
    return success(res, data, 'Foydalanuvchi yangilandi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const deleteUser = async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) {
      return error(res, 'O\'zingizni o\'chira olmaysiz', 400);
    }
    await adminService.deleteUser(req.params.id);
    return success(res, null, 'Foydalanuvchi o\'chirildi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const updateVacationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'approved' | 'rejected'
    if (!['approved', 'rejected'].includes(status)) {
      return error(res, "Status 'approved' yoki 'rejected' bo'lishi kerak", 400);
    }
    const result = await adminService.updateVacationStatus(id, status, req.user.id);
    return success(res, result, "Ta'til holati yangilandi");
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getPendingVacations = async (req, res) => {
  try {
    const data = await adminService.getPendingVacations(Number(req.query.limit) || 8);
    return success(res, data, "Kutilayotgan ta'til arizalari");
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const { newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 4) {
      return error(res, 'newPassword kamida 4 belgidan iborat bo\'lishi kerak', 400);
    }
    await adminService.resetUserPassword(req.params.id, newPassword);
    return success(res, null, 'Parol tiklandi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const getDepartments = async (req, res) => {
  try {
    const data = await adminService.getDepartments();
    return success(res, data, "Bo'limlar ro'yxati");
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getDepartmentStaff = async (req, res) => {
  try {
    const dept = decodeURIComponent(req.params.dept);
    const data = await adminService.getDepartmentStaff(dept);
    return success(res, data, "Bo'lim xodimlari");
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getStaffHistory = async (req, res) => {
  try {
    const staffId = Number(req.params.id);
    const isAdmin = ['admin', 'prorektor'].includes(req.user.role);
    if (!isAdmin && staffId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Ruxsat yo\'q' });
    }
    const days = Number(req.query.days) || 30;
    const data = await adminService.getStaffHistory(req.params.id, days);
    return success(res, data, 'Davomat tarixi');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

const getAdminMonthlyReport = async (req, res) => {
  try {
    const y    = Number(req.query.year)  || new Date().getFullYear();
    const m    = Number(req.query.month) || new Date().getMonth() + 1;
    const dept = req.query.department || null;
    const data = await adminService.getAdminMonthlyReport(y, m, dept);
    return success(res, data, 'Oylik hisobot');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getAdminWeeklyReport = async (req, res) => {
  try {
    let from = req.query.from;
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(String(from))) {
      const now = new Date();
      const day = now.getDay();
      now.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
      const p = n => String(n).padStart(2, '0');
      from = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
    }
    const data = await adminService.getAdminWeeklyReport(from);
    return success(res, data, 'Haftalik hisobot');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getAdminYearlyReport = async (req, res) => {
  try {
    const y    = Number(req.query.year) || new Date().getFullYear();
    const data = await adminService.getAdminYearlyReport(y);
    return success(res, data, 'Yillik hisobot');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const forceCloseToday = async (req, res) => {
  try {
    const { autoCloseAllSessions } = require('../../jobs/autoClose.job');
    const data = await autoCloseAllSessions();
    return success(res, data, 'Bugungi sessiyalar majburiy yopildi');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getStaffLocations = async (req, res) => {
  try {
    const data = await adminService.getStaffLocations();
    return success(res, data, 'Xodimlar joylashuvi');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getBuildingGpsPings = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const data = await adminService.getBuildingGpsPings(limit);
    return success(res, data, 'GPS ping jurnali');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getBuildingDailyStats = async (req, res) => {
  try {
    const data = await adminService.getBuildingDailyStats();
    return success(res, data, 'Bino kunlik statistika');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

module.exports = {
  forceCloseToday,
  getStaffLocations,
  getBuildingGpsPings,
  getBuildingDailyStats,
  getPendingVacations,
  updateVacationStatus,
  getStaffToday,
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
  listBuildings,
  createBuilding,
  updateBuilding,
  deleteBuilding,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  getDepartments,
  getDepartmentStaff,
  getStaffHistory,
  getAdminMonthlyReport,
  getAdminWeeklyReport,
  getAdminYearlyReport,
};
