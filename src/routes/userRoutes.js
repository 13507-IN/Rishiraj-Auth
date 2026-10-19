const express = require('express');
const { z } = require('zod');
const authenticate = require('../middleware/auth');
const validate = require('../middleware/validate');
const userController = require('../controllers/userController');

const router = express.Router();

const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(100).optional()
  })
});

const changePasswordSchema = z.object({
  body: z.object({
    oldPassword: z.string().min(1).max(256).refine(
      (password) => Buffer.byteLength(password, 'utf8') <= 72,
      { message: 'Password must be no longer than 72 UTF-8 bytes' }
    ),
    newPassword: z.string().min(12).refine(
      (password) => Buffer.byteLength(password, 'utf8') <= 72,
      { message: 'Password must be no longer than 72 UTF-8 bytes' }
    )
  })
});

const revokeSessionSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  })
});

const auditLogsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
});

router.get('/profile', authenticate, userController.getProfile);
router.patch('/profile', authenticate, validate(updateProfileSchema), userController.updateProfile);
router.post('/change-password', authenticate, validate(changePasswordSchema), userController.changePassword);
router.get('/sessions', authenticate, userController.getSessionsList);
router.delete('/sessions/:id', authenticate, validate(revokeSessionSchema), userController.revokeSession);
router.get('/dashboard-stats', authenticate, userController.getDashboardStats);
router.get('/audit-logs', authenticate, validate(auditLogsSchema), userController.getAuditLogs);

module.exports = router;
