const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/prisma');
const { redis, isRedisReady } = require('./config/redis');

const startServer = async () => {
  try {
    await prisma.$connect();
    try {
      await redis.ping();
    } catch (err) {
      if (env.REDIS_REQUIRED) {
        throw err;
      }
      console.warn('Redis is unavailable; continuing in fallback mode.');
    }

    const port = process.env.PORT ? Number(process.env.PORT) : env.PORT;
    app.listen(port, '0.0.0.0', () => {
      console.log(`Auth server running on port ${port}`);
      if (!env.REDIS_REQUIRED && !isRedisReady()) {
        console.log('Redis fallback enabled: refresh token cache and blacklisting are disabled until Redis is up.');
      }
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
};

startServer();
