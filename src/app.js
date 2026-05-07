const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const config = require('./config/env');
const corsOptions = require('./config/cors');
const authRoutes = require('./modules/auth/auth.routes');
const workRoutes = require('./modules/work/work.routes');
const staffRoutes = require('./modules/staff/staff.routes');
const studentRoutes = require('./modules/student/student.routes');
const notificationRoutes = require('./modules/notification/notification.routes');
const reportRoutes = require('./modules/report/report.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const authenticate = require('./middleware/auth');
const checkRole = require('./middleware/role');
const pool = require('./config/database');
const { success, error } = require('./utils/response');

const app = express();

// Cloudflare Tunnel / reverse-proxy orqasida ishlaganda
// express-rate-limit X-Forwarded-For sarlavhasini ishonchli deb qabul qilishi uchun
app.set('trust proxy', 1);

// ── Xavfsizlik ──────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "https://*.trycloudflare.com", "wss://*.trycloudflare.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors(corsOptions));
app.use((req, res, next) => {
  express.json({ limit: '10mb' })(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: "Noto'g'ri JSON format" });
    }
    next();
  });
});
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Body undefined himoyasi (text/plain va boshqa noto'g'ri Content-Type)
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.body) {
    req.body = {};
  }
  next();
});

// ── Sensitive path blocker ──────────────────────────────
// /.env, /.git, /package.json kabi fayllarni bloklash
const BLOCKED_PATHS = [
  /^\/\.env/i,
  /^\/\.git/i,
  /^\/\.docker/i,
  /^\/package\.json$/i,
  /^\/package-lock\.json$/i,
  /^\/node_modules/i,
  /^\/Dockerfile$/i,
  /^\/docker-compose/i,
  /^\/\.npmrc$/i,
  /^\/tsconfig/i,
  /^\/\.eslint/i,
];

app.use((req, res, next) => {
  if (BLOCKED_PATHS.some(pattern => pattern.test(req.path))) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  next();
});

// ── Root ────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'BIU Smart App API muvaffaqiyatli ishlamoqda! 🚀',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
  });
});

// ── API routes ──────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/work', workRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/buildings', authenticate, checkRole('staff', 'admin', 'prorektor'), async (req, res) => {
  try {
    const resDb = await pool.query(
      `SELECT id, name, short_name, latitude, longitude, radius_m, is_active
       FROM buildings
       WHERE is_active = true
       ORDER BY id ASC`
    );
    const data = resDb.rows.map((row) => ({
      id: row.id,
      name: row.name,
      shortName: row.short_name,
      latitude: row.latitude,
      longitude: row.longitude,
      radiusM: row.radius_m,
      radius_m: row.radius_m,
      isActive: row.is_active,
    }));
    return success(res, data, 'Binolar');
  } catch (err) {
    return error(res, err.message, 500);
  }
});

app.get('/api/health', (req, res) => {
  res.json({ success: true });
});

// ── 404 handler ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route topilmadi' });
});

// ── Global error handler ────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Server xatosi' });
});

module.exports = app;
