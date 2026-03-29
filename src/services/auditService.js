const prisma = require('../config/prisma');

const logAudit = async ({ userId, tenantId, action, ip }) => {
  return prisma.auditLog.create({
    data: {
      userId: userId || null,
      tenantId: tenantId || null,
      action,
      ip: ip || null
    }
  });
};

module.exports = {
  logAudit
};