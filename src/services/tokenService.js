const crypto = require('crypto');
const prisma = require('../config/prisma');
const { safeGet, safeSet, safeDel, isRedisReady } = require('../config/redis');
const { signAccessToken, signRefreshToken, verifyRefreshToken, decodeToken } = require('../utils/tokens');
const { hashToken, getTimeToLiveSeconds } = require('../utils/crypto');
const { ApiError } = require('../utils/errors');
const env = require('../config/env');

const issueTokens = async ({ user, deviceId }) => {
  if (env.REDIS_REQUIRED && !isRedisReady()) {
    throw new ApiError(503, 'Session service is temporarily unavailable');
  }

  const accessJti = crypto.randomUUID();
  const refreshJti = crypto.randomUUID();

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    tenantId: user.tenantId,
    ver: user.tokenVersion || 0,
    jti: accessJti,
    type: 'access'
  });

  const refreshToken = signRefreshToken({
    sub: user.id,
    role: user.role,
    tenantId: user.tenantId,
    ver: user.tokenVersion || 0,
    jti: refreshJti,
    type: 'refresh'
  });

  const decoded = decodeToken(refreshToken);
  const expiresAt = new Date(decoded.exp * 1000);
  // Store only a hash of the refresh token for safer persistence.
  const tokenHash = hashToken(refreshToken);

  const refreshRecord = await prisma.refreshToken.create({
    data: {
      token: tokenHash,
      userId: user.id,
      expiresAt,
      deviceId: deviceId || null
    }
  });

  const ttl = getTimeToLiveSeconds(expiresAt);
  try {
    await safeSet(`rt:${tokenHash}`, user.id, 'EX', ttl);
  } catch (error) {
    await prisma.refreshToken.update({
      where: { id: refreshRecord.id },
      data: { revokedAt: new Date() }
    });
    throw error;
  }

  return {
    accessToken,
    refreshToken,
    refreshTokenId: refreshRecord.id,
    refreshExpiresAt: expiresAt
  };
};

const validateRefreshToken = async (token) => {
  if (env.REDIS_REQUIRED && !isRedisReady()) {
    throw new ApiError(503, 'Session service is temporarily unavailable');
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (err) {
    throw new ApiError(401, 'Invalid refresh token');
  }

  if (!payload?.jti || payload.type !== 'refresh') {
    throw new ApiError(401, 'Invalid refresh token');
  }

  const tokenHash = hashToken(token);
  const record = await prisma.refreshToken.findUnique({ where: { token: tokenHash } });
  if (!record) {
    throw new ApiError(401, 'Refresh token not recognized');
  }

  if (record.revokedAt) {
    throw new ApiError(401, 'Refresh token has been revoked');
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(401, 'Refresh token has expired');
  }

  // Redis presence enables fast revocation checks.
  if (isRedisReady()) {
    const existsInRedis = await safeGet(`rt:${tokenHash}`);
    if (!existsInRedis) {
      throw new ApiError(401, 'Refresh token has been revoked');
    }
  }

  return { payload, record, tokenHash };
};

const rotateRefreshToken = async ({ token, deviceId }) => {
  const { payload, record, tokenHash } = await validateRefreshToken(token);

  const now = new Date();
  const claimed = await prisma.refreshToken.updateMany({
    where: {
      id: record.id,
      revokedAt: null,
      expiresAt: { gt: now }
    },
    data: { revokedAt: now }
  });
  if (claimed.count !== 1) {
    await safeDel(`rt:${tokenHash}`);
    throw new ApiError(401, 'Refresh token has already been used');
  }
  await safeDel(`rt:${tokenHash}`);

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      role: true,
      tenantId: true,
      isVerified: true,
      tokenVersion: true
    }
  });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const nextTokens = await issueTokens({ user, deviceId: deviceId || record.deviceId });

  // Record the rotation only after the replacement token is safely persisted.
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: {
      revokedAt: new Date(),
      replacedByTokenId: nextTokens.refreshTokenId
    }
  });

  await safeDel(`rt:${tokenHash}`);

  return nextTokens;
};

const revokeRefreshToken = async (token) => {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const record = await prisma.refreshToken.findUnique({
    where: { token: tokenHash },
    select: {
      userId: true,
      user: { select: { tenantId: true } }
    }
  });
  await prisma.refreshToken.updateMany({
    where: { token: tokenHash, revokedAt: null },
    data: { revokedAt: new Date() }
  });
  await safeDel(`rt:${tokenHash}`);
  return record
    ? { userId: record.userId, tenantId: record.user.tenantId }
    : null;
};

const blacklistAccessToken = async (token) => {
  const decoded = decodeToken(token);
  if (!decoded?.jti || !decoded?.exp) return;
  const expiresAt = new Date(decoded.exp * 1000);
  const ttl = getTimeToLiveSeconds(expiresAt);
  if (ttl > 0) {
    await safeSet(`bl:${decoded.jti}`, '1', 'EX', ttl);
  }
};

module.exports = {
  issueTokens,
  rotateRefreshToken,
  revokeRefreshToken,
  blacklistAccessToken
};
