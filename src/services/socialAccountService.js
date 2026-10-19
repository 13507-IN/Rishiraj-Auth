const prisma = require('../config/prisma');
const { ApiError } = require('../utils/errors');

// Never merge accounts by a display name or provider-supplied email.
async function resolveSocialAccount(provider, subject, state, db = prisma) {
  if (!state || state.provider !== provider || typeof subject !== 'string' || !subject || subject.length > 255) {
    throw new ApiError(400, 'Invalid sign-in transaction. Please start again.');
  }
  const identity = await db.socialAccount.findUnique({
    where: { provider_subject: { provider, subject } }
  });
  let user;
  if (state.linkUserId) {
    user = await db.user.findUnique({ where: { id: state.linkUserId } });
    if (!user || !user.isVerified || user.tokenVersion !== state.linkVersion || user.tenantId !== state.tenantId) {
      throw new ApiError(401, 'Your session changed. Sign in again before connecting an account.');
    }
    if (identity && identity.userId !== user.id) {
      throw new ApiError(409, 'This provider account is already connected to another account.');
    }
    if (!identity) {
      try {
        await db.socialAccount.create({ data: { provider, subject, userId: user.id } });
      } catch (error) {
        if (error.code === 'P2002') throw new ApiError(409, 'An account is already connected. Refresh and try again.');
        throw error;
      }
    }
  } else {
    if (!identity) {
      throw new ApiError(403, 'First sign in with email, then connect this provider in Get started → Sign-in methods.');
    }
    user = await db.user.findUnique({ where: { id: identity.userId } });
    if (!user?.isVerified) throw new ApiError(401, 'Verify your account email before signing in.');
    if (state.tenantId && user.tenantId !== state.tenantId) {
      throw new ApiError(403, 'This account belongs to a different workspace.');
    }
  }
  return { id: user.id, tenantId: user.tenantId };
}

module.exports = { resolveSocialAccount };
