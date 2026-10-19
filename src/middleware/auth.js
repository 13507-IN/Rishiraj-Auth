const prisma = require('../config/prisma');
const env = require('../config/env');
const { safeGet, isRedisReady } = require('../config/redis');
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

    if (!payload?.jti || !payload?.sub || payload.type !== 'access') {
      throw new ApiError(401, 'Invalid access token');
    }

    if (env.REDIS_REQUIRED && !isRedisReady()) {
      throw new ApiError(503, 'Authorization service is temporarily unavailable');
    }

    // Short-lived access tokens can still be revoked via blacklist.
    const blacklisted = await safeGet(`bl:${payload.jti}`);
    if (blacklisted) {
      throw new ApiError(401, 'Token has been revoked');
    }

    // Enforce current membership and role immediately; do not trust stale JWT
    // claims after an admin moves or demotes an account.
    const currentUser = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        tenantId: true,
        isVerified: true,
        tokenVersion: true
      }
    });
    if (!currentUser || !currentUser.isVerified) {
      throw new ApiError(401, 'Account is no longer available');
    }
    if (
      payload.role !== currentUser.role ||
      payload.tenantId !== currentUser.tenantId ||
      payload.ver !== currentUser.tokenVersion
    ) {
      throw new ApiError(401, 'Account permissions changed; refresh your session');
    }

    req.user = {
      id: currentUser.id,
      role: currentUser.role,
      tenantId: currentUser.tenantId,
      jti: payload.jti
    };

    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = authenticate;
