CREATE TABLE student_attendance (
  id            SERIAL PRIMARY KEY,
  student_id    INT REFERENCES users(id) ON DELETE CASCADE,
  schedule_id   INT REFERENCES schedules(id) ON DELETE CASCADE,
  qr_token_id   INT REFERENCES qr_tokens(id),
  attend_date   DATE NOT NULL,
  
  -- Holat
  status        VARCHAR(20) DEFAULT 'absent'
                  CHECK (status IN ('present','absent','late','excused')),
  check_in_time TIMESTAMP,                  -- kelgan vaqti
  late_minutes  INT DEFAULT 0,              -- necha daqiqa kech
  
  -- GPS tekshirish
  check_in_lat  DECIMAL(10,8),
  check_in_lon  DECIMAL(11,8),
  gps_confirmed BOOLEAN DEFAULT false,      -- GPS tasdiqlandimi
  gps_distance_m DECIMAL(6,2),             -- auditoriyadagi masofa
  
  -- Uzr
  excuse_reason TEXT,
  excuse_file   VARCHAR(255),              -- hujjat URL
  is_excused    BOOLEAN DEFAULT false,
  
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, schedule_id, attend_date)
);

-- Semester davomati jami
CREATE TABLE attendance_summary (
  id              SERIAL PRIMARY KEY,
  student_id      INT REFERENCES users(id) ON DELETE CASCADE,
  subject         VARCHAR(100) NOT NULL,
  semester        VARCHAR(20)  NOT NULL,
  total_classes   INT DEFAULT 0,           -- jami darslar
  present_count   INT DEFAULT 0,           -- kelgan
  absent_count    INT DEFAULT 0,           -- kelmagan
  late_count      INT DEFAULT 0,           -- kech kelgan
  excused_count   INT DEFAULT 0,           -- uzrli
  attendance_pct  DECIMAL(5,2),            -- davomat foizi
  is_warning      BOOLEAN DEFAULT false,   -- 80% dan past
  updated_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, subject, semester)
);