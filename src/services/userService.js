const prisma = require('../config/prisma');
const { ApiError } = require('../utils/errors');

const getProfile = async (userId) => {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      role: true,
      tenantId: true,
      isVerified: true,
      createdAt: true
    }
  });
};

const updateProfile = async (userId, { name }) => {
  return prisma.user.update({
    where: { id: userId },
    data: { name },
    select: { id: true, email: true, name: true, role: true, tenantId: true, isVerified: true, createdAt: true }
  });
};

const changePassword = async (userId, oldPassword, newPassword) => {
  const bcrypt = require('bcrypt');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.password) {
    throw new ApiError(400, 'Cannot change password for OAuth-only accounts');
  }
  const match = await bcrypt.compare(oldPassword, user.password);
  if (!match) {
    throw new ApiError(401, 'Current password is incorrect');
  }
  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashed,
      tokenVersion: { increment: 1 }
    }
  });

  // Revoke all refresh tokens
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
};

const getSessionsList = async (userId) => {
  return prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, deviceId: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: 'desc' }
  });
};

const revokeSession = async (userId, sessionId) => {
  const record = await prisma.refreshToken.findFirst({
    where: { id: sessionId, userId }
  });
  if (!record) {
    throw new ApiError(404, 'Session not found');
  }
  return prisma.refreshToken.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() }
  });
};

const getDashboardStats = async (userId, tenantId) => {
  const [totalKeys, activeKeys, totalLogins, totalFailedLogins] = await Promise.all([
    prisma.apiKey.count({ where: { userId, tenantId } }),
    prisma.apiKey.count({ where: { userId, tenantId, revokedAt: null } }),
    prisma.auditLog.count({ where: { userId, action: 'LOGIN' } }),
    prisma.auditLog.count({ where: { userId, action: 'FAILED_LOGIN' } })
  ]);
  return {
    totalKeys,
    activeKeys,
    revokedKeys: totalKeys - activeKeys,
    totalLogins,
    totalFailedLogins
  };
};

const getAuditLogs = async (userId, { page = 1, limit = 20 }) => {
  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: { id: true, action: true, ip: true, createdAt: true, environment: true }
    }),
    prisma.auditLog.count({ where: { userId } })
  ]);
  return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  getSessionsList,
  revokeSession,
  getDashboardStats,
  getAuditLogs
};
