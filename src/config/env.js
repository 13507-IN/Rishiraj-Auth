const dotenv = require('dotenv');

dotenv.config();

const getEnv = (key, fallback) => {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const NODE_ENV = process.env.NODE_ENV || 'development';

const env = {
  NODE_ENV,
  PORT: Number(process.env.PORT || 4000),
  DATABASE_URL: getEnv('DATABASE_URL'),
  JWT_ACCESS_SECRET: getEnv('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: getEnv('JWT_REFRESH_SECRET'),
  ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL || '15m',
  REFRESH_TOKEN_TTL: process.env.REFRESH_TOKEN_TTL || '7d',
  REDIS_URL: getEnv('REDIS_URL'),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || '',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:4000',
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX || 100),
  EMAIL_VERIFY_TTL_HOURS: Number(process.env.EMAIL_VERIFY_TTL_HOURS || 24),
  PASSWORD_RESET_TTL_MINUTES: Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30),
  REDIS_REQUIRED: process.env.REDIS_REQUIRED
    ? process.env.REDIS_REQUIRED === 'true'
    : NODE_ENV === 'production',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'noreply@rishiraj-auth.dev',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '*',
  DEFAULT_ENVIRONMENT: process.env.DEFAULT_ENVIRONMENT || 'DEVELOPMENT'
};

module.exports = env;
