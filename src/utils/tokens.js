const jwt = require('jsonwebtoken');
const env = require('../config/env');

const signAccessToken = (payload) => {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: 'auth-system',
    audience: 'auth-system-users'
  });
};

const signRefreshToken = (payload) => {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.REFRESH_TOKEN_TTL,
    issuer: 'auth-system',
    audience: 'auth-system-users'
  });
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'],
    issuer: 'auth-system',
    audience: 'auth-system-users'
  });
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: ['HS256'],
    issuer: 'auth-system',
    audience: 'auth-system-users'
  });
};

const decodeToken = (token) => jwt.decode(token);

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken
};
