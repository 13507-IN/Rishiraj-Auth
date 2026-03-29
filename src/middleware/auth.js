const { safeGet } = require('../config/redis');
const { verifyAccessToken } = require('../utils/tokens');
const { ApiError } = require('../utils/errors');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    if (!payload?.jti) {
      throw new ApiError(401, 'Invalid access token');
    }

    // Short-lived access tokens can still be revoked via blacklist.
    const blacklisted = await safeGet(`bl:${payload.jti}`);
    if (blacklisted) {
      throw new ApiError(401, 'Token has been revoked');
    }

    req.user = {
      id: payload.sub,
      role: payload.role,
      tenantId: payload.tenantId,
      jti: payload.jti
    };

    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = authenticate;
