const Redis = require('ioredis');
const env = require('./env');

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true
});

let redisReady = false;
let lastErrorLogAt = 0;
const ERROR_LOG_COOLDOWN_MS = 15000;

redis.on('ready', () => {
  redisReady = true;
  console.log('Redis connected');
});

redis.on('end', () => {
  redisReady = false;
});

redis.on('error', (_err) => {
  redisReady = false;
  if (env.REDIS_REQUIRED) {
    console.error('Redis is unavailable; dependent auth features will fail closed.');
    return;
  }

  const now = Date.now();
  if (now - lastErrorLogAt > ERROR_LOG_COOLDOWN_MS) {
    lastErrorLogAt = now;
    console.warn('Redis unavailable (fallback mode).');
  }
});

const isRedisReady = () => redisReady;

const unavailableResult = () => {
  if (env.REDIS_REQUIRED) {
    throw new Error('Redis is unavailable');
  }
  return null;
};

const safeGet = async (key) => {
  if (!redisReady) return unavailableResult();
  return redis.get(key);
};

const safeGetDel = async (key) => {
  if (!redisReady) return unavailableResult();
  return redis.eval(
    "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
    1,
    key
  );
};

const safeSet = async (key, value, mode, ttlSeconds) => {
  if (!redisReady) return unavailableResult();
  return redis.set(key, value, mode, ttlSeconds);
};

const safeDel = async (key) => {
  if (!redisReady) return unavailableResult();
  return redis.del(key);
};

module.exports = {
  redis,
  isRedisReady,
  safeGet,
  safeGetDel,
  safeSet,
  safeDel
};
