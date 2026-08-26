const express = require('express');
const { z } = require('zod');
const authController = require('../controllers/authController');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/auth');
const { authRateLimiter } = require('../middleware/rateLimiter');
const env = require('../config/env');
const { passport } = require('../config/passport');
const { encodeOAuthState } = require('../utils/oauth');

const router = express.Router();

const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    tenantId: z.string().uuid().optional(),
    tenantName: z.string().min(2).optional()
  }).refine((data) => data.tenantId || data.tenantName, {
    message: 'tenantId or tenantName is required'
  })
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    deviceId: z.string().optional()
  })
});

const logoutSchema = z.object({
  body: z.object({
    refreshToken: z.string().optional()
  })
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string(),
    deviceId: z.string().optional()
  })
});

const verifyEmailSchema = z.object({
  body: z.object({
    token: z.string().min(10)
  })
});

const resendSchema = z.object({
  body: z.object({
    email: z.string().email()
  })
});

const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email()
  })
});

const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(10),
    newPassword: z.string().min(8)
  })
});

const verifyTokenSchema = z.object({
  body: z.object({
    token: z.string().optional()
  }).optional()
});

router.post('/register', authRateLimiter, validate(registerSchema), authController.register);
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);
router.post('/logout', authenticate, validate(logoutSchema), authController.logout);
router.post('/refresh-token', validate(refreshSchema), authController.refresh);
router.post('/verify-email', validate(verifyEmailSchema), authController.verifyEmailHandler);
router.post('/resend-verification', authRateLimiter, validate(resendSchema), authController.resendVerificationHandler);
router.post('/forgot-password', authRateLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', authRateLimiter, validate(resetPasswordSchema), authController.resetPasswordHandler);
router.post('/verify-token', validate(verifyTokenSchema), authController.verifyToken);

router.get('/google', (req, res, next) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ message: 'Google OAuth is not configured' });
  }

  const state = encodeOAuthState({
    tenantId: req.query.tenantId,
    redirect: req.query.redirect === 'true'
  });

  return passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    state
  })(req, res, next);
});

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/oauth-failed' }),
  authController.googleCallback
);

module.exports = router;
