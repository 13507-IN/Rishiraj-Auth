const prisma = require('../config/prisma');
const env = require('../config/env');
const { generateRandomKey, hashToken } = require('../utils/crypto');
const { ApiError } = require('../utils/errors');
const { sendVerificationEmail } = require('./emailService');

const createVerificationToken = async (user) => {
  const rawToken = generateRandomKey(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + env.EMAIL_VERIFY_TTL_HOURS * 60 * 60 * 1000);

  await prisma.emailVerificationToken.create({
    data: {
      token: tokenHash,
      userId: user.id,
      expiresAt
    }
  });

  const mailRes = await sendVerificationEmail(user.email, rawToken);

  return { token: rawToken, previewUrl: mailRes?.previewUrl || null };
};

const verifyEmail = async (token) => {
  const tokenHash = hashToken(token);

  const record = await prisma.emailVerificationToken.findUnique({
    where: { token: tokenHash },
    include: { user: true }
  });

  if (!record) {
    throw new ApiError(400, 'Invalid verification token');
  }

  if (record.consumedAt) {
    throw new ApiError(400, 'Verification token already used');
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw new ApiError(400, 'Verification token expired');
  }

  await prisma.emailVerificationToken.update({
    where: { id: record.id },
    data: { consumedAt: new Date() }
  });

  await prisma.user.update({
    where: { id: record.userId },
    data: { isVerified: true }
  });

  return record.user;
};

const resendVerification = async (email) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return null;
  }

  if (user.isVerified) {
    throw new ApiError(400, 'Email already verified');
  }

  return createVerificationToken(user);
};

module.exports = {
  createVerificationToken,
  verifyEmail,
  resendVerification
};