const express = require('express');
const { z } = require('zod');
const authController = require('../controllers/authController');
const validate = require('../middleware/validate');
const {
  authRateLimiter,
  loginRateLimiter,
  recoveryRateLimiter
} = require('../middleware/rateLimiter');
const env = require('../config/env');
const { passport } = require('../config/passport');
const { createOAuthState, decodeOAuthState, parseCookie } = require('../utils/oauth');
const { normalizeOrigin, isAllowedClientOrigin } = require('../utils/origins');
const { ApiError } = require('../utils/errors');
const { asyncHandler } = require('../utils/errors');
const authenticate = require('../middleware/auth');
const prisma = require('../config/prisma');
const { providers, providerConfig, publicProviders } = require('../config/providers');

const router = express.Router();
const OAUTH_NONCE_COOKIE = 'rishiraj_oauth_nonce';
const newPasswordSchema = z.string().min(12).refine(
  (password) => Buffer.byteLength(password, 'utf8') <= 72,
  { message: 'Password must be no longer than 72 UTF-8 bytes' }
);
const loginPasswordSchema = z.string().min(1).max(256).refine(
  (password) => Buffer.byteLength(password, 'utf8') <= 72,
  { message: 'Password must be no longer than 72 UTF-8 bytes' }
);

const registerSchema = z.object({
  body: z.object({
    email: z.string().max(254).email().transform((email) => email.trim().toLowerCase()),
    password: newPasswordSchema,
    tenantId: z.string().uuid().optional(),
    tenantName: z.string().trim().min(2).max(100).optional(),
    inviteToken: z.string().min(40).max(100).optional()
  }).refine((data) => data.inviteToken || data.tenantName || data.tenantId, {
    message: 'A workspace name or invitation token is required'
  })
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().max(254).email().transform((email) => email.trim().toLowerCase()),
    password: loginPasswordSchema,
    deviceId: z.string().max(128).optional(),
    tenantId: z.string().uuid().optional()
  })
});

const logoutSchema = z.object({
  body: z.object({
    refreshToken: z.string().max(2048).optional()
  })
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string(),
    deviceId: z.string().max(128).optional()
  })
});

const verifyEmailSchema = z.object({
  body: z.object({
    token: z.string().min(10).max(256)
  })
});

const resendSchema = z.object({
  body: z.object({
    email: z.string().max(254).email().transform((email) => email.trim().toLowerCase())
  })
});

const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().max(254).email().transform((email) => email.trim().toLowerCase())
  })
});

const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(10).max(256),
    newPassword: newPasswordSchema
  })
});

const verifyTokenSchema = z.object({
  body: z.object({
    token: z.string().optional()
  }).optional()
});

const oauthExchangeSchema = z.object({
  body: z.object({
    code: z.string().min(40).max(100)
  })
});

const setNonceCookie = (res, nonce) => {
  const parts = [
    `${OAUTH_NONCE_COOKIE}=${encodeURIComponent(nonce)}`,
    'Path=/auth',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=300'
  ];
  if (env.IS_PRODUCTION) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
};

