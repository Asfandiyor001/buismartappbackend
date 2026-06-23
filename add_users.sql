INSERT INTO users (full_name, phone, password_hash, role, is_active) VALUES
('Dilnoza Yusupova', '+998902222001', '$2b$10$BDq76KQIDxCVWqiUEQzjmuGTMt5eDHJ27IruGxBZF9ydl5f7Dgn/u', 'student', true),
('Sardor Nazarov', '+998902222002', '$2b$10$BDq76KQIDxCVWqiUEQzjmuGTMt5eDHJ27IruGxBZF9ydl5f7Dgn/u', 'student', true),
('Nilufar Ergasheva', '+998902222003', '$2b$10$BDq76KQIDxCVWqiUEQzjmuGTMt5eDHJ27IruGxBZF9ydl5f7Dgn/u', 'student', true),
('Prorektor BIU', '+998900000002', '$2b$10$BDq76KQIDxCVWqiUEQzjmuGTMt5eDHJ27IruGxBZF9ydl5f7Dgn/u', 'prorektor', true)
ON CONFLICT (phone) DO NOTHING;

-- Student profiles
INSERT INTO student_profiles (user_id, department, year, group_name)
SELECT u.id, 'Iqtisodiyot', 2, 'IQ-21'
FROM users u WHERE u.phone = '+998902222001'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO student_profiles (user_id, department, year, group_name)
SELECT u.id, 'Menejment', 3, 'MN-31'
FROM users u WHERE u.phone = '+998902222002'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO student_profiles (user_id, department, year, group_name)
SELECT u.id, 'Moliya', 1, 'ML-11'
FROM users u WHERE u.phone = '+998902222003'
ON CONFLICT (user_id) DO NOTHING;
