CREATE TABLE buildings (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  short_name  VARCHAR(20)  NOT NULL,
  description TEXT,
  latitude    DECIMAL(10,8) NOT NULL,
  longitude   DECIMAL(11,8) NOT NULL,
  radius_m    INT DEFAULT 100,
  floor_count INT DEFAULT 1,
  room_count  INT DEFAULT 0,
  address     TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW()
);

INSERT INTO buildings (name, short_name, description, latitude, longitude, radius_m, floor_count, room_count, address, is_active) VALUES
('Bino 1 — Asosiy bino',  'Bino 1',    'Asosiy talim korpusi.', 39.741066, 64.427637, 120, 4, 65, 'Buxoro shahri, Islom Karimov kochasi, 1-uy', true),
('Bino 2 — Laboratoriya', 'Bino 2',    'Ilmiy-tadqiqot markazi.', 39.740624, 64.432623, 100, 3, 24, 'Buxoro shahri, Islom Karimov kochasi, 3-uy', true),
('Bino 3 — Kutubxona',    'Bino 3',    'Malumot resurs markazi.', 39.740200, 64.434800, 80,  2, 15, 'Buxoro shahri, Gijduvon kochasi, 10-uy', true),
('Admin uyi — Boshqaruv', 'Admin uyi', 'Universitet maqmuriyati.', 39.747389, 64.425345, 150, 2, 12, 'Buxoro shahri, M.Iqbol kochasi, 2-uy', true);
