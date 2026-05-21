const express = require('express');
const { z } = require('zod');
const authenticate = require('../middleware/auth');
const validate = require('../middleware/validate');
const apiKeyController = require('../controllers/apiKeyController');

const router = express.Router();

const createSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    services: z.array(z.string().min(1)).min(1),
    environment: z.enum(['DEVELOPMENT', 'PRODUCTION']).optional()
  })
});

router.post('/', authenticate, validate(createSchema), apiKeyController.createApiKey);
router.get('/', authenticate, apiKeyController.listApiKeys);
router.get('/stats', authenticate, apiKeyController.getApiKeyStats);
router.post('/validate', apiKeyController.validateApiKey);
router.delete('/:id', authenticate, apiKeyController.revokeApiKey);

module.exports = router;
