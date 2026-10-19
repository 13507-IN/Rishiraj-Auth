const { ZodError } = require('zod');
const { ApiError } = require('../utils/errors');
const env = require('../config/env');

const errorHandler = (err, req, res, next) => {
  const requestId = req.requestId || null;

  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'Validation error',
      errors: err.errors,
      requestId
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      message: err.message,
      details: err.details,
      requestId
    });
  }

  if (env.IS_PRODUCTION) {
    const errorCode = typeof err.code === 'string' ? ` code=${err.code}` : '';
    console.error(`[${requestId}] Unhandled ${err.name || 'Error'}${errorCode}`);
    return res.status(500).json({ message: 'Internal server error', requestId });
  }

  console.error(`[${requestId}] Unhandled error:`, err);
  return res.status(500).json({ message: 'Internal server error', requestId });
};

module.exports = errorHandler;
