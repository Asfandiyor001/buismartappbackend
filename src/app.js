const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const config = require('./config/env');
const corsOptions = require('./config/cors');
const authRoutes = require('./modules/auth/auth.routes'); // Auth yo'nalishlari
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

// Xavfsizlik va Middleware sozlamalari
app.use(helmet()); // Xavfsizlik sarlavhalarini qoshadi
app.use(cors(corsOptions));
app.use(express.json()); // Kelayotgan ma'lumotlarni JSON formatida o'qish
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev')); // API so'rovlarni terminalda chiroyli qilib ko'rsatadi

// Barcha auth routerlarni /api/auth manzili orqali ishlatish
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

// Test Route (Server tirikligini tekshirish uchun)
app.get('/', (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: "BIU Smart App API muvaffaqiyatli ishlamoqda! 🚀",
    environment: config.env
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route topilmadi' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Server xatosi' });
});

module.exports = app;