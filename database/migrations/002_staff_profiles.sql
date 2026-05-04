CREATE TABLE staff_profiles (
  id                SERIAL PRIMARY KEY,
  user_id           INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Shaxsiy ma'lumotlar
  birth_date        DATE,
  gender            VARCHAR(10) CHECK (gender IN ('erkak','ayol')),
  passport_series   VARCHAR(20) UNIQUE,      -- AA1234567
  inn               VARCHAR(20) UNIQUE,      -- STIR
  nationality       VARCHAR(50) DEFAULT 'O''zbek',
  address           TEXT,                    -- yashash manzili
  district          VARCHAR(100),            -- tuman
  region            VARCHAR(100),            -- viloyat

  -- Aloqa
  emergency_name    VARCHAR(100),            -- yaqin kishi ismi
  emergency_phone   VARCHAR(20),             -- yaqin kishi telefoni
  emergency_relation VARCHAR(50),            -- aloqa turi (ota, ona, ...)

  -- Ish ma'lumotlari
  employee_id       VARCHAR(20) UNIQUE,      -- BIU-2024-001
  department        VARCHAR(100),            -- IT Bo'limi
  position          VARCHAR(100),            -- Dasturchi
  rank              VARCHAR(50),             -- Katta mutaxassis
  hire_date         DATE,                    -- ishga kirgan sana
  contract_type     VARCHAR(30) CHECK (
                      contract_type IN ('doimiy','vaqtinchalik','shartnoma')
                    ),
  contract_start    DATE,
  contract_end      DATE,                    -- shartnoma tugash sanasi
  salary            DECIMAL(12,2),           -- maosh (so'm)
  work_hours_day    INT DEFAULT 8,           -- kunlik ish soati
  work_start        TIME DEFAULT '08:30',    -- ish boshlanish vaqti
  work_end          TIME DEFAULT '16:30',    -- ish tugash vaqti
  work_days         VARCHAR(20) DEFAULT 'du-ju', -- ish kunlari

  -- Ta'lim
  education_level   VARCHAR(50),             -- oliy | o'rta maxsus
  university        VARCHAR(200),
  speciality        VARCHAR(200),
  graduation_year   INT,
  degree            VARCHAR(50),             -- bakalavr | magistr | doktor

  -- Qo'shimcha
  notes             TEXT,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);