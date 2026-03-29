const crypto = require('crypto');
const prisma = require('../config/prisma');
const { safeGet, safeSet, safeDel, isRedisReady } = require('../config/redis');
const { signAccessToken, signRefreshToken, verifyRefreshToken, decodeToken } = require('../utils/tokens');
const { hashToken, getTimeToLiveSeconds } = require('../utils/crypto');
const { ApiError } = require('../utils/errors');

const issueTokens = async ({ user, deviceId }) => {
  const accessJti = crypto.randomUUID();
  const refreshJti = crypto.randomUUID();

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    tenantId: user.tenantId,
    jti: accessJti,
    type: 'access'
  });

  const refreshToken = signRefreshToken({
    sub: user.id,
    role: user.role,
    tenantId: user.tenantId,
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
  await safeSet(`rt:${tokenHash}`, user.id, 'EX', ttl);

  return {
    accessToken,
    refreshToken,
    refreshTokenId: refreshRecord.id,
    refreshExpiresAt: expiresAt
  };
};

const validateRefreshToken = async (token) => {
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

  if (record.expiresAt.getTime() < Date.now()) {
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

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const nextTokens = await issueTokens({ user, deviceId: deviceId || record.deviceId });

  // Rotation: revoke the old token and link it to the new one.
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
  if (!token) return;
  try {
    const tokenHash = hashToken(token);
    await prisma.refreshToken.updateMany({
      where: { token: tokenHash, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    await safeDel(`rt:${tokenHash}`);
  } catch (err) {
    return;
  }
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
