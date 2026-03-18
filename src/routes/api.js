const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const publicController = require('../controllers/publicController');
const { authenticate, authorize } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const { cacheMiddleware, invalidateCache } = require('../middleware/cacheMiddleware');

// Public health check
router.get('/health', apiController.getHealth);

// Public AI test (for debugging)
router.get('/ai-status', cacheMiddleware(60), apiController.getAIStatus);

// Database migration endpoints
router.post('/migrate', publicController.runMigration);
router.post('/migrate/v2', publicController.runMigrationV2);

// Public endpoints (NO authentication required)
router.post('/contact', rateLimiter.general, publicController.submitContactForm);
router.post('/newsletter/subscribe', rateLimiter.general, publicController.subscribeNewsletter);
router.get('/whitepapers/:filename', publicController.getWhitepaper);

// Public questions endpoint (read-only)
router.get('/questions', cacheMiddleware(1800), apiController.getQuestions);

// Temporarily public for seeding and testing - REMOVE IN PRODUCTION
router.post('/questions', 
  invalidateCache(['api:/api/questions*', 'api:/api/analytics*']),
  apiController.createQuestion
);
router.put('/questions/:questionId', 
  invalidateCache(['api:/api/questions*', 'api:/api/analytics*']),
  apiController.updateQuestion
);
router.delete('/questions/:questionId', 
  invalidateCache(['api:/api/questions*', 'api:/api/analytics*']),
  apiController.deleteQuestion
);

// Public analytics and responses (read-only)
router.get('/responses', cacheMiddleware(300), apiController.getResponses);
router.get('/responses/:responseId', cacheMiddleware(600), apiController.getResponse);
router.get('/analytics', cacheMiddleware(600), apiController.getAnalytics);

// Temporarily public AI processing for testing - SECURE IN PRODUCTION
router.post('/ai/process', 
  invalidateCache(['api:/api/responses*', 'api:/api/analytics*']),
  apiController.processAI
);

// Protected routes (require authentication)
router.use(authenticate);

// User profile update (authenticated)
router.put('/users/:userId', publicController.updateUserProfile);

// Test AI service
router.post('/ai/test', authorize('admin', 'researcher'), apiController.testAI);

module.exports = router;