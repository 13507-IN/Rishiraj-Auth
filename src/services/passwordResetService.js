const prisma = require('../config/prisma');
const env = require('../config/env');
const { safeDel } = require('../config/redis');
const { generateRandomKey, hashToken } = require('../utils/crypto');
const { ApiError } = require('../utils/errors');
const { sendPasswordResetEmail } = require('./emailService');

const createPasswordReset = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    select: { id: true, email: true }
  });
  if (!user) {
    return null;
  }

  const rawToken = generateRandomKey(32);
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

  await prisma.$transaction(async (transaction) => {
    await transaction.passwordResetToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: now }
    });
    await transaction.passwordResetToken.create({
      data: {
        token: tokenHash,
        userId: user.id,
        expiresAt
      }
    });
  });

  let mailRes = null;
  try {
    mailRes = await sendPasswordResetEmail(user.email, rawToken);
  } catch (_error) {
    console.error('Password recovery email delivery failed.');
  }

  return mailRes
    ? { token: rawToken, previewUrl: mailRes.previewUrl || null }
    : null;
};

const resetPassword = async ({ token, newPasswordHash }) => {
  const tokenHash = hashToken(token);

  const record = await prisma.passwordResetToken.findUnique({
    where: { token: tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      consumedAt: true
    }
  });

  if (!record) {
    throw new ApiError(400, 'Invalid reset token');
  }

  if (record.consumedAt) {
    throw new ApiError(400, 'Reset token already used');
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(400, 'Reset token expired');
  }

  const now = new Date();
  const refreshTokens = await prisma.$transaction(async (transaction) => {
    const consumed = await transaction.passwordResetToken.updateMany({
      where: {
        id: record.id,
        consumedAt: null,
        expiresAt: { gt: now }
      },
      data: { consumedAt: now }
    });
    if (consumed.count !== 1) {
      throw new ApiError(400, 'Invalid or expired reset token');
    }

    await transaction.passwordResetToken.updateMany({
      where: {
        userId: record.userId,
        id: { not: record.id },
        consumedAt: null
      },
      data: { consumedAt: now }
    });

    await transaction.user.update({
      where: { id: record.userId },
      data: {
        password: newPasswordHash,
        isVerified: true,
        tokenVersion: { increment: 1 }
      }
    });

    const activeRefreshTokens = await transaction.refreshToken.findMany({
      where: { userId: record.userId, revokedAt: null },
      select: { token: true }
    });

    await transaction.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: now }
    });

    return activeRefreshTokens;
  });

  for (const rt of refreshTokens) {
    await safeDel(`rt:${rt.token}`);
  }
};

module.exports = {
  createPasswordReset,
  resetPassword
};
