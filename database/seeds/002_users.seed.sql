-- ============================================================
-- SEED 002 — Users
-- 3 ta staff, 3 ta student, 1 ta admin
-- Parol: '1234'  →  bcrypt hash (cost=10)
-- ============================================================

-- Avval barcha foydalanuvchilarni tozalaymiz (CASCADE orqali
-- bog'liq jadvallar ham tozalanadi: staff_profiles, work_sessions, ...)
TRUNCATE TABLE users RESTART IDENTITY CASCADE;

INSERT INTO users (
  full_name,
  phone,
  password_hash,
  role,
  is_active
) VALUES

-- ── Staff ──────────────────────────────────────────────────
(
  'Alisher Karimov',
  '+998901111001',
  '$2b$10$BDq76KQIDxCVWqiUEQzjmuGTMt5eDHJ27IruGxBZF9ydl5f7Dgn/u',
  'staff',
  true
),
(
  'Barno Toshmatova',
  '+998901111002',
  '$2b$10$BDq76KQIDxCVWqiUEQzjmuGTMt5eDHJ27IruGxBZF9ydl5f7Dgn/u',
  'staff',
  true
),
(
  'Jasur Xolmatov',
  '+998901111003',
  '$2b$10$BDq76KQIDxCVWqiUEQzjmuGTMt5eDHJ27IruGxBZF9ydl5f7Dgn/u',
  'staff',
  true
),

-- ── Students ───────────────────────────────────────────────
(
  'Dilnoza Yusupova',
  '+998902222001',
  '$2b$10$BDq76KQIDxCVWqiUEQzjmuGTMt5eDHJ27IruGxBZF9ydl5f7Dgn/u',
  'student',
  true
),
(
  'Sardor Nazarov',
  '+998902222002',
  '$2b$10$BDq76KQIDxCVWqiUEQzjmuGTMt5eDHJ27IruGxBZF9ydl5f7Dgn/u',
  'student',
  true
),
(
  'Nilufar Ergasheva',
  '+998902222003',
  '$2b$10$BDq76KQIDxCVWqiUEQzjmuGTMt5eDHJ27IruGxBZF9ydl5f7Dgn/u',
  'student',
  true
),

-- ── Admin ──────────────────────────────────────────────────
(
  'Admin BIU',
  '+998900000001',
  '$2b$10$BDq76KQIDxCVWqiUEQzjmuGTMt5eDHJ27IruGxBZF9ydl5f7Dgn/u',
  'admin',
  true
),

-- ── Prorektor ───────────────────────────────────────────────
(
  'Prorektor BIU',
  '+998900000002',
  '$2b$10$BDq76KQIDxCVWqiUEQzjmuGTMt5eDHJ27IruGxBZF9ydl5f7Dgn/u',
  'prorektor',
  true
);

-- Foydalanuvchi ID tartibini tekshirish:
--   id 1-3  → staff     (Alisher, Barno, Jasur)
--   id 4-6  → student   (Dilnoza, Sardor, Nilufar)
--   id 7    → admin     (Admin BIU)       parol: 1234
--   id 8    → prorektor (Prorektor BIU)   parol: 1234
-- SELECT id, full_name, phone, role FROM users ORDER BY id;
