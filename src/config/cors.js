const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8081',
  'http://localhost:19006',
  'https://bui-smart.vercel.app',
  'https://buismartapp.vercel.app',
];

const corsOptions = {
  origin: function (origin, callback) {
    // Mobile app, curl, server-to-server so'rovlari uchun (origin yo'q)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Vercel preview deployment URL lari (*.vercel.app)
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }

    // ngrok tunnel URL lari
    if (origin.endsWith('.ngrok-free.app') || origin.endsWith('.ngrok-free.dev') || origin.endsWith('.ngrok.io')) {
      return callback(null, true);
    }

    callback(new Error(`CORS: "${origin}" manziliga ruxsat yo'q`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'ngrok-skip-browser-warning',
    'cloudflare-skip-browser-warning',
  ],
  optionsSuccessStatus: 204,
};

module.exports = corsOptions;
