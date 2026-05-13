const allowedOrigins = [
  /\.ngrok-free\.app$/,
  /\.ngrok-free\.dev$/,
  /\.ngrok\.io$/,
  /\.trycloudflare\.com$/,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8081',
  'http://localhost:19006',
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);

    const allowed = allowedOrigins.some((entry) =>
      typeof entry === 'string' ? origin === entry : entry.test(origin),
    );

    if (allowed) {
      return callback(null, true);
    }

    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 204,
};

module.exports = corsOptions;
