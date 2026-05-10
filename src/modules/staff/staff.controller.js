const staffService = require('./staff.service');
const reportService = require('../report/report.service');
const { success, error } = require('../../utils/response');

const getProfile = async (req, res) => {
  try {
    const data = await staffService.getProfile(req.user.id);
    return success(res, data, 'Xodim profili');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

const updateProfile = async (req, res) => {
  try {
    const data = await staffService.updateProfile(req.user.id, req.body);
    return success(res, data, 'Profil yangilandi');
  } catch (err) {
    let status = 400;
    if (err.message.includes('Xodim profili topilmadi')) status = 404;
    if (err.message.includes('Faqat xodimlar')) status = 403;
    return error(res, err.message, status);
  }
};

const getDocuments = async (req, res) => {
  try {
    const data = await staffService.getDocuments(req.user.id);
    return success(res, data, 'Hujjatlar ro\'yxati');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const addDocument = async (req, res) => {
  try {
    const data = await staffService.addDocument(req.user.id, req.body);
    return success(res, data, 'Hujjat qo\'shildi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const getVacations = async (req, res) => {
  try {
    const data = await staffService.getVacations(req.user.id);
    return success(res, data, 'Ta\'tillar');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const requestVacation = async (req, res) => {
  try {
    const data = await staffService.requestVacation(req.user.id, req.body);
    return success(res, data, 'Ta\'til so\'rovi qabul qilindi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const getRewards = async (req, res) => {
  try {
    const data = await staffService.getRewards(req.user.id);
    return success(res, data, 'Mukofotlar va jarimalar');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getWorkStats = async (req, res) => {
  try {
    const data = await staffService.getWorkStats(req.user.id);
    return success(res, data, 'Ish statistikasi');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/** Oxirgi oylik hisobot (monthly_reports). */
const getMyReport = async (req, res) => {
  try {
    const report = await reportService.getLatestMonthlyReportForUser(req.user.id);
    return success(res, report, 'Oylik hisobot');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * GET /api/staff/team-status — Jamoa holati (admin: barcha xodimlar; staff: ostona).
 */
const getTeamStatus = async (req, res) => {
  try {
    const result = await staffService.getTeamStatus(req.user.id, req.user.role);
    return success(res, result, 'Jamoa holati');
  } catch (e) {
    console.error('[team-status] error:', e.message);
    return error(res, 'Jamoa holati yuklanmadi', 500);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getDocuments,
  addDocument,
  getVacations,
  requestVacation,
  getRewards,
  getWorkStats,
  getMyReport,
  getTeamStatus,
};
