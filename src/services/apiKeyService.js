const prisma = require('../config/prisma');
const { generateRandomKey, hashToken } = require('../utils/crypto');
const { ApiError } = require('../utils/errors');

const createApiKey = async ({ userId, tenantId, name, services, environment }) => {
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
      tenantId,
      environment: environment || 'PRODUCTION'
    }
  });

  return { apiKey: rawKey, id: record.id, last4: record.last4 };
};

const listApiKeys = async ({ userId, tenantId, environment }) => {
  const where = { userId, tenantId };
  if (environment) {
    where.environment = environment;
  }

  return prisma.apiKey.findMany({
    where,
    select: {
      id: true,
      name: true,
      services: true,
      last4: true,
      environment: true,
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

const revokeApiKey = async (id, userId, tenantId) => {
  const record = await prisma.apiKey.findFirst({
    where: { id, userId, tenantId }
  });

  if (!record) {
    throw new ApiError(404, 'API key not found');
  }

  if (record.revokedAt) {
    throw new ApiError(400, 'API key is already revoked');
  }

  return prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() }
  });
};

const getApiKeyStats = async (userId, tenantId) => {
  const keys = await prisma.apiKey.findMany({
    where: { userId, tenantId },
    select: { environment: true, revokedAt: true }
  });

  const stats = {
    total: keys.length,
    active: keys.filter(k => !k.revokedAt).length,
    revoked: keys.filter(k => k.revokedAt).length,
    development: keys.filter(k => k.environment === 'DEVELOPMENT').length,
    production: keys.filter(k => k.environment === 'PRODUCTION').length
  };

  return stats;
};

module.exports = {
  createApiKey,
  listApiKeys,
  validateApiKey,
  revokeApiKey,
  getApiKeyStats
};
