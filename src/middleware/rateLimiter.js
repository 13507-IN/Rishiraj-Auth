const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  message: { message: 'Too many requests, please try again later.' }
});

module.exports = {
  authRateLimiter
};