const prisma = require('../config/prisma');
const { ApiError } = require('../utils/errors');
const { generateRandomKey, hashToken } = require('../utils/crypto');
const { sendTenantInvitationEmail } = require('./emailService');

const INVITATION_TTL_DAYS = 7;

const listTenants = async () => {
  return prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' }
  });
};

const createTenant = async (name) => {
  try {
    return await prisma.tenant.create({
      data: { name }
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ApiError(409, 'Tenant already exists');
    }
    throw err;
  }
};

const listUsers = async (tenantId) => {
  return prisma.user.findMany({
    where: tenantId ? { tenantId } : undefined,
    select: {
      id: true,
      email: true,
      role: true,
      tenantId: true,
      isVerified: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });
};

const updateUserRole = async (userId, role) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      role,
      tokenVersion: { increment: 1 }
    },
    select: {
      id: true,
      email: true,
      role: true,
      tenantId: true,
      isVerified: true,
      createdAt: true
    }
  });
};

const updateUserTenant = async (userId, tenantId) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new ApiError(404, 'Tenant not found');
  }

  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    const currentUser = await transaction.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true }
    });
    if (!currentUser) throw new ApiError(404, 'User not found');
    const previousTenant = currentUser.tenantId === tenantId
      ? null
      : await transaction.tenant.findUnique({
        where: { id: currentUser.tenantId },
        select: { id: true, ownerId: true }
      });
    const user = await transaction.user.update({
      where: { id: userId },
      data: {
        tenantId,
        tokenVersion: { increment: 1 }
      },
      select: {
        id: true,
        email: true,
        role: true,
        tenantId: true,
        isVerified: true,
        createdAt: true
      }
    });
    if (previousTenant?.ownerId === userId) {
      const nextOwner = await transaction.user.findFirst({
        where: { tenantId: previousTenant.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true }
      });
      await transaction.tenant.update({
        where: { id: previousTenant.id },
        data: { ownerId: nextOwner?.id || null }
      });
    }
    if (currentUser.tenantId !== tenantId) {
      const destination = await transaction.tenant.findUnique({
        where: { id: tenantId }, select: { ownerId: true }
      });
      if (destination && destination.ownerId === null) {
        await transaction.tenant.update({ where: { id: tenantId }, data: { ownerId: userId } });
      }
    }
    await transaction.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now }
    });
    await transaction.apiKey.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now }
    });
    return user;
  });
};

const createInvitation = async ({ tenantId, email }) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true }
  });
  if (!tenant) throw new ApiError(404, 'Tenant not found');

  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    select: { id: true }
  });
  if (existingUser) throw new ApiError(409, 'This email already has an account');

  const token = generateRandomKey(32);
  const invitation = await prisma.tenantInvitation.create({
    data: {
      email: normalizedEmail,
      token: hashToken(token),
      tenantId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000)
    },
    select: {
      id: true,
      email: true,
      tenantId: true,
      createdAt: true,
      expiresAt: true
    }
  });

  try {
    const mail = await sendTenantInvitationEmail(normalizedEmail, token, tenant.name);
    return {
      invitation,
      previewUrl: mail.previewUrl || null
    };
  } catch (_error) {
    await prisma.tenantInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() }
    });
    throw new ApiError(503, 'Invitation email could not be sent. Please create a new invitation.');
  }
};

module.exports = {
  listTenants,
  createTenant,
  listUsers,
  updateUserRole,
  updateUserTenant,
  createInvitation
};
