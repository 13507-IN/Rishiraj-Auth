const prisma = require('../config/prisma');

const getProfile = async (userId) => {
  return prisma.user.findUnique({
    where: { id: userId },
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

module.exports = {
  getProfile
};