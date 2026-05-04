const pool = require('../../config/database');
const { todayStr } = require('../../utils/time');

const ALLOWED_PROFILE_FIELDS = [
  'address',
  'district',
  'region',
  'emergency_name',
  'emergency_phone',
  'emergency_relation',
  'notes',
];

const DOCUMENT_TYPES = [
  'passport',
  'diplom',
  'mehnat_daftarcha',
  'shartnoma',
  'sertifikat',
  'boshqa',
];

const VACATION_TYPES = [
  'yillik',
  'kasallik',
  'homiladorlik',
  'bola_parvarish',
  'nikoh',
  'aza',
  'boshqa',
];

function workdaysInMonth(year, month) {
  let count = 0;
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) count += 1;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function mondayStrThisWeek(ref = new Date()) {
  const day = ref.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(ref);
  mon.setDate(ref.getDate() + diff);
  return todayStr(mon);
}

function addDaysYmd(ymd, days) {
  const [y, mo, da] = ymd.split('-').map(Number);
  const d = new Date(y, mo - 1, da);
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseYmd(s) {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const d = new Date(y, mo - 1, da);
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;
  return { y, mo, da, str: `${m[1]}-${m[2]}-${m[3]}` };
}

async function getProfile(userId) {
  const res = await pool.query(
    `SELECT
       u.id, u.full_name, u.phone, u.role, u.avatar_url,
       u.is_active, u.last_login, u.created_at,
       sp.employee_id, sp.department, sp.position, sp.rank,
       sp.hire_date, sp.contract_type, sp.contract_start, sp.contract_end,
       sp.salary, sp.work_start, sp.work_end, sp.work_hours_day,
       sp.birth_date, sp.gender, sp.passport_series, sp.inn,
       sp.address, sp.district, sp.region, sp.nationality,
       sp.emergency_name, sp.emergency_phone, sp.emergency_relation,
       sp.education_level, sp.university, sp.speciality, sp.graduation_year, sp.degree,
       sp.notes
     FROM users u
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1 AND u.role IN ('staff', 'admin')`,
    [userId]
  );
  const row = res.rows[0];
  if (!row) {
    throw new Error('Xodim topilmadi');
  }
  return row;
}

async function updateProfile(userId, data) {
  const profileCheck = await pool.query(
    `SELECT u.id FROM users u
     WHERE u.id = $1 AND u.role = 'staff'`,
    [userId]
  );
  if (profileCheck.rows.length === 0) {
    throw new Error('Faqat xodimlar profilini yangilashi mumkin');
  }

  const updates = [];
  const values = [];
  let i = 1;
  for (const key of ALLOWED_PROFILE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      updates.push(`${key} = $${i}`);
      values.push(data[key]);
      i += 1;
    }
  }
  if (updates.length === 0) {
    throw new Error('Yangilanadigan maydonlar kiritilmadi');
  }
  values.push(userId);
  const result = await pool.query(
    `UPDATE staff_profiles SET ${updates.join(', ')}, updated_at = NOW()
     WHERE user_id = $${i}
     RETURNING id`,
    values
  );
  if (result.rowCount === 0) {
    throw new Error('Xodim profili topilmadi');
  }
  return getProfile(userId);
}

async function getDocuments(userId) {
  const res = await pool.query(
    `SELECT * FROM staff_documents
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return res.rows;
}

async function addDocument(userId, data) {
  const {
    type,
    title,
    file_url,
    file_size,
    issued_by,
    issued_date,
    expiry_date,
    notes,
  } = data || {};
  if (!type || !DOCUMENT_TYPES.includes(String(type))) {
    throw new Error('Hujjat turi noto\'g\'ri yoki kiritilmagan');
  }
  if (!title || !file_url) {
    throw new Error('title va file_url majburiy');
  }
  const res = await pool.query(
    `INSERT INTO staff_documents (
       user_id, type, title, file_url, file_size,
       issued_by, issued_date, expiry_date, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      userId,
      type,
      title,
      file_url,
      file_size != null ? Number(file_size) : null,
      issued_by || null,
      issued_date || null,
      expiry_date || null,
      notes || null,
    ]
  );
  return res.rows[0];
}

async function getVacations(userId) {
  const res = await pool.query(
    `SELECT sv.*,
            u.full_name AS approved_by_name
     FROM staff_vacations sv
     LEFT JOIN users u ON u.id = sv.approved_by
     WHERE sv.user_id = $1
     ORDER BY sv.created_at DESC`,
    [userId]
  );
  return res.rows;
}

function vacationDaysInclusive(startStr, endStr) {
  const a = parseYmd(startStr);
  const b = parseYmd(endStr);
  if (!a || !b) return null;
  const t1 = new Date(a.y, a.mo - 1, a.da).getTime();
  const t2 = new Date(b.y, b.mo - 1, b.da).getTime();
  return Math.floor((t2 - t1) / (86400 * 1000)) + 1;
}

