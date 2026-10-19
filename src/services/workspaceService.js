const { z } = require('zod');
const prisma = require('../config/prisma');
const { ApiError } = require('../utils/errors');

const pageSchema = z.object({
  brandName: z.string().trim().min(2).max(60),
  headline: z.string().trim().min(2).max(100),
  description: z.string().trim().max(240),
  accent: z.enum(['violet', 'blue', 'emerald', 'rose']),
  layout: z.enum(['split', 'centered']),
  providers: z.array(z.enum(['google', 'github', 'facebook'])).max(3)
    .transform((items) => [...new Set(items)]),
  published: z.boolean()
}).strict();

function defaultPage(name) {
  return {
    brandName: name, headline: 'Welcome back.',
    description: 'Your next great idea starts here. Sign in to your workspace.',
    accent: 'violet', layout: 'split',
    providers: ['google', 'github', 'facebook'], published: false
  };
}

function canManage(user, tenant) {
  return user.tenantId === tenant.id && (user.id === tenant.ownerId || user.role === 'ADMIN');
}

function normalizedPageJson(page) {
  return JSON.stringify({
    brandName: page.brandName,
    headline: page.headline,
    description: page.description,
    accent: page.accent,
    layout: page.layout,
    providers: [...page.providers].sort(),
    published: page.published
  });
}

async function getWorkspace(user, db = prisma) {
  const tenant = await db.tenant.findUnique({
    where: { id: user.tenantId },
    select: { id: true, name: true, ownerId: true, loginPage: true }
  });
  if (!tenant) throw new ApiError(404, 'Workspace not found');
  return {
    tenant,
    canManage: canManage(user, tenant),
    page: tenant.loginPage || defaultPage(tenant.name),
    pageConfigured: Boolean(tenant.loginPage)
  };
}

async function savePage(user, input, db = prisma) {
  const page = pageSchema.parse(input);
  const workspace = await getWorkspace(user, db);
  if (!workspace.canManage) throw new ApiError(403, 'Only the workspace owner or platform administrator can publish this page.');
  await db.tenant.update({ where: { id: user.tenantId }, data: { loginPage: page } });
  return page;
}

module.exports = { pageSchema, defaultPage, canManage, getWorkspace, savePage, normalizedPageJson };
