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
const IS_PRODUCTION = !['development', 'test'].includes(NODE_ENV);

const env = {
  NODE_ENV,
  IS_PRODUCTION,
  HOST: process.env.HOST || (IS_PRODUCTION ? '0.0.0.0' : '127.0.0.1'),
  PORT: Number(process.env.PORT || 4000),
  DATABASE_URL: getEnv('DATABASE_URL'),
  JWT_ACCESS_SECRET: getEnv('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: getEnv('JWT_REFRESH_SECRET'),
  OAUTH_STATE_SECRET: process.env.OAUTH_STATE_SECRET || '',
  ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL || '15m',
  REFRESH_TOKEN_TTL: process.env.REFRESH_TOKEN_TTL || '7d',
  REDIS_URL: getEnv('REDIS_URL'),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || '',
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || '',
  GITHUB_CALLBACK_URL: process.env.GITHUB_CALLBACK_URL || '',
  FACEBOOK_CLIENT_ID: process.env.FACEBOOK_CLIENT_ID || '',
  FACEBOOK_CLIENT_SECRET: process.env.FACEBOOK_CLIENT_SECRET || '',
  FACEBOOK_CALLBACK_URL: process.env.FACEBOOK_CALLBACK_URL || '',
  FACEBOOK_GRAPH_API_VERSION: process.env.FACEBOOK_GRAPH_API_VERSION || 'v26.0',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:4000',
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX || 100),
  LOGIN_RATE_LIMIT_MAX: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
  RECOVERY_RATE_LIMIT_MAX: Number(process.env.RECOVERY_RATE_LIMIT_MAX || 5),
  API_KEY_VALIDATE_RATE_LIMIT_MAX: Number(process.env.API_KEY_VALIDATE_RATE_LIMIT_MAX || 1000),
  DEV_AUTH_TOKENS: process.env.DEV_AUTH_TOKENS === 'true',
  EMAIL_VERIFY_TTL_HOURS: Number(process.env.EMAIL_VERIFY_TTL_HOURS || 24),
  PASSWORD_RESET_TTL_MINUTES: Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30),
  REDIS_REQUIRED: process.env.REDIS_REQUIRED
    ? process.env.REDIS_REQUIRED === 'true'
    : IS_PRODUCTION,
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'noreply@rishiraj-auth.dev',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:4000',
  TRUST_PROXY: process.env.TRUST_PROXY || '',
  DEFAULT_ENVIRONMENT: process.env.DEFAULT_ENVIRONMENT || 'DEVELOPMENT'
};

if (!Number.isInteger(env.PORT) || env.PORT < 1 || env.PORT > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

if (!/^v\d+\.\d+$/.test(env.FACEBOOK_GRAPH_API_VERSION)) {
  throw new Error('FACEBOOK_GRAPH_API_VERSION must look like v26.0');
}

for (const [name, value] of [
  ['RATE_LIMIT_WINDOW_MS', env.RATE_LIMIT_WINDOW_MS],
  ['RATE_LIMIT_MAX', env.RATE_LIMIT_MAX],
  ['LOGIN_RATE_LIMIT_MAX', env.LOGIN_RATE_LIMIT_MAX],
  ['RECOVERY_RATE_LIMIT_MAX', env.RECOVERY_RATE_LIMIT_MAX],
  ['API_KEY_VALIDATE_RATE_LIMIT_MAX', env.API_KEY_VALIDATE_RATE_LIMIT_MAX]
]) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

for (const provider of ['GOOGLE', 'GITHUB', 'FACEBOOK']) {
  const keys = ['CLIENT_ID', 'CLIENT_SECRET', 'CALLBACK_URL'].map((suffix) => `${provider}_${suffix}`);
  if (keys.some((key) => env[key]) && !keys.every((key) => env[key])) {
    throw new Error(`${provider} OAuth requires ${keys.join(', ')}`);
  }
  if (env[`${provider}_CALLBACK_URL`]) {
    const callback = new URL(env[`${provider}_CALLBACK_URL`]);
    if (!['http:', 'https:'].includes(callback.protocol) || callback.username || callback.password ||
        callback.search || callback.hash || (IS_PRODUCTION && callback.protocol !== 'https:')) {
      throw new Error(`${provider}_CALLBACK_URL must be a clean HTTP(S) URL; production requires HTTPS`);
    }
  }
}

if (env.DEV_AUTH_TOKENS && NODE_ENV !== 'development') {
  throw new Error('DEV_AUTH_TOKENS may only be enabled in development');
}

if (IS_PRODUCTION) {
  if (env.JWT_ACCESS_SECRET.length < 32 || env.JWT_REFRESH_SECRET.length < 32) {
    throw new Error('Production JWT secrets must each be at least 32 characters long');
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error('Production access and refresh JWT secrets must be different');
  }
  if (env.OAUTH_STATE_SECRET.length < 32 ||
      env.OAUTH_STATE_SECRET === env.JWT_ACCESS_SECRET ||
      env.OAUTH_STATE_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error('Production OAUTH_STATE_SECRET must be a distinct secret of at least 32 characters');
  }
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('Production email requires SMTP_HOST, SMTP_USER, and SMTP_PASS');
  }
  if (!env.REDIS_REQUIRED) {
    throw new Error('Production requires REDIS_REQUIRED=true for shared rate limiting and token revocation');
  }
  if (env.ALLOWED_ORIGINS === '*' || env.ALLOWED_ORIGINS.split(',').some((origin) => origin.trim() === '*')) {
    throw new Error('Production ALLOWED_ORIGINS must list trusted origins; wildcard CORS is not allowed');
  }
  if (!env.ALLOWED_ORIGINS.split(',').every((origin) => {
    try {
      return new URL(origin.trim()).protocol === 'https:';
    } catch (_err) {
      return false;
    }
  })) {
    throw new Error('Every production CORS origin must be a valid HTTPS origin');
  }
  if (!env.FRONTEND_URL.startsWith('https://')) {
    throw new Error('Production FRONTEND_URL must use HTTPS');
  }
  let frontendUrl;
  try {
    frontendUrl = new URL(env.FRONTEND_URL);
  } catch (_err) {
    throw new Error('Production FRONTEND_URL must be a valid HTTPS origin');
  }
  if (
    frontendUrl.protocol !== 'https:' ||
    frontendUrl.username ||
    frontendUrl.password ||
    frontendUrl.pathname !== '/' ||
    frontendUrl.search ||
    frontendUrl.hash
  ) {
    throw new Error('Production FRONTEND_URL must be an HTTPS origin without a path or credentials');
  }

  if (env.GOOGLE_CLIENT_ID) {
    let googleCallbackUrl;
    try {
      googleCallbackUrl = new URL(env.GOOGLE_CALLBACK_URL);
    } catch (_err) {
      throw new Error('Production GOOGLE_CALLBACK_URL must be a valid HTTPS URL');
    }
    if (
      googleCallbackUrl.protocol !== 'https:' ||
      googleCallbackUrl.username ||
      googleCallbackUrl.password ||
      googleCallbackUrl.search ||
      googleCallbackUrl.hash
    ) {
      throw new Error('Production GOOGLE_CALLBACK_URL must use HTTPS and must not contain credentials, a query, or a fragment');
    }
  }
}

module.exports = env;
