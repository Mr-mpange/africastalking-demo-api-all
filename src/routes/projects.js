const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/projectsController');
const { authenticate, authorize } = require('../middleware/auth');
const projectAiService = require('../services/projectAiService');
const logger = require('../utils/logger');

// Public — marketplace list
router.get('/', ctrl.list.bind(ctrl));

// Public — single project
router.get('/:id', ctrl.get.bind(ctrl));

// Public — project questions (for participant flow)
router.get('/:id/questions', ctrl.getQuestions.bind(ctrl));

// Public — submit a response
router.post('/:id/responses', ctrl.submitResponse.bind(ctrl));

// Protected — create project
router.post('/', authenticate, authorize('researcher', 'admin'), ctrl.create.bind(ctrl));

// Protected — update project
router.put('/:id', authenticate, authorize('researcher', 'admin'), ctrl.update.bind(ctrl));

// Protected — delete project
router.delete('/:id', authenticate, authorize('researcher', 'admin'), ctrl.remove.bind(ctrl));

// Protected — view responses
router.get('/:id/responses', authenticate, ctrl.getResponses.bind(ctrl));

// Protected — get AI summaries
router.get('/:id/ai-summary', authenticate, ctrl.getAISummary.bind(ctrl));

// Protected — view airtime rewards for a project
router.get('/:id/rewards', authenticate, authorize('researcher', 'admin'), async (req, res) => {
  try {
    const result = await require('../database/connection').query(`
      SELECT r.*, p.name AS participant_name
      FROM airtime_rewards r
      LEFT JOIN participants p ON p.id = r.participant_id
      WHERE r.project_id = $1
      ORDER BY r.created_at DESC
    `, [req.params.id]);
    res.json({ success: true, data: { rewards: result.rows, total: result.rows.length } });
  } catch (err) {
    logger.error('Get rewards error:', err);
    res.status(500).json({ error: 'Failed to get rewards' });
  }
});

// Protected — manually trigger AI summary generation
router.post('/:id/ai-summary/generate', authenticate, authorize('researcher', 'admin'), async (req, res) => {
  try {
    const { question_id } = req.body;
    const result = await projectAiService.generateAISummary(req.params.id, question_id || null);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Manual AI trigger error:', err);
    res.status(500).json({ error: 'AI generation failed', details: err.message });
  }
});

module.exports = router;