const clearNonceCookie = (res) => {
  const parts = [
    `${OAUTH_NONCE_COOKIE}=`,
    'Path=/auth',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (env.IS_PRODUCTION) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
};

const validateOAuthTransaction = (req, res, next) => {
  const nonce = parseCookie(req.headers.cookie, OAUTH_NONCE_COOKIE);
  const state = nonce && decodeOAuthState(req.query.state, nonce);
  if (!state || state.provider !== req.oauthProvider) {
    clearNonceCookie(res);
    return next(new ApiError(400, 'Invalid or expired OAuth transaction'));
  }
  clearNonceCookie(res);
  req.oauthState = state;
  return next();
};

router.post('/register', authRateLimiter, validate(registerSchema), authController.register);
router.post('/login', loginRateLimiter, validate(loginSchema), authController.login);
router.post('/logout', validate(logoutSchema), authController.logout);
router.post('/refresh-token', authRateLimiter, validate(refreshSchema), authController.refresh);
router.post('/verify-email', recoveryRateLimiter, validate(verifyEmailSchema), authController.verifyEmailHandler);
router.post('/resend-verification', recoveryRateLimiter, validate(resendSchema), authController.resendVerificationHandler);
router.post('/forgot-password', recoveryRateLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', recoveryRateLimiter, validate(resetPasswordSchema), authController.resetPasswordHandler);
router.post('/verify-token', authRateLimiter, validate(verifyTokenSchema), authController.verifyToken);
router.post('/oauth/exchange', authRateLimiter, validate(oauthExchangeSchema), authController.exchangeOAuth);

router.get('/providers', (_req, res) => res.json({ providers: publicProviders() }));

for (const provider of Object.keys(providers)) {
  const config = providerConfig(provider);
  const requireConfigured = (_req, res, next) => {
    if (!config.clientID || !config.clientSecret || !config.callbackURL) {
      return res.status(503).json({ message: `${config.name} is not configured. Open Get started → Sign-in methods for setup.` });
    }
    next();
  };
  router.post(`/providers/${provider}/link`, loginRateLimiter, authenticate, requireConfigured, asyncHandler(async (req, res) => {
    const clientOrigin = normalizeOrigin(req.get('origin'));
    if (!clientOrigin || !isAllowedClientOrigin(clientOrigin)) throw new ApiError(403, 'Untrusted application origin');
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { tokenVersion: true } });
    const { state, nonce } = createOAuthState({
      provider, clientOrigin, tenantId: req.user.tenantId,
      linkUserId: req.user.id, linkVersion: user.tokenVersion
    });
    setNonceCookie(res, nonce);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ url: `/auth/${provider}?linkState=${encodeURIComponent(state)}` });
  }));

  router.get(`/${provider}`, loginRateLimiter, requireConfigured, asyncHandler(async (req, res, next) => {
    let signedState;
    let state;
    if (req.query.linkState) {
      state = decodeOAuthState(req.query.linkState, parseCookie(req.headers.cookie, OAUTH_NONCE_COOKIE));
      if (!state?.linkUserId || state.provider !== provider) {
        throw new ApiError(400, 'Invalid connection request');
      }
      signedState = req.query.linkState;
    } else {
      const clientOrigin = normalizeOrigin(req.query.clientOrigin || env.FRONTEND_URL);
      if (!clientOrigin || !isAllowedClientOrigin(clientOrigin)) {
        throw new ApiError(400, 'This application origin is not allowed for sign-in');
      }
      const tenantId = req.query.tenantId || undefined;
      if (tenantId !== undefined && !z.string().uuid().safeParse(tenantId).success) {
        throw new ApiError(400, 'Invalid workspace ID');
      }
      const created = createOAuthState({ provider, tenantId, clientOrigin });
      state = decodeOAuthState(created.state);
      signedState = created.state;
      setNonceCookie(res, created.nonce);
    }
    if (state.tenantId && !state.linkUserId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: state.tenantId }, select: { loginPage: true }
      });
      if (tenant?.loginPage?.published && !tenant.loginPage.providers.includes(provider)) {
        throw new ApiError(403, `${config.name} sign-in is turned off for this workspace.`);
      }
    }
    res.setHeader('Referrer-Policy', 'no-referrer');
    return passport.authenticate(provider, { scope: config.scope, session: false, state: signedState })(req, res, next);
  }));
  router.get(`/${provider}/callback`, requireConfigured,
    (req, _res, next) => { req.oauthProvider = provider; next(); },
    validateOAuthTransaction,
    (req, res, next) => passport.authenticate(provider, { session: false }, (error, user) => {
      if (error || !user) {
        const message = error instanceof ApiError ? error.message : 'Sign-in was cancelled or the provider could not be reached. Please try again.';
        return res.redirect(`/oauth-failed#${new URLSearchParams({ message, targetOrigin: req.oauthState.clientOrigin })}`);
      }
      req.user = user;
      return authController.googleCallback(req, res, next);
    })(req, res, next)
  );
}

module.exports = router;
