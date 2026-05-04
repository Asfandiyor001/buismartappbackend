CREATE TABLE staff_documents (
  id            SERIAL PRIMARY KEY,
  user_id       INT REFERENCES users(id) ON DELETE CASCADE,
  type          VARCHAR(50) CHECK (
                  type IN (
                    'passport','diplom','mehnat_daftarcha',
                    'shartnoma','sertifikat','boshqa'
                  )
                ),
  title         VARCHAR(200),
  file_url      VARCHAR(255),
  file_size     INT,                          -- bayt
  issued_by     VARCHAR(200),                 -- kim tomonidan berilgan
  issued_date   DATE,
  expiry_date   DATE,
  is_verified   BOOLEAN DEFAULT false,
  notes         TEXT,
  created_at    TIMESTAMP DEFAULT NOW()
);