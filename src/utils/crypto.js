const crypto = require('crypto');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const generateRandomKey = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

const getTimeToLiveSeconds = (expiresAt) => {
  const ttl = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  return ttl > 0 ? ttl : 0;
};

module.exports = {
  hashToken,
  generateRandomKey,
  getTimeToLiveSeconds
};