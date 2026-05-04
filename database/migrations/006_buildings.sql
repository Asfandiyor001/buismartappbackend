-- 006_buildings.sql

-- 1. Avval eski binolarni tozalaymiz (ID lar 1 dan boshlanishi uchun)
TRUNCATE TABLE buildings RESTART IDENTITY CASCADE;

-- 2. Binolar ma'lumotlarini kiritamiz
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
-- Bino 1
(
  'Bino 1 — Asosiy bino', 
  'Bino 1', 
  'Asosiy ta''lim korpusi, ma''ruza zallari va fakultetlar joylashgan bino.', 
  39.741066, 
  64.427637, 
  120, 
  4, 
  65, 
  'Buxoro shahri, Islom Karimov ko''chasi, 1-uy', 
  true
),

-- Bino 2
(
  'Bino 2 — Laboratoriya', 
  'Bino 2', 
  'Ilmiy-tadqiqot markazi, fizika va kimyo laboratoriyalari.', 
  39.740624, 
  64.432623, 
  100, 
  3, 
  24, 
  'Buxoro shahri, Islom Karimov ko''chasi, 3-uy', 
  true
),

-- Bino 3
(
  'Bino 3 — Kutubxona', 
  'Bino 3', 
  'Ma''lumot resurs markazi, elektron kutubxona va o''quv zallari.', 
  39.740200, 
  64.434800, 
  80, 
  2, 
  15, 
  'Buxoro shahri, G''ijduvon ko''chasi, 10-uy', 
  true
),

-- Bino 4
(
  'Admin uyi — Boshqaruv', 
  'Admin uyi', 
  'Universitet ma''muriyati, rektorat va moliya bo''limi binosi.', 
  39.747389, 
  64.425345, 
  150, 
  2, 
  12, 
  'Buxoro shahri, M.Iqbol ko''chasi, 2-uy', 
  true
);