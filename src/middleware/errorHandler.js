const { ZodError } = require('zod');
const { ApiError } = require('../utils/errors');

const errorHandler = (err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'Validation error',
      errors: err.errors
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      message: err.message,
      details: err.details
    });
  }

  console.error('Unhandled error:', err);
  return res.status(500).json({ message: 'Internal server error' });
};

module.exports = errorHandler;