const reportService = require('./report.service');
const { success, error } = require('../../utils/response');

function thisMonday() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  const pad = (n) => String(n).padStart(2, '0');
  return `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
}

function resolveTargetUserId(req) {
  const raw = req.query.userId;
  if (raw == null || raw === '') {
    return { id: req.user.id };
  }
  const id = Number(raw);
  if (!Number.isFinite(id)) {
    return { error: 'userId noto\'g\'ri', status: 400 };
  }
  const privileged =
    req.user.role === 'admin' || req.user.role === 'prorektor';
  if (id !== req.user.id && !privileged) {
    return { error: 'Sizda bu ma\'lumotni ko\'rish huquqi yo\'q', status: 403 };
  }
  return { id };
}

const getDailyReport = async (req, res) => {
  try {
    const r = resolveTargetUserId(req);
    if (r.error) return error(res, r.error, r.status || 400);
    const date = req.query.date || null;
    const data = await reportService.getDailyReport(r.id, date);
    return success(res, data, 'Kunlik hisobot');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const getWeeklyReport = async (req, res) => {
  try {
    const r = resolveTargetUserId(req);
    if (r.error) return error(res, r.error, r.status || 400);
    let from = req.query.from;
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(String(from))) {
      from = thisMonday();
    }
    const data = await reportService.getWeeklyReport(r.id, from);
    return success(res, data, 'Haftalik hisobot');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const getMonthlyReport = async (req, res) => {
  try {
    const r = resolveTargetUserId(req);
    if (r.error) return error(res, r.error, r.status || 400);
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const data = await reportService.getMonthlyReport(r.id, year, month);
    return success(res, data, 'Oylik hisobot');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const getYearlyReport = async (req, res) => {
  try {
    const r = resolveTargetUserId(req);
    if (r.error) return error(res, r.error, r.status || 400);
    const year = Number(req.query.year);
    const data = await reportService.getYearlyReport(r.id, year);
    return success(res, data, 'Yillik hisobot');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const getBuildingReport = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'prorektor') {
      return error(res, 'Faqat administrator yoki prorektor uchun', 403);
    }
    const buildingId = req.query.buildingId;
    const date = req.query.date || null;
    const data = await reportService.getBuildingReport(buildingId, date);
    return success(res, data, 'Bino hisoboti');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

module.exports = {
  getDailyReport,
  getWeeklyReport,
  getMonthlyReport,
  getYearlyReport,
  getBuildingReport,
};
