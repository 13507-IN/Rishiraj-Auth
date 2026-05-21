const { asyncHandler } = require('../utils/errors');
const apiKeyService = require('../services/apiKeyService');

const createApiKey = asyncHandler(async (req, res) => {
  const { name, services, environment } = req.body;
  const result = await apiKeyService.createApiKey({
    userId: req.user.id,
    tenantId: req.user.tenantId,
    name,
    services,
    environment: environment || req.query.environment
  });

  return res.status(201).json({
    message: 'API key created. This is the only time you will see the raw key.',
    apiKey: result.apiKey,
    id: result.id,
    last4: result.last4
  });
});

const listApiKeys = asyncHandler(async (req, res) => {
  const keys = await apiKeyService.listApiKeys({
    userId: req.user.id,
    tenantId: req.user.tenantId,
    environment: req.query.environment
  });

  return res.status(200).json({ keys });
});

const validateApiKey = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const headerKey = req.headers['x-api-key'];
  const bodyKey = req.body ? req.body.apiKey : null;

  const rawKey = bearer || headerKey || bodyKey;
  const result = await apiKeyService.validateApiKey(rawKey);

  return res.status(200).json(result);
});

const revokeApiKey = asyncHandler(async (req, res) => {
  await apiKeyService.revokeApiKey(req.params.id, req.user.id, req.user.tenantId);
  return res.status(200).json({ message: 'API key revoked successfully' });
});

const getApiKeyStats = asyncHandler(async (req, res) => {
  const stats = await apiKeyService.getApiKeyStats(req.user.id, req.user.tenantId);
  return res.status(200).json({ stats });
});

module.exports = {
  createApiKey,
  listApiKeys,
  validateApiKey,
  revokeApiKey,
  getApiKeyStats
};
