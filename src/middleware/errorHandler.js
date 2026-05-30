const errorHandler = (err, req, res, next) => {
  console.error('[Error]', err.message, { url: req.url, method: req.method });

  res.status(err.statusCode || 500).json({
    error: err.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
