const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error('Error Handler:', {
    error: error.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        error = { message: 'Duplicate entry', statusCode: 400 };
        break;
      case '23503': // Foreign key violation
        error = { message: 'Referenced record not found', statusCode: 400 };
        break;
      case '23502': // Not null violation
        error = { message: 'Required field missing', statusCode: 400 };
        break;
      default:
        error = { message: 'Database error', statusCode: 500 };
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = { message: 'Invalid token', statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    error = { message: 'Token expired', statusCode: 401 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
