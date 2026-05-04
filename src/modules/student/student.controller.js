const studentService = require('./student.service');
const { success, error } = require('../../utils/response');

const getProfile = async (req, res) => {
  try {
    const data = await studentService.getProfile(req.user.id);
    return success(res, data, 'Talaba profili');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

const getSchedule = async (req, res) => {
  try {
    const week = req.query.week != null ? Number(req.query.week) : 0;
    const data = await studentService.getSchedule(req.user.id, week);
    return success(res, data, 'Dars jadvali');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const getTodaySchedule = async (req, res) => {
  try {
    const data = await studentService.getTodaySchedule(req.user.id);
    return success(res, data, 'Bugungi darslar');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const qrCheckIn = async (req, res) => {
  try {
    const { token, lat, lon } = req.body || {};
    if (token == null || lat == null || lon == null) {
      return error(res, 'token, lat va lon majburiy', 400);
    }
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) {
      return error(res, 'Noto\'g\'ri koordinata', 400);
    }
    const data = await studentService.qrCheckIn(req.user.id, String(token), la, lo);
    return success(res, data, 'Davomat qayd etildi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const getMyAttendance = async (req, res) => {
  try {
    const { subject, semester } = req.query;
    const data = await studentService.getMyAttendance(
      req.user.id,
      subject || null,
      semester || null
    );
    return success(res, data, 'Davomat tarixi');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getAttendanceSummary = async (req, res) => {
  try {
    const data = await studentService.getAttendanceSummary(req.user.id);
    return success(res, data, 'Davomat xulosasi');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getGrades = async (req, res) => {
  try {
    const semester = req.query.semester != null ? req.query.semester : null;
    const data = await studentService.getGrades(req.user.id, semester);
    return success(res, data, 'Baholar');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getAssignments = async (req, res) => {
  try {
    const data = await studentService.getAssignments(req.user.id);
    return success(res, data, 'Topshiriqlar');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const submitAssignment = async (req, res) => {
  try {
    const assignmentId = Number(req.params.id);
    if (!Number.isFinite(assignmentId)) {
      return error(res, 'Noto\'g\'ri topshiriq identifikatori', 400);
    }
    const data = await studentService.submitAssignment(
      req.user.id,
      assignmentId,
      req.body || {}
    );
    return success(res, data, 'Topshiriq yuborildi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

module.exports = {
  getProfile,
  getSchedule,
  getTodaySchedule,
  qrCheckIn,
  getMyAttendance,
  getAttendanceSummary,
  getGrades,
  getAssignments,
  submitAssignment,
};
