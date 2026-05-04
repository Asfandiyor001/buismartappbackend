CREATE TABLE notifications (
  id            SERIAL PRIMARY KEY,
  user_id       INT REFERENCES users(id) ON DELETE CASCADE,
  type          VARCHAR(30) NOT NULL
                  CHECK (type IN (
                    'davomat','topshiriq','jadval',
                    'baho','ogohlantirish','tizim'
                  )),
  title         VARCHAR(200) NOT NULL,
  body          TEXT,
  data          JSONB,                    -- qo'shimcha ma'lumot
  is_read       BOOLEAN DEFAULT false,
  read_at       TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread
  ON notifications(user_id, is_read)
  WHERE is_read = false;