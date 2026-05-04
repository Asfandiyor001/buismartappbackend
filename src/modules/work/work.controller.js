const workService = require('./work.service');
const geofenceService = require('./geofence.service');
const { success, error } = require('../../utils/response');

function defaultWeekFrom() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  const pad = (n) => String(n).padStart(2, '0');
  return `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
}

const checkIn = async (req, res) => {
  try {
    const userId = req.user.id;
    const { buildingId, lat, lon } = req.body;
    if (buildingId == null || lat == null || lon == null) {
      return error(res, 'buildingId, lat va lon majburiy', 400);
    }
    const bid = Number(buildingId);
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(bid) || !Number.isFinite(la) || !Number.isFinite(lo)) {
      return error(res, 'Noto\'g\'ri koordinata yoki bino identifikatori', 400);
    }
    const result = await workService.checkIn(userId, bid, la, lo);
    return success(res, result, 'Kirish muvaffaqiyatli qayd etildi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const checkOut = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lat, lon } = req.body;
    if (lat == null || lon == null) {
      return error(res, 'lat va lon majburiy', 400);
    }
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) {
      return error(res, 'Noto\'g\'ri koordinata', 400);
    }
    const result = await workService.checkOut(userId, la, lo);
    return success(res, result, 'Chiqish muvaffaqiyatli qayd etildi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const getToday = async (req, res) => {
  try {
    const data = await workService.getToday(req.user.id);
    return success(res, data, 'Bugungi ish jadvali');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getWeek = async (req, res) => {
  try {
    let from = req.query.from;
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(String(from))) {
      from = defaultWeekFrom();
    }
    const data = await workService.getWeek(req.user.id, from);
    return success(res, data, 'Haftalik ish statistikasi');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getMonth = async (req, res) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return error(res, 'year va month (1–12) to\'g\'ri kiriting', 400);
    }
    const data = await workService.getMonth(req.user.id, year, month);
    return success(res, data, 'Oylik ish hisoboti');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getActiveLog = async (req, res) => {
  try {
    const data = await workService.getActiveLog(req.user.id);
    return success(res, data, data ? 'Aktiv ish yozuvi' : 'Aktiv yozuv yo\'q');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const resetSession = async (req, res) => {
  try {
    const data = await workService.resetTodaySession(req.user.id);
    return success(res, data, data.message);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const pingHandler = async (req, res) => {
  try {
    const { lat, lon, accuracy } = req.body;
    if (lat == null || lon == null) {
      return error(res, 'lat va lon majburiy', 400);
    }
    const la = parseFloat(lat);
    const lo = parseFloat(lon);
    if (Number.isNaN(la) || Number.isNaN(lo)) {
      return error(res, 'Noto\'g\'ri koordinatalar', 400);
    }

    let acc = null;
    if (accuracy != null && accuracy !== '') {
      const a = parseFloat(accuracy);
      if (Number.isFinite(a)) acc = a;
    }

    const result = await geofenceService.processPing(req.user.id, la, lo, acc);
    return success(res, result, 'GPS ping qabul qilindi');
  } catch (err) {
    return error(res, err.message || 'Server xatosi', 500);
  }
};

const syncOffline = async (req, res) => {
  try {
    const { events } = req.body;
    if (!Array.isArray(events) || events.length === 0) {
      return error(res, 'events massivi bo\'sh yoki noto\'g\'ri', 400);
    }

    const userId = req.user.id;

    // Sort chronologically before processing
    const sorted = [...events].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );

    const results = [];

    for (const evt of sorted) {
      const ts = new Date(evt.timestamp);
      if (Number.isNaN(ts.getTime())) {
        results.push({ type: evt.type, skipped: true, reason: 'invalid_timestamp' });
        continue;
      }

      if (evt.type === 'ping') {
        const la = parseFloat(evt.lat);
        const lo = parseFloat(evt.lon);
        if (!Number.isFinite(la) || !Number.isFinite(lo)) {
          results.push({ type: 'ping', skipped: true, reason: 'invalid_coords' });
          continue;
        }
        const acc = Number.isFinite(parseFloat(evt.accuracy)) ? parseFloat(evt.accuracy) : null;
        try {
          const result = await geofenceService.processPingAt(userId, la, lo, acc, ts);
          results.push({ type: 'ping', timestamp: evt.timestamp, result });
        } catch (err) {
          results.push({ type: 'ping', timestamp: evt.timestamp, error: err.message });
        }

      } else if (evt.type === 'gps_off') {
        try {
          const result = await geofenceService.autoCheckoutAt(userId, ts);
          results.push({ type: 'gps_off', timestamp: evt.timestamp, result });
        } catch (err) {
          results.push({ type: 'gps_off', timestamp: evt.timestamp, error: err.message });
        }
      } else {
        results.push({ type: evt.type, skipped: true, reason: 'unknown_type' });
      }
    }

    return success(res, { processed: results.length, results }, 'Offline hodisalar qayta ishlandi');
  } catch (err) {
    return error(res, err.message || 'Server xatosi', 500);
  }
};

module.exports = {
  checkIn,
  checkOut,
  getToday,
  getWeek,
  getMonth,
  getActiveLog,
  resetSession,
  pingHandler,
  syncOffline,
};
