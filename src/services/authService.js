const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const { ApiError } = require('../utils/errors');
const { issueTokens, rotateRefreshToken, revokeRefreshToken, blacklistAccessToken } = require('./tokenService');
const { logAudit } = require('./auditService');
const { createVerificationToken } = require('./verificationService');
const { hashToken } = require('../utils/crypto');

const register = async ({ email, password, tenantId, tenantName, inviteToken, ip }) => {
  email = email.trim().toLowerCase();
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true }
  });
  if (existing) {
    throw new ApiError(409, 'Email or workspace name is already in use');
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  let user;
  try {
    if (inviteToken) {
      if (tenantId || tenantName) {
        throw new ApiError(400, 'Use either an invitation token or a new workspace name');
      }
      const invitationTokenHash = hashToken(inviteToken);
      const now = new Date();
      user = await prisma.$transaction(async (transaction) => {
        const invitation = await transaction.tenantInvitation.findUnique({
          where: { token: invitationTokenHash }
        });
        if (
          !invitation ||
          invitation.email !== email ||
          invitation.acceptedAt ||
          invitation.expiresAt <= now
        ) {
          throw new ApiError(400, 'Invalid or expired workspace invitation');
        }

        const accepted = await transaction.tenantInvitation.updateMany({
          where: {
            id: invitation.id,
            acceptedAt: null,
            expiresAt: { gt: now }
          },
          data: { acceptedAt: now }
        });
        if (accepted.count !== 1) {
          throw new ApiError(400, 'Invalid or expired workspace invitation');
        }

        return transaction.user.create({
          data: {
            email,
            password: hashedPassword,
            role: 'USER',
            tenantId: invitation.tenantId,
            isVerified: false
          }
        });
      });
    } else {
      if (tenantId) {
        throw new ApiError(403, 'Joining an existing workspace requires an invitation');
      }
      if (!tenantName) throw new ApiError(400, 'A new workspace name is required');

      user = await prisma.$transaction(async (transaction) => {
        const tenant = await transaction.tenant.create({ data: { name: tenantName } });
        const owner = await transaction.user.create({
          data: {
            email,
            password: hashedPassword,
            role: 'USER',
            tenantId: tenant.id,
            isVerified: false
          }
        });
        await transaction.tenant.update({ where: { id: tenant.id }, data: { ownerId: owner.id } });
        return owner;
      });
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.code === 'P2002') {
      throw new ApiError(409, 'Email or workspace name is already in use');
    }
    throw error;
  }

  const tokenRes = await createVerificationToken(user);

  return { user, verificationToken: tokenRes?.token || null, previewUrl: tokenRes?.previewUrl || null };
};

const login = async ({ email, password, ip, deviceId, tenantId }) => {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: 'insensitive' } }
  });

  if (!user || !user.password) {
    await logAudit({
      userId: user ? user.id : null,
      tenantId: user ? user.tenantId : null,
      action: 'FAILED_LOGIN',
      ip
    });
    throw new ApiError(401, 'Invalid credentials');
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch || (tenantId && user.tenantId !== tenantId)) {
    await logAudit({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'FAILED_LOGIN',
      ip
    });
    throw new ApiError(401, 'Invalid credentials');
  }

  if (!user.isVerified) {
    await logAudit({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'FAILED_LOGIN',
      ip
    });
    throw new ApiError(403, 'Email not verified');
  }

  await logAudit({
    userId: user.id,
    tenantId: user.tenantId,
    action: 'LOGIN',
    ip
  });

  const tokens = await issueTokens({ user, deviceId });

  return { user, tokens };
};

const logout = async ({ refreshToken, accessToken, userId, tenantId, ip }) => {
  const revokedSession = await revokeRefreshToken(refreshToken);
  if (accessToken) {
    await blacklistAccessToken(accessToken);
  }

  await logAudit({
    userId: userId || revokedSession?.userId || null,
    tenantId: tenantId || revokedSession?.tenantId || null,
    action: 'LOGOUT',
    ip
  });
};

const refresh = async ({ refreshToken, deviceId }) => {
  const tokens = await rotateRefreshToken({ token: refreshToken, deviceId });
  return tokens;
};

module.exports = {
  register,
  login,
  logout,
  refresh
};
