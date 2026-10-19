const express = require('express');
const { z } = require('zod');
const authenticate = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authRateLimiter } = require('../middleware/rateLimiter');
const { getWorkspace, savePage, pageSchema } = require('../services/workspaceService');
const { publicProviders, providerConfig } = require('../config/providers');
const prisma = require('../config/prisma');
const env = require('../config/env');

const router = express.Router();

router.get('/pages/:tenantId', validate(z.object({ params: z.object({ tenantId: z.string().uuid() }) })), asyncHandler(async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.params.tenantId }, select: { loginPage: true }
  });
  if (!tenant?.loginPage?.published) throw new ApiError(404, 'This sign-in page has not been published.');
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    page: tenant.loginPage,
    providers: publicProviders().filter((item) => item.configured && tenant.loginPage.providers.includes(item.id))
  });
}));

router.use(authenticate);
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.get('/setup', asyncHandler(async (req, res) => {
  const workspace = await getWorkspace(req.user);
  const accounts = await prisma.socialAccount.findMany({ where: { userId: req.user.id }, select: { provider: true } });
  res.json({
    workspace: { id: workspace.tenant.id, name: workspace.tenant.name },
    canManage: workspace.canManage,
    page: workspace.page,
    pageConfigured: workspace.pageConfigured,
    database: { engine: 'PostgreSQL', connected: true, mode: 'server-managed' },
    providers: publicProviders().map((item) => {
      const config = providerConfig(item.id);
      return {
        ...item, linked: accounts.some((account) => account.provider === item.id),
        callbackURL: config.callbackURL || `${env.FRONTEND_URL}/auth/${item.id}/callback`,
        docs: config.docs, console: config.console
      };
    })
  });
}));
router.put('/page', authRateLimiter, validate(z.object({ body: pageSchema })), asyncHandler(async (req, res) => {
  res.json({ page: await savePage(req.user, req.body) });
}));

module.exports = router;
