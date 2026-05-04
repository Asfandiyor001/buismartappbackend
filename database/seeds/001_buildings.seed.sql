-- ============================================================
-- SEED 001 — Buildings
-- BIU Smart App test ma'lumotlari
-- ============================================================

-- Avval mavjud binolarni tozalaymiz
TRUNCATE TABLE buildings RESTART IDENTITY CASCADE;

INSERT INTO buildings (
  name,
  short_name,
  description,
  latitude,
  longitude,
  radius_m,
  floor_count,
  room_count,
  address,
  is_active
) VALUES
(
  'Bino 1 — Asosiy bino',
  'Bino 1',
  'Asosiy ta''lim korpusi, ma''ruza zallari va fakultetlar joylashgan bino.',
  39.7747,
  64.4286,
  100,
  4,
  65,
  'Buxoro shahri, Islom Karimov ko''chasi, 1-uy',
  true
),
(
  'Bino 2 — Laboratoriya',
  'Bino 2',
  'Ilmiy-tadqiqot markazi, fizika va kimyo laboratoriyalari.',
  39.7751,
  64.4290,
  100,
  3,
  24,
  'Buxoro shahri, Islom Karimov ko''chasi, 3-uy',
  true
),
(
  'Bino 3 — Kutubxona',
  'Bino 3',
  'Ma''lumot resurs markazi, elektron kutubxona va o''quv zallari.',
  39.7743,
  64.4282,
  100,
  2,
  15,
  'Buxoro shahri, G''ijduvon ko''chasi, 10-uy',
  true
);

-- Natijani tekshirish
-- SELECT id, short_name, latitude, longitude, radius_m FROM buildings;
