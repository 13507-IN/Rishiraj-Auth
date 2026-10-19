const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test';
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough';
process.env.OAUTH_STATE_SECRET = 'test-oauth-state-secret-that-is-long-enough';

const { resolveSocialAccount } = require('../src/services/socialAccountService');
const { savePage, getWorkspace, normalizedPageJson } = require('../src/services/workspaceService');

const user = {
  id: 'user-1', tenantId: 'workspace-1', tokenVersion: 3,
  isVerified: true, role: 'USER'
};
const linkedState = {
  provider: 'github', tenantId: user.tenantId,
  linkUserId: user.id, linkVersion: user.tokenVersion
};

test('linking a provider never matches an account by an unverified provider email', async () => {
  const db = {
    socialAccount: { findUnique: async () => null },
    user: { findUnique: async () => user }
  };
  await assert.rejects(
    resolveSocialAccount('github', 'provider-id', { provider: 'github' }, db),
    /First sign in with email/
  );
});

test('provider account linking requires the same verified account and current token version', async () => {
  let linked = false;
  const db = {
    socialAccount: {
      findUnique: async () => null,
      create: async ({ data }) => { linked = data.userId === user.id && data.subject === 'provider-id'; }
    },
    user: { findUnique: async () => user }
  };
  const account = await resolveSocialAccount('github', 'provider-id', linkedState, db);
  assert.deepEqual(account, { id: user.id, tenantId: user.tenantId });
  assert.equal(linked, true);

  await assert.rejects(
    resolveSocialAccount('github', 'provider-id', { ...linkedState, linkVersion: 2 }, db),
    /session changed/
  );
});

test('a provider account already attached to another user cannot be claimed', async () => {
  const db = {
    socialAccount: { findUnique: async () => ({ userId: 'some-other-user' }) },
    user: { findUnique: async () => user }
  };
  await assert.rejects(
    resolveSocialAccount('github', 'provider-id', linkedState, db),
    /already connected to another account/
  );
});

test('sign-in page settings are owner-managed and constrained to safe editor fields', async () => {
  const tenant = { id: user.tenantId, name: 'Example', ownerId: user.id, loginPage: null };
  let persisted;
  const db = {
    tenant: {
      findUnique: async () => tenant,
      update: async ({ data }) => { persisted = data.loginPage; }
    }
  };
  const page = {
    brandName: 'Example', headline: 'Hello there', description: 'Welcome in.',
    accent: 'violet', layout: 'centered', providers: ['google', 'github'], published: true
  };
  assert.deepEqual(await savePage(user, page, db), page);
  assert.deepEqual(persisted, page);

  await assert.rejects(
    savePage({ ...user, id: 'another-user' }, page, {
      tenant: { findUnique: async () => tenant }
    }),
    /workspace owner/
  );
  await assert.rejects(savePage(user, { ...page, accent: 'url(https://attacker.test)' }, db));
  await assert.rejects(savePage(user, { ...page, script: '<script>' }, db));
});

test('provider ordering does not make saved sign-in pages appear edited', () => {
  const first = {
    brandName: 'Example', headline: 'Hello', description: '',
    accent: 'violet', layout: 'split', providers: ['google', 'github'], published: true
  };
  const second = { ...first, providers: ['github', 'google'] };
  assert.equal(normalizedPageJson(first), normalizedPageJson(second));
});

test('Google, GitHub and Facebook Passport strategies can all be configured together', () => {
  const child = spawnSync(process.execPath, ['-e', `
    const passport = require('passport');
    require('./src/config/passport').configurePassport();
    for (const name of ['google', 'github', 'facebook']) {
      if (!passport._strategy(name)) throw new Error(name + ' strategy missing');
    }
    if (passport._strategy('facebook')._profileURL !== 'https://graph.facebook.com/v26.0/me') {
      throw new Error('Facebook Graph API version was not configured');
    }
    process.stdout.write('all three providers configured');
  `], {
    cwd: require('node:path').join(__dirname, '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
      REDIS_URL: 'redis://127.0.0.1:6379',
      JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough',
      JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough',
      OAUTH_STATE_SECRET: 'test-oauth-state-secret-that-is-long-enough',
      GOOGLE_CLIENT_ID: 'google-id',
      GOOGLE_CLIENT_SECRET: 'google-secret',
      GOOGLE_CALLBACK_URL: 'http://localhost:4000/auth/google/callback',
      GITHUB_CLIENT_ID: 'github-id',
      GITHUB_CLIENT_SECRET: 'github-secret',
      GITHUB_CALLBACK_URL: 'http://localhost:4000/auth/github/callback',
      FACEBOOK_CLIENT_ID: 'facebook-id',
      FACEBOOK_CLIENT_SECRET: 'facebook-secret',
      FACEBOOK_CALLBACK_URL: 'http://localhost:4000/auth/facebook/callback'
    }
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'all three providers configured');
});
