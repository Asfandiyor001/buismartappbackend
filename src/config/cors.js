/**
 * Ruxsat etilgan frontend originlar.
 * Vite: 5173, CRA: 3000, Expo veb: 8081 / 19006
 */
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://192.168.0.165:5173',
    'http://192.168.0.20:5174',
    'http://localhost:8081',
    'http://localhost:19006',
    'http://192.168.0.165:8081',
    'exp://192.168.0.165:8081',
    'exp://192.168.0.165:19000',
    'http://192.168.0.165:19006',
    process.env.CLIENT_URL,
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 204,
}

module.exports = corsOptions
