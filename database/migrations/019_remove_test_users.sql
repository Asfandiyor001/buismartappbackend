-- ============================================================
-- MIGRATION 019 — Eski test foydalanuvchilarni tozalash
-- ID 1-15 bo'lgan test userlar va ularning barcha ma'lumotlari
-- ============================================================
BEGIN;

-- 1. staff_profiles dan eski test userlarni o'chirish
DELETE FROM staff_profiles
WHERE user_id IN (
  SELECT id FROM users
  WHERE id <= 15
    AND phone NOT LIKE '+99890100%'
);

-- 2. work_sessions va work_logs (CASCADE bor, lekin aniq o'chirish)
DELETE FROM work_sessions WHERE user_id IN (
  SELECT id FROM users WHERE id <= 15 AND phone NOT LIKE '+99890100%'
);
DELETE FROM work_logs WHERE user_id IN (
  SELECT id FROM users WHERE id <= 15 AND phone NOT LIKE '+99890100%'
);

-- 3. Users jadvalidan o'chirish (CASCADE bor — bog'liq hamma narsa ketadi)
DELETE FROM users
WHERE id <= 15
  AND phone NOT LIKE '+99890100%';

COMMIT;
