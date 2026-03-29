const authService = require('../services/authService');
const { issueTokens } = require('../services/tokenService');
const { logAudit } = require('../services/auditService');
const { verifyEmail, resendVerification } = require('../services/verificationService');
const { createPasswordReset, resetPassword } = require('../services/passwordResetService');
const bcrypt = require('bcrypt');
const { asyncHandler } = require('../utils/errors');
const { decodeOAuthState } = require('../utils/oauth');
const { ApiError } = require('../utils/errors');

const register = asyncHandler(async (req, res) => {
  const { email, password, tenantId, tenantName } = req.body;
  const ip = req.ip;

  const { user, verificationToken } = await authService.register({
    email,
    password,
    tenantId,
    tenantName,
    ip
  });

  return res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      isVerified: user.isVerified
    },
    message: 'Registration successful. Please verify your email to continue.',
    verificationToken
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password, deviceId } = req.body;
  const ip = req.ip;

  const { user, tokens } = await authService.login({
    email,
    password,
    deviceId,
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
  const accessToken = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;

  await authService.logout({
    refreshToken,
    accessToken,
    userId: req.user?.id || null,
    tenantId: req.user?.tenantId || null,
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
  const token = await resendVerification(email);
  return res.status(200).json({
    message: 'If the account exists, a verification email has been sent.',
    verificationToken: token || null
  });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const token = await createPasswordReset(email);
  return res.status(200).json({
    message: 'If the account exists, a reset email has been sent.',
    resetToken: token || null
  });
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
    throw new ApiError(401, 'Google authentication failed');
  }

  const tokens = await issueTokens({ user });
  await logAudit({
    userId: user.id,
    tenantId: user.tenantId,
    action: 'LOGIN',
    ip: req.ip
  });

  const state = decodeOAuthState(req.query.state);
  if (state.redirect) {
    const redirectUrl = new URL('/oauth-success', process.env.FRONTEND_URL || 'http://localhost:4000');
    redirectUrl.searchParams.set('accessToken', tokens.accessToken);
    redirectUrl.searchParams.set('refreshToken', tokens.refreshToken);
    return res.redirect(redirectUrl.toString());
  }

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

module.exports = {
  register,
  login,
  logout,
  refresh,
  verifyEmailHandler,
  resendVerificationHandler,
  forgotPassword,
  resetPasswordHandler,
  googleCallback
};
