// Simplified cache middleware without Redis
// For now, just pass through without caching

const cacheMiddleware = (ttl = 300) => {
  return (req, res, next) => {
    // No caching for now - just pass through
    next();
  };
};

const invalidateCache = (patterns) => {
  return (req, res, next) => {
    // No cache to invalidate - just pass through
    next();
  };
};

module.exports = {
  cacheMiddleware,
  invalidateCache
};
