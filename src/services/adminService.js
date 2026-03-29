const prisma = require('../config/prisma');
const { ApiError } = require('../utils/errors');

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
    throw new ApiError(409, 'Tenant already exists');
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
    data: { role }
  });
};

const updateUserTenant = async (userId, tenantId) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new ApiError(404, 'Tenant not found');
  }

  return prisma.user.update({
    where: { id: userId },
    data: { tenantId }
  });
};

module.exports = {
  listTenants,
  createTenant,
  listUsers,
  updateUserRole,
  updateUserTenant
};