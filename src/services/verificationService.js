const prisma = require('../config/prisma');
const env = require('../config/env');
const { generateRandomKey, hashToken } = require('../utils/crypto');
const { ApiError } = require('../utils/errors');
const { sendVerificationEmail } = require('./emailService');

const createVerificationToken = async (user) => {
  const rawToken = generateRandomKey(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + env.EMAIL_VERIFY_TTL_HOURS * 60 * 60 * 1000);

  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    await transaction.emailVerificationToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: now }
    });
    await transaction.emailVerificationToken.create({
      data: {
        token: tokenHash,
        userId: user.id,
        expiresAt
      }
    });
  });

  const mailRes = await sendVerificationEmail(user.email, rawToken);

  return { token: rawToken, previewUrl: mailRes?.previewUrl || null };
};

const verifyEmail = async (token) => {
  const tokenHash = hashToken(token);

  const record = await prisma.emailVerificationToken.findUnique({
    where: { token: tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      consumedAt: true
    }
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

  const now = new Date();
  const user = await prisma.$transaction(async (transaction) => {
    const consumed = await transaction.emailVerificationToken.updateMany({
      where: {
        id: record.id,
        consumedAt: null,
        expiresAt: { gt: now }
      },
      data: { consumedAt: now }
    });
    if (consumed.count !== 1) {
      throw new ApiError(400, 'Invalid or expired verification token');
    }
    return transaction.user.update({
      where: { id: record.userId },
      data: { isVerified: true },
      select: { id: true }
    });
  });

  return user;
};

const resendVerification = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    select: { id: true, email: true, isVerified: true }
  });
  if (!user) {
    return null;
  }

  if (user.isVerified) {
    return null;
  }

  try {
    return await createVerificationToken(user);
  } catch (_error) {
    console.error('Verification email delivery failed.');
    return null;
  }
};

module.exports = {
  createVerificationToken,
  verifyEmail,
  resendVerification
};
