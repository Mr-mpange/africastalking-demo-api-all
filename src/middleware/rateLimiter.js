const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// General rate limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.error('Rate limit exceeded', { ip: req.ip, url: req.url });
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.'
    });
  }
});

// Auth rate limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: 'Too many authentication attempts, please try again later.'
  },
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    logger.error('Auth rate limit exceeded', { ip: req.ip });
    res.status(429).json({
      error: 'Too many authentication attempts, please try again later.'
    });
  }
});

module.exports = {
  general: generalLimiter,
  auth: authLimiter
};
