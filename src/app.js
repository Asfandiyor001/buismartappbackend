const path = require('path');
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
const adminService = require('./modules/admin/admin.service');
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

// ── API routes ──────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/work', workRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/buildings', authenticate, checkRole('admin', 'prorektor'), async (req, res) => {
  try {
    const data = await adminService.listBuildings();
    return success(res, data, 'Binolar');
  } catch (err) {
    return error(res, err.message, 500);
  }
});

// API health check (minimal info)
app.get('/api/health', (req, res) => {
  res.json({ success: true });
});

// ── Frontend static fayllar ─────────────────────────────
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir, {
  dotfiles: 'deny',
  index: false,
}));

// SPA fallback
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'API route topilmadi' });
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Server xatosi' });
});

module.exports = app;
