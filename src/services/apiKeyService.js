const prisma = require('../config/prisma');
const { generateRandomKey, hashToken } = require('../utils/crypto');

const createApiKey = async ({ userId, tenantId, name, services }) => {
  // Return raw key once; store only hashed value.
  const rawKey = generateRandomKey(32);
  const hashedKey = hashToken(rawKey);
  const last4 = rawKey.slice(-4);

  const record = await prisma.apiKey.create({
    data: {
      key: hashedKey,
      name,
      services,
      last4,
      userId,
      tenantId
    }
  });

  return { apiKey: rawKey, id: record.id, last4: record.last4 };
};

const listApiKeys = async ({ userId, tenantId }) => {
  return prisma.apiKey.findMany({
    where: {
      userId,
      tenantId
    },
    select: {
      id: true,
      name: true,
      services: true,
      last4: true,
      createdAt: true,
      revokedAt: true
    },
    orderBy: { createdAt: 'desc' }
  });
};

const validateApiKey = async (rawKey) => {
  if (!rawKey) {
    return { valid: false };
  }

  const hashedKey = hashToken(rawKey);
  const record = await prisma.apiKey.findUnique({
    where: { key: hashedKey }
  });

  if (!record || record.revokedAt) {
    return { valid: false };
  }

  return {
    valid: true,
    keyId: record.id,
    name: record.name,
    userId: record.userId,
    tenantId: record.tenantId,
    services: record.services,
    last4: record.last4,
    createdAt: record.createdAt
  };
};

module.exports = {
  createApiKey,
  listApiKeys,
  validateApiKey
};
