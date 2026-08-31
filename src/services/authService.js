const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const { ApiError } = require('../utils/errors');
const { issueTokens, rotateRefreshToken, revokeRefreshToken, blacklistAccessToken } = require('./tokenService');
const { logAudit } = require('./auditService');
const { createVerificationToken } = require('./verificationService');

const register = async ({ email, password, tenantId, tenantName, ip }) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ApiError(409, 'Email already registered');
  }

  let tenant = null;

  // Tenant resolution: use tenantId if provided, otherwise create or reuse by name.
  if (tenantId) {
    tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new ApiError(404, 'Tenant not found');
    }
  } else if (tenantName) {
    tenant = await prisma.tenant.upsert({
      where: { name: tenantName },
      update: {},
      create: { name: tenantName }
    });
  } else {
    throw new ApiError(400, 'Tenant ID or tenant name is required');
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      role: 'USER',
      tenantId: tenant.id,
      isVerified: false
    }
  });

  const tokenRes = await createVerificationToken(user);

  return { user, verificationToken: tokenRes?.token || null, previewUrl: tokenRes?.previewUrl || null };
};

const login = async ({ email, password, ip, deviceId }) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.password) {
    await logAudit({
      userId: user ? user.id : null,
      tenantId: user ? user.tenantId : null,
      action: 'FAILED_LOGIN',
      ip
    });
    throw new ApiError(401, 'Invalid credentials');
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    await logAudit({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'FAILED_LOGIN',
      ip
    });
    throw new ApiError(401, 'Invalid credentials');
  }

  if (!user.isVerified) {
    await logAudit({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'FAILED_LOGIN',
      ip
    });
    throw new ApiError(403, 'Email not verified');
  }

  await logAudit({
    userId: user.id,
    tenantId: user.tenantId,
    action: 'LOGIN',
    ip
  });

  const tokens = await issueTokens({ user, deviceId });

  return { user, tokens };
};

const logout = async ({ refreshToken, accessToken, userId, tenantId, ip }) => {
  await revokeRefreshToken(refreshToken);
  if (accessToken) {
    await blacklistAccessToken(accessToken);
  }

  await logAudit({
    userId,
    tenantId,
    action: 'LOGOUT',
    ip
  });
};

const refresh = async ({ refreshToken, deviceId }) => {
  const tokens = await rotateRefreshToken({ token: refreshToken, deviceId });
  return tokens;
};

module.exports = {
  register,
  login,
  logout,
  refresh
};
