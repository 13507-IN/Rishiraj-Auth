const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/prisma');
const { redis, isRedisReady } = require('./config/redis');

const startServer = async () => {
  try {
    await prisma.$connect();
  } catch (_err) {
    console.error('Failed to start: PostgreSQL is unavailable. Check DATABASE_URL and confirm the database is running.');
    process.exit(1);
  }

  try {
    await redis.ping();
  } catch (_err) {
    if (env.REDIS_REQUIRED) {
      console.error('Failed to start: Redis is required but unavailable. Check REDIS_URL and confirm Redis is running.');
      process.exit(1);
    }
    console.warn('Redis is unavailable; continuing in development fallback mode.');
  }

  const port = env.PORT;
  app.listen(port, env.HOST, () => {
    console.log(`Auth server running on ${env.HOST}:${port}`);
    if (!env.REDIS_REQUIRED && !isRedisReady()) {
      console.log('Redis fallback enabled: refresh-token cache and access-token blacklist checks use the database only.');
    }
  });
};

startServer();
