const express = require('express');
const { z } = require('zod');
const authenticate = require('../middleware/auth');
const validate = require('../middleware/validate');
const apiKeyController = require('../controllers/apiKeyController');
const { apiKeyValidateRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const createSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    services: z.array(z.string().min(1).max(64)).min(1).max(25),
    environment: z.enum(['DEVELOPMENT', 'PRODUCTION']).optional()
  })
});

const revokeSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  })
});

router.post('/', authenticate, validate(createSchema), apiKeyController.createApiKey);
router.get('/', authenticate, apiKeyController.listApiKeys);
router.get('/stats', authenticate, apiKeyController.getApiKeyStats);
router.post('/validate', apiKeyValidateRateLimiter, apiKeyController.validateApiKey);
router.delete('/:id', authenticate, validate(revokeSchema), apiKeyController.revokeApiKey);

module.exports = router;
