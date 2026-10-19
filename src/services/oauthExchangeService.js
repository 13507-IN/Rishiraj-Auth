const crypto = require('crypto');
const prisma = require('../config/prisma');
const env = require('../config/env');
const { isRedisReady, safeGet, safeGetDel, safeSet } = require('../config/redis');
const { issueTokens } = require('./tokenService');
const { hashToken } = require('../utils/crypto');
const { ApiError } = require('../utils/errors');

const CODE_TTL_SECONDS = 60;
const developmentCodes = new Map();

const pruneDevelopmentCodes = () => {
  const now = Date.now();
  for (const [key, value] of developmentCodes) {
    if (value.expiresAt <= now) developmentCodes.delete(key);
  }
};

const createOAuthExchangeCode = async ({ userId, clientOrigin }) => {
  const code = crypto.randomBytes(32).toString('base64url');
  const key = `oauth:exchange:${hashToken(code)}`;
  const record = JSON.stringify({
    userId,
    clientOrigin,
    expiresAt: Date.now() + CODE_TTL_SECONDS * 1000
  });

  if (isRedisReady()) {
    const stored = await safeSet(key, record, 'EX', CODE_TTL_SECONDS);
    if (stored !== 'OK') throw new ApiError(503, 'OAuth exchange is temporarily unavailable');
  } else if (!env.IS_PRODUCTION) {
    pruneDevelopmentCodes();
    if (developmentCodes.size >= 2000) {
      throw new ApiError(503, 'OAuth exchange is temporarily unavailable');
    }
    developmentCodes.set(key, {
      record,
      expiresAt: Date.now() + CODE_TTL_SECONDS * 1000
    });
  } else {
    throw new ApiError(503, 'OAuth exchange is temporarily unavailable');
  }

  return code;
};

const exchangeOAuthCode = async ({ code, clientOrigin }) => {
  if (typeof code !== 'string' || code.length < 40 || code.length > 100) {
    throw new ApiError(400, 'Invalid or expired OAuth code');
  }

  const key = `oauth:exchange:${hashToken(code)}`;
  let record = null;

  if (isRedisReady()) {
    // Consume the code atomically so concurrent requests cannot both redeem it.
    const stored = await safeGetDel(key);
    if (!stored) throw new ApiError(400, 'Invalid or expired OAuth code');

    try {
      record = JSON.parse(stored);
    } catch (_err) {
      throw new ApiError(400, 'Invalid or expired OAuth code');
    }
    if (record.clientOrigin !== clientOrigin) {
      throw new ApiError(403, 'OAuth code is bound to a different application');
    }
  } else if (!env.IS_PRODUCTION) {
    pruneDevelopmentCodes();
    const stored = developmentCodes.get(key);
    if (!stored) throw new ApiError(400, 'Invalid or expired OAuth code');
    record = JSON.parse(stored.record);
    if (record.clientOrigin !== clientOrigin) {
      throw new ApiError(403, 'OAuth code is bound to a different application');
    }
    developmentCodes.delete(key);
  } else {
    throw new ApiError(503, 'OAuth exchange is temporarily unavailable');
  }

  if (record.expiresAt <= Date.now()) {
    throw new ApiError(400, 'Invalid or expired OAuth code');
  }

  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      role: true,
      tenantId: true,
      isVerified: true,
      tokenVersion: true
    }
  });
  if (!user || !user.isVerified) throw new ApiError(401, 'OAuth account is no longer available');

  const tokens = await issueTokens({ user });
  return { user, tokens };
};

module.exports = {
  createOAuthExchangeCode,
  exchangeOAuthCode
};
