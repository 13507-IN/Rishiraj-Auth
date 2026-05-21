const { ZodError } = require('zod');
const { ApiError } = require('../utils/errors');

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

  if (process.env.NODE_ENV === 'production') {
    console.error(`[${requestId}] Unhandled error:`, err.message);
    return res.status(500).json({ message: 'Internal server error', requestId });
  }

  console.error(`[${requestId}] Unhandled error:`, err);
  return res.status(500).json({ message: 'Internal server error', requestId });
};

module.exports = errorHandler;