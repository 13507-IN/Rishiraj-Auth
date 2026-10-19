const authService = require('../services/authService');
const { logAudit } = require('../services/auditService');
const { verifyEmail, resendVerification } = require('../services/verificationService');
const { createPasswordReset, resetPassword } = require('../services/passwordResetService');
const bcrypt = require('bcrypt');
const { asyncHandler, ApiError } = require('../utils/errors');
const { decodeOAuthState } = require('../utils/oauth');
const { createOAuthExchangeCode, exchangeOAuthCode } = require('../services/oauthExchangeService');
const env = require('../config/env');
const { verifyAccessToken } = require('../utils/tokens');
const prisma = require('../config/prisma');
const { safeGet, isRedisReady } = require('../config/redis');

const register = asyncHandler(async (req, res) => {
  const { email, password, tenantId, tenantName, inviteToken } = req.body;
  const ip = req.ip;

  const { user, verificationToken, previewUrl } = await authService.register({
    email,
    password,
    tenantId,
    tenantName,
    inviteToken,
    ip
  });

  const response = {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      isVerified: user.isVerified
    },
    message: 'Registration successful. Please verify your email to continue.'
  };
  if (env.DEV_AUTH_TOKENS) {
    response.verificationToken = verificationToken;
    response.previewUrl = previewUrl || null;
  }
  return res.status(201).json(response);
});

const login = asyncHandler(async (req, res) => {
  const { email, password, deviceId, tenantId } = req.body;
  const ip = req.ip;

  const { user, tokens } = await authService.login({
    email,
    password,
    deviceId,
    tenantId,
    ip
  });

  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId
    },
    tokens
  });
});

const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const authHeader = req.headers.authorization || '';
  const candidateAccessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  let accessToken = null;
  let accessPayload = null;
  if (candidateAccessToken) {
    try {
      accessPayload = verifyAccessToken(candidateAccessToken);
      if (accessPayload.type === 'access') accessToken = candidateAccessToken;
    } catch (_error) {
      // A valid refresh token can still revoke an expired access-token session.
    }
  }
  if (!refreshToken && !accessToken) {
    throw new ApiError(400, 'A valid access token or refresh token is required');
  }

  await authService.logout({
    refreshToken,
    accessToken,
    userId: accessPayload?.sub || null,
    tenantId: accessPayload?.tenantId || null,
    ip: req.ip
  });

  return res.status(200).json({ message: 'Logged out successfully' });
});

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken, deviceId } = req.body;
  if (!refreshToken) {
    throw new ApiError(400, 'Refresh token is required');
  }

  const tokens = await authService.refresh({ refreshToken, deviceId });

  return res.status(200).json({ tokens });
});

const verifyEmailHandler = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const user = await verifyEmail(token);
  return res.status(200).json({ message: 'Email verified successfully', userId: user.id });
});

const resendVerificationHandler = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const result = await resendVerification(email);
  const response = {
    message: 'If the account exists, a verification email has been sent.',
  };
  if (env.DEV_AUTH_TOKENS) {
    response.verificationToken = result?.token || null;
    response.previewUrl = result?.previewUrl || null;
  }
  return res.status(200).json(response);
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const result = await createPasswordReset(email);
  const response = {
    message: 'If the account exists, a reset email has been sent.',
  };
  if (env.DEV_AUTH_TOKENS) {
    response.resetToken = result?.token || null;
    response.previewUrl = result?.previewUrl || null;
  }
  return res.status(200).json(response);
});

const resetPasswordHandler = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  const newPasswordHash = await bcrypt.hash(newPassword, 12);
  await resetPassword({ token, newPasswordHash });
  return res.status(200).json({ message: 'Password reset successfully' });
});

const googleCallback = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new ApiError(401, 'Social sign-in failed');
  }

  const state = decodeOAuthState(req.query.state);
  if (!state || !state.clientOrigin) {
    throw new ApiError(400, 'Invalid OAuth transaction');
  }

  await logAudit({
    userId: user.id,
    tenantId: user.tenantId,
    action: 'LOGIN',
    ip: req.ip
  });

  const code = await createOAuthExchangeCode({
    userId: user.id,
    clientOrigin: state.clientOrigin
  });
  const serviceOrigin = new URL(require('../config/providers').providerConfig(state.provider).callbackURL).origin;
  const redirectUrl = new URL('/oauth-success', serviceOrigin);
  redirectUrl.searchParams.set('targetOrigin', state.clientOrigin);
  redirectUrl.hash = `code=${encodeURIComponent(code)}`;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  return res.redirect(303, redirectUrl.toString());
});

const exchangeOAuth = asyncHandler(async (req, res) => {
  const clientOrigin = req.get('origin');
  if (!clientOrigin) {
    throw new ApiError(400, 'OAuth exchange requires a browser origin');
  }
  const { user, tokens } = await exchangeOAuthCode({
    code: req.body.code,
    clientOrigin
  });

  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      tenantId: user.tenantId
    },
    tokens
  });
});

const verifyToken = asyncHandler(async (req, res) => {
  // Accept token from body OR Authorization header
  const authHeader = req.headers.authorization || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const rawToken = req.body?.token || headerToken;

  if (!rawToken) {
    return res.status(200).json({
      valid: false,
      error: 'Token is required. Send as { "token": "..." } in body or Authorization: Bearer header.'
    });
  }

  let payload;
  try {
    payload = verifyAccessToken(rawToken);
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Token has expired'
      : err.name === 'JsonWebTokenError'
        ? 'Invalid token signature'
        : 'Token verification failed';
    return res.status(200).json({ valid: false, error: message });
  }

  if (!payload?.sub || !payload?.jti || payload.type !== 'access') {
    return res.status(200).json({ valid: false, error: 'Malformed access token' });
  }
  if (env.REDIS_REQUIRED && !isRedisReady()) {
    return res.status(503).json({ valid: false, error: 'Token revocation service is unavailable' });
  }
  if (await safeGet(`bl:${payload.jti}`)) {
    return res.status(200).json({ valid: false, error: 'Token has been revoked' });
  }

  // Treat this endpoint as an authorization check, not only a JWT decoder.
  // If the database is unavailable, the request fails instead of trusting stale claims.
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      role: true,
      tenantId: true,
      isVerified: true,
      tokenVersion: true
    }
  });
  if (
    !user ||
    !user.isVerified ||
    payload.role !== user.role ||
    payload.tenantId !== user.tenantId ||
    payload.ver !== user.tokenVersion
  ) {
    return res.status(200).json({ valid: false, error: 'Account or permissions are no longer valid' });
  }

  return res.status(200).json({
    valid: true,
    user: {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role
    },
    expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null
  });
});

module.exports = {
  register,
  login,
  logout,
  refresh,
  verifyEmailHandler,
  resendVerificationHandler,
  forgotPassword,
  resetPasswordHandler,
  googleCallback,
  exchangeOAuth,
  verifyToken
};
