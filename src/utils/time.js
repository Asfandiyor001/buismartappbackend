const pad2 = (n) => String(n).padStart(2, '0');

/** Joriy vaqt "HH:MM" */
function nowStr(date = new Date()) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Joriy sana "YYYY-MM-DD" */
function todayStr(date = new Date()) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

/**
 * Ikki vaqt qatori orasidagi farq (sekund).
 * timeStr "HH:MM" yoki "HH:MM:SS" bo'lishi mumkin.
 */
function parseTimeParts(str) {
  const parts = String(str).trim().split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  return h * 3600 + m * 60 + s;
}

function secondsBetween(timeStrA, timeStrB) {
  return Math.abs(parseTimeParts(timeStrB) - parseTimeParts(timeStrA));
}

/**
 * Sekundlarni o'zbekcha qisqa formatda: "X soat Y daqiqa".
 */
function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const parts = [];
  if (h > 0) parts.push(`${h} soat`);
  if (m > 0) parts.push(`${m} daqiqa`);
  if (parts.length === 0) parts.push('0 daqiqa');
  return parts.join(' ');
}

module.exports = {
  nowStr,
  todayStr,
  secondsBetween,
  formatDuration,
};