async function requestVacation(userId, data) {
  const { type, start_date, end_date, reason } = data || {};
  if (!type || !VACATION_TYPES.includes(String(type))) {
    throw new Error('Ta\'til turi noto\'g\'ri yoki kiritilmagan');
  }
  if (!start_date || !end_date) {
    throw new Error('start_date va end_date majburiy');
  }
  const sd = parseYmd(start_date);
  const ed = parseYmd(end_date);
  if (!sd || !ed) {
    throw new Error('Sana formati YYYY-MM-DD bo\'lishi kerak');
  }
  if (sd.str >= ed.str) {
    throw new Error('Boshlanish sanasi tugash sanasidan oldin bo\'lishi kerak');
  }
  const today = todayStr();
  if (sd.str < today) {
    throw new Error('O\'tgan kunlar uchun ta\'til so\'ralmaydi');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const overlap = await client.query(
      `SELECT id FROM staff_vacations
       WHERE user_id = $1
         AND status <> 'rejected'
         AND NOT (end_date < $2::date OR start_date > $3::date)`,
      [userId, sd.str, ed.str]
    );
    if (overlap.rows.length > 0) {
      throw new Error('Bu sanalarda ta\'lingiz allaqachon mavjud');
    }

    const ins = await client.query(
      `INSERT INTO staff_vacations (user_id, type, start_date, end_date, reason, status)
       VALUES ($1, $2, $3::date, $4::date, $5, 'pending')
       RETURNING *`,
      [userId, type, sd.str, ed.str, reason || null]
    );
    const vacation = ins.rows[0];
    const days =
      vacation.days_count != null
        ? Number(vacation.days_count)
        : vacationDaysInclusive(sd.str, ed.str);

    await client.query(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES ($1, 'tizim', $2, $3)`,
      [
        userId,
        'Ta\'til so\'rovi yuborildi',
        `${type} ta'til: ${sd.str} — ${ed.str} (${days} kun)`,
      ]
    );

    await client.query('COMMIT');
    return vacation;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getRewards(userId) {
  const res = await pool.query(
    `SELECT sr.*,
            u.full_name AS issued_by_name
     FROM staff_rewards sr
     LEFT JOIN users u ON u.id = sr.issued_by
     WHERE sr.user_id = $1
     ORDER BY sr.reward_date DESC, sr.created_at DESC`,
    [userId]
  );
  const rewards = res.rows;
  let totalRewards = 0;
  let totalFines = 0;
  let totalBonus = 0;
  for (const r of rewards) {
    const amt = Number(r.amount) || 0;
    if (r.type === 'mukofot') totalRewards += amt;
    if (r.type === 'jarima') totalFines += amt;
    if (r.type === 'bonus') totalBonus += amt;
  }
  return {
    rewards,
    summary: {
      totalRewards,
      totalFines,
      totalBonus,
    },
  };
}

async function getWorkStats(userId) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  const monthRes = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('done', 'active'))::int AS present_days,
       COUNT(*) FILTER (WHERE status = 'absent')::int AS absent_days,
       COALESCE(SUM(total_seconds), 0)::bigint AS total_seconds,
       COALESCE(SUM(overtime_seconds), 0)::bigint AS overtime_seconds,
       AVG(total_seconds)::float AS avg_seconds_per_day
     FROM work_sessions
     WHERE user_id = $1
       AND EXTRACT(MONTH FROM work_date) = $2
       AND EXTRACT(YEAR FROM work_date) = $3`,
    [userId, m, y]
  );
  const mr = monthRes.rows[0];
  const presentDays = Number(mr.present_days) || 0;
  const absentDays = Number(mr.absent_days) || 0;
  const totalSeconds = Number(mr.total_seconds) || 0;
  const overtimeSeconds = Number(mr.overtime_seconds) || 0;
  const avgSeconds =
    mr.avg_seconds_per_day != null ? Number(mr.avg_seconds_per_day) : 0;

  const workdays = workdaysInMonth(y, m);
  const attendancePct =
    workdays > 0 ? Math.round((presentDays / workdays) * 10000) / 100 : 0;

  const monday = mondayStrThisWeek(now);
  const weekEndExclusive = addDaysYmd(monday, 7);
  const weekRes = await pool.query(
    `SELECT work_date, total_seconds, status,
            first_entry_time, last_exit_time,
            buildings_visited
     FROM work_sessions
     WHERE user_id = $1
       AND work_date >= $2::date
       AND work_date < $3::date
     ORDER BY work_date ASC`,
    [userId, monday, weekEndExclusive]
  );

  const byDate = new Map();
  for (const r of weekRes.rows) {
    const key =
      r.work_date instanceof Date
        ? todayStr(r.work_date)
        : String(r.work_date).slice(0, 10);
    byDate.set(key, r);
  }
  const week = [];
  for (let i = 0; i < 7; i += 1) {
    const key = addDaysYmd(monday, i);
    week.push(byDate.has(key) ? byDate.get(key) : null);
  }

  return {
    month: {
      presentDays,
      absentDays,
      totalHours: Math.round((totalSeconds / 3600) * 100) / 100,
      overtimeHours: Math.round((overtimeSeconds / 3600) * 100) / 100,
      avgHoursPerDay: Math.round((avgSeconds / 3600) * 100) / 100,
      attendancePct,
    },
    week,
  };
}

module.exports = {
  getProfile,
  updateProfile,
  getDocuments,
  addDocument,
  getVacations,
  requestVacation,
  getRewards,
  getWorkStats,
};
