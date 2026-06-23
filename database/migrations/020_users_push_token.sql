-- Expo push notification token (har bir foydalanuvchi qurilmasi uchun)
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;
