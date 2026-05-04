-- ============================================================
-- SEED 004 — Schedules
-- IT-22-1 guruhi uchun haftalik dars jadvali (2024-spring)
-- 5 ta fan: Matematika, Fizika, Ingliz tili,
--           Algoritmlar, Veb dasturlash
-- Dushanba-Juma, har kuni 2-3 dars
-- O'qituvchilar: user_id 1 (Alisher), 2 (Barno), 3 (Jasur)
-- Binolar: building_id 1 (Bino 1), 2 (Bino 2), 3 (Bino 3)
-- day_of_week: 1=Dushanba, 2=Seshanba, 3=Chorshanba,
--              4=Payshanba, 5=Juma
-- ============================================================

INSERT INTO schedules (
  subject,
  teacher_id,
  group_name,
  room,
  building_id,
  day_of_week,
  start_time,
  end_time,
  color,
  semester,
  week_type,
  is_active
) VALUES

-- ════════════════════════════════════════
-- Dushanba (1) — 3 dars
-- ════════════════════════════════════════
(
  'Matematika',
  1,          -- Alisher Karimov
  'IT-22-1',
  '101',
  1,          -- Bino 1 — Asosiy bino
  1,
  '08:30', '10:00',
  '#E53935',  -- qizil
  '2024-spring', 'all', true
),
(
  'Fizika',
  3,          -- Jasur Xolmatov
  'IT-22-1',
  '201',
  2,          -- Bino 2 — Laboratoriya
  1,
  '10:15', '11:45',
  '#1E88E5',  -- ko''k
  '2024-spring', 'all', true
),
(
  'Algoritmlar',
  1,          -- Alisher Karimov
  'IT-22-1',
  '301',
  1,          -- Bino 1
  1,
  '12:30', '14:00',
  '#43A047',  -- yashil
  '2024-spring', 'all', true
),

-- ════════════════════════════════════════
-- Seshanba (2) — 2 dars
-- ════════════════════════════════════════
(
  'Ingliz tili',
  2,          -- Barno Toshmatova
  'IT-22-1',
  '105',
  1,          -- Bino 1
  2,
  '08:30', '10:00',
  '#FB8C00',  -- to''q sariq
  '2024-spring', 'all', true
),
(
  'Veb dasturlash',
  2,          -- Barno Toshmatova
  'IT-22-1',
  '302',
  1,          -- Bino 1
  2,
  '10:15', '11:45',
  '#8E24AA',  -- binafsha
  '2024-spring', 'all', true
),

-- ════════════════════════════════════════
-- Chorshanba (3) — 3 dars
-- ════════════════════════════════════════
(
  'Matematika',
  1,
  'IT-22-1',
  '101',
  1,
  3,
  '08:30', '10:00',
  '#E53935',
  '2024-spring', 'all', true
),
(
  'Algoritmlar',
  1,
  'IT-22-1',
  '301',
  1,
  3,
  '10:15', '11:45',
  '#43A047',
  '2024-spring', 'all', true
),
(
  'Fizika',
  3,
  'IT-22-1',
  'Lab-1',
  2,          -- Bino 2 — Laboratoriya
  3,
  '12:30', '14:00',
  '#1E88E5',
  '2024-spring', 'all', true
),

-- ════════════════════════════════════════
-- Payshanba (4) — 2 dars
-- ════════════════════════════════════════
(
  'Ingliz tili',
  2,
  'IT-22-1',
  '105',
  1,
  4,
  '08:30', '10:00',
  '#FB8C00',
  '2024-spring', 'all', true
),
(
  'Veb dasturlash',
  2,
  'IT-22-1',
  '302',
  1,
  4,
  '10:15', '11:45',
  '#8E24AA',
  '2024-spring', 'all', true
),

-- ════════════════════════════════════════
-- Juma (5) — 2 dars
-- ════════════════════════════════════════
(
  'Matematika',
  1,
  'IT-22-1',
  '101',
  1,
  5,
  '08:30', '10:00',
  '#E53935',
  '2024-spring', 'all', true
),
(
  'Algoritmlar',
  1,
  'IT-22-1',
  '301',
  1,
  5,
  '10:15', '11:45',
  '#43A047',
  '2024-spring', 'all', true
);

-- Jami: 12 ta dars yozuvi
-- Tekshirish:
-- SELECT day_of_week, start_time, end_time, subject, room
-- FROM schedules WHERE group_name = 'IT-22-1'
-- ORDER BY day_of_week, start_time;
