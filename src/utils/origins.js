const env = require('../config/env');

const normalizeOrigin = (value) => {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.origin;
  } catch (_err) {
    return null;
  }
};

const configuredOrigins = () => {
  const origins = new Set();
  if (env.ALLOWED_ORIGINS !== '*') {
    for (const value of env.ALLOWED_ORIGINS.split(',')) {
      const origin = normalizeOrigin(value.trim());
      if (origin) origins.add(origin);
    }
  }
  const frontendOrigin = normalizeOrigin(env.FRONTEND_URL);
  if (frontendOrigin) origins.add(frontendOrigin);
  return origins;
};

const isAllowedClientOrigin = (value) => {
  const origin = normalizeOrigin(value);
  return Boolean(origin && configuredOrigins().has(origin));
};

module.exports = {
  normalizeOrigin,
  configuredOrigins,
  isAllowedClientOrigin
};
