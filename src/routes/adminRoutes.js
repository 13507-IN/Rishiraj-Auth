const express = require('express');
const { z } = require('zod');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/rbac');
const validate = require('../middleware/validate');
const adminController = require('../controllers/adminController');

const router = express.Router();

const createTenantSchema = z.object({
  body: z.object({
    name: z.string().min(2)
  })
});

const listUsersSchema = z.object({
  query: z.object({
    tenantId: z.string().uuid().optional()
  })
});

const updateUserRoleSchema = z.object({
  params: z.object({
    userId: z.string().uuid()
  }),
  body: z.object({
    role: z.enum(['USER', 'ADMIN'])
  })
});

const updateUserTenantSchema = z.object({
  params: z.object({
    userId: z.string().uuid()
  }),
  body: z.object({
    tenantId: z.string().uuid()
  })
});

router.get('/dashboard', authenticate, authorizeRoles('ADMIN'), adminController.getDashboard);
router.get('/tenants', authenticate, authorizeRoles('ADMIN'), adminController.listTenants);
router.post('/tenants', authenticate, authorizeRoles('ADMIN'), validate(createTenantSchema), adminController.createTenant);
router.get('/users', authenticate, authorizeRoles('ADMIN'), validate(listUsersSchema), adminController.listUsers);
router.patch('/users/:userId/role', authenticate, authorizeRoles('ADMIN'), validate(updateUserRoleSchema), adminController.updateUserRole);
router.patch('/users/:userId/tenant', authenticate, authorizeRoles('ADMIN'), validate(updateUserTenantSchema), adminController.updateUserTenant);

module.exports = router;
