const { ApiError } = require('../utils/errors');

const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return next(new ApiError(403, 'Access denied'));
  }
  return next();
};

module.exports = authorizeRoles;