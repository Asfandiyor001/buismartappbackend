-- Talaba profili (guruh va shaxsiy ma'lumotlar)
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id         INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  group_name      VARCHAR(50)  NOT NULL,
  year            INT,
  department      VARCHAR(100),
  birth_date      DATE,
  gender          VARCHAR(10) CHECK (gender IS NULL OR gender IN ('erkak','ayol')),
  address         TEXT,
  education_level VARCHAR(50),
  passport_series VARCHAR(20),
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_profiles_group
  ON student_profiles(group_name);
