const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const apiKeyRoutes = require('./routes/apiKeyRoutes');
const { configurePassport, passport } = require('./config/passport');
const { configuredOrigins } = require('./utils/origins');
const { isRedisReady } = require('./config/redis');

const app = express();

configurePassport();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'frame-ancestors': ["'none'"],
      'font-src': ["'self'", 'https:', 'data:'],
      'img-src': ["'self'", 'https:', 'data:'],
      'style-src': ["'self'", 'https:', "'unsafe-inline'"],
      'connect-src': ["'self'"],
      'upgrade-insecure-requests': env.IS_PRODUCTION ? [] : null
    }
  },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (configuredOrigins().has(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id', 'X-Api-Key'],
  credentials: true
}));

app.use(express.json({ limit: '10kb' }));
if (env.TRUST_PROXY) {
  const trustProxy = env.TRUST_PROXY === 'true'
    ? true
    : /^\d+$/.test(env.TRUST_PROXY)
      ? Number(env.TRUST_PROXY)
      : env.TRUST_PROXY;
  app.set('trust proxy', trustProxy);
}
app.use(morgan((tokens, req, res) => [
  tokens.method(req, res),
  req.path,
  tokens.status(req, res),
  `${tokens['response-time'](req, res)} ms`,
  `requestId=${req.requestId || '-'}`
].join(' ')));
app.use(passport.initialize());

// Request ID middleware
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

app.get('/health', async (req, res) => {
  let database = 'unavailable';
  try {
    await require('./config/prisma').$queryRaw`SELECT 1`;
    database = 'connected';
  } catch (_err) {
    // Health details must not expose connection strings or database errors.
  }

  const redisStatus = isRedisReady()
    ? 'connected'
    : env.REDIS_REQUIRED
      ? 'unavailable'
      : 'optional_unavailable';
  const status = database === 'connected' && (!env.REDIS_REQUIRED || isRedisReady()) ? 'ok' : 'degraded';
  res.status(status === 'ok' ? 200 : 503).json({
    status,
    dependencies: {
      database,
      redis: redisStatus
    },
    integrations: {
      googleOAuth: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALLBACK_URL),
      smtpConfigured: Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS)
    }
  });
});

app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/admin', adminRoutes);
app.use('/api-keys', apiKeyRoutes);
app.use('/workspace', require('./routes/workspaceRoutes'));

const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Serve SDK directory
const sdkPath = path.join(__dirname, '..', 'frontend', 'sdk');
app.use('/sdk', express.static(sdkPath));

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(frontendPath, 'dashboard.html'));
});

app.get('/oauth-success', (req, res) => {
  res.sendFile(path.join(frontendPath, 'oauth-success.html'));
});

app.get('/oauth-failed', (req, res) => {
  res.status(401).sendFile(path.join(frontendPath, 'oauth-failed.html'));
});

app.use(errorHandler);

module.exports = app;
