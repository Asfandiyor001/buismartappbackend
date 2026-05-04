CREATE TABLE schedules (
  id            SERIAL PRIMARY KEY,
  subject       VARCHAR(100) NOT NULL,
  teacher_id    INT REFERENCES users(id),
  group_name    VARCHAR(50)  NOT NULL,        -- IT-22-1
  room          VARCHAR(50),
  building_id   INT REFERENCES buildings(id),
  day_of_week   INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  -- 1=Dushanba, 2=Seshanba ... 7=Yakshanba
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  color         VARCHAR(20) DEFAULT '#028090',
  semester      VARCHAR(20),                  -- 2024-spring
  week_type     VARCHAR(10) DEFAULT 'all'
                  CHECK (week_type IN ('all','odd','even')),
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- QR tokenlar (har dars uchun)
CREATE TABLE qr_tokens (
  id            SERIAL PRIMARY KEY,
  schedule_id   INT REFERENCES schedules(id) ON DELETE CASCADE,
  token         VARCHAR(100) UNIQUE NOT NULL, -- tasodifiy token
  valid_date    DATE NOT NULL,               -- qaysi kun uchun
  valid_from    TIMESTAMP NOT NULL,          -- dars boshlanishidan 10 daqiqa oldin
  valid_until   TIMESTAMP NOT NULL,          -- dars tugashidan 15 daqiqa keyin
  is_used_count INT DEFAULT 0,              -- nechta talaba ishlatgan
  created_at    TIMESTAMP DEFAULT NOW()
);