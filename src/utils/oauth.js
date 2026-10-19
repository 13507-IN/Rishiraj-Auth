const crypto = require('crypto');
const env = require('../config/env');

const STATE_TTL_SECONDS = 5 * 60;
const stateSecret = env.OAUTH_STATE_SECRET || crypto
  .createHmac('sha256', env.JWT_ACCESS_SECRET)
  .update('rishiraj-auth-oauth-state-key-v1')
  .digest();

const safeEqual = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const signatureFor = (encodedPayload) => crypto
  .createHmac('sha256', stateSecret)
  .update(`rishiraj-auth-oauth-state-v1.${encodedPayload}`)
  .digest('base64url');

const createOAuthState = (state = {}) => {
  const payload = {
    version: 1,
    tenantId: state.tenantId,
    provider: state.provider,
    linkUserId: state.linkUserId,
    linkVersion: state.linkVersion,
    clientOrigin: state.clientOrigin,
    redirect: state.redirect === true,
    nonce: crypto.randomBytes(32).toString('base64url'),
    expiresAt: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  return {
    state: `${encodedPayload}.${signatureFor(encodedPayload)}`,
    nonce: payload.nonce
  };
};

const decodeOAuthState = (state, expectedNonce) => {
  if (typeof state !== 'string' || state.length > 4096) return null;
  const parts = state.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  if (!safeEqual(signature, signatureFor(encodedPayload))) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (
      payload.version !== 1 ||
      typeof payload.nonce !== 'string' ||
      payload.nonce.length < 40 ||
      typeof payload.clientOrigin !== 'string' ||
      payload.clientOrigin.length > 2048 ||
      (payload.tenantId !== undefined && typeof payload.tenantId !== 'string') ||
      !Number.isInteger(payload.expiresAt) ||
      payload.expiresAt <= now ||
      payload.expiresAt > now + STATE_TTL_SECONDS + 5
    ) {
      return null;
    }
    if (expectedNonce !== undefined && !safeEqual(payload.nonce, expectedNonce)) return null;
    return payload;
  } catch (_err) {
    return null;
  }
};

const parseCookie = (cookieHeader, name) => {
  if (!cookieHeader) return null;
  const prefix = `${name}=`;
  const item = cookieHeader.split(';').map((value) => value.trim()).find((value) => value.startsWith(prefix));
  if (!item) return null;
  try {
    return decodeURIComponent(item.slice(prefix.length));
  } catch (_err) {
    return null;
  }
};

module.exports = {
  STATE_TTL_SECONDS,
  createOAuthState,
  decodeOAuthState,
  parseCookie
};
