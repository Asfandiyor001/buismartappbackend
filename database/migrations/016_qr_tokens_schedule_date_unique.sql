-- Bir dars + kun uchun yagona QR yozuvi (admin generateQR upsert)
CREATE UNIQUE INDEX IF NOT EXISTS uq_qr_tokens_schedule_valid_date
  ON qr_tokens (schedule_id, valid_date);
