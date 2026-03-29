const prisma = require('../config/prisma');
const env = require('../config/env');
const { safeDel } = require('../config/redis');
const { generateRandomKey, hashToken } = require('../utils/crypto');
const { ApiError } = require('../utils/errors');
const { sendPasswordResetEmail } = require('./emailService');

const createPasswordReset = async (email) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return null;
  }

  const rawToken = generateRandomKey(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: {
      token: tokenHash,
      userId: user.id,
      expiresAt
    }
  });

  await sendPasswordResetEmail(user.email, rawToken);

  return rawToken;
};

const resetPassword = async ({ token, newPasswordHash }) => {
  const tokenHash = hashToken(token);

  const record = await prisma.passwordResetToken.findUnique({
    where: { token: tokenHash }
  });

  if (!record) {
    throw new ApiError(400, 'Invalid reset token');
  }

  if (record.consumedAt) {
    throw new ApiError(400, 'Reset token already used');
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw new ApiError(400, 'Reset token expired');
  }

  await prisma.passwordResetToken.update({
    where: { id: record.id },
    data: { consumedAt: new Date() }
  });

  await prisma.user.update({
    where: { id: record.userId },
    data: {
      password: newPasswordHash,
      isVerified: true
    }
  });

  const refreshTokens = await prisma.refreshToken.findMany({
    where: { userId: record.userId, revokedAt: null },
    select: { token: true }
  });

  await prisma.refreshToken.updateMany({
    where: { userId: record.userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });

  for (const rt of refreshTokens) {
    await safeDel(`rt:${rt.token}`);
  }
};

module.exports = {
  createPasswordReset,
  resetPassword
};
