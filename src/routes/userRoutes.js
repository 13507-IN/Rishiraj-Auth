const express = require('express');
const { z } = require('zod');
const authenticate = require('../middleware/auth');
const validate = require('../middleware/validate');
const userController = require('../controllers/userController');

const router = express.Router();

const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional()
  })
});

const changePasswordSchema = z.object({
  body: z.object({
    oldPassword: z.string().min(8),
    newPassword: z.string().min(8)
  })
});

router.get('/profile', authenticate, userController.getProfile);
router.patch('/profile', authenticate, validate(updateProfileSchema), userController.updateProfile);
router.post('/change-password', authenticate, validate(changePasswordSchema), userController.changePassword);
router.get('/sessions', authenticate, userController.getSessionsList);
router.delete('/sessions/:id', authenticate, userController.revokeSession);
router.get('/dashboard-stats', authenticate, userController.getDashboardStats);
router.get('/audit-logs', authenticate, userController.getAuditLogs);

module.exports = router;