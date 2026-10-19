const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const env = require('../config/env');
const { redis } = require('../config/redis');

const createLimiter = ({ windowMs, max, prefix }) => rateLimit({
  windowMs,
  limit: max,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
  // Production requires Redis and fails closed if the shared limiter is unavailable.
  passOnStoreError: !env.IS_PRODUCTION,
  store: env.IS_PRODUCTION
    ? new RedisStore({
      prefix,
      sendCommand: (command, ...args) => redis.call(command, ...args)
    })
    : undefined
});

const authRateLimiter = createLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  prefix: 'rl:auth:'
});

const loginRateLimiter = createLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.LOGIN_RATE_LIMIT_MAX,
  prefix: 'rl:login:'
});

const recoveryRateLimiter = createLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RECOVERY_RATE_LIMIT_MAX,
  prefix: 'rl:recovery:'
});

const apiKeyValidateRateLimiter = createLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.API_KEY_VALIDATE_RATE_LIMIT_MAX,
  prefix: 'rl:api-key-validate:'
});

module.exports = {
  authRateLimiter,
  loginRateLimiter,
  recoveryRateLimiter,
  apiKeyValidateRateLimiter
};
