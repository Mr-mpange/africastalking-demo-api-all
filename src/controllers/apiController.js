const db = require('../database/connection');
const logger = require('../utils/logger');
const aiService = require('../services/aiService');
const { body, validationResult } = require('express-validator');

class APIController {
  // Get research questions
  async getQuestions(req, res) {
    try {
      const { language, category, active } = req.query;

      let query = 'SELECT * FROM research_questions WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (language && language !== '') {
        query += ` AND language = $${paramIndex}`;
        params.push(language);
        paramIndex++;
      }

      if (category && category !== '') {
        query += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (active !== undefined && active !== '') {
        query += ` AND is_active = $${paramIndex}`;
        params.push(active === 'true');
        paramIndex++;
      }

      query += ' ORDER BY created_at DESC';

      const result = await db.query(query, params);

      res.json({
        success: true,
        data: {
          questions: result.rows
        }
      });

    } catch (error) {
      logger.error('Get questions API error:', error);
      res.status(500).json({ error: 'Failed to retrieve questions' });
    }
  }

  // Create research question
  async createQuestion(req, res) {
    try {
      if (!req.body.language) {
        req.body.language = 'en';
      }

      await body('title').notEmpty().withMessage('Title is required').run(req);
      await body('question_text').notEmpty().withMessage('Question text is required').run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: errors.array() 
        });
      }

      const { title, description, question_text, category, language = 'en' } = req.body;
      const createdBy = req.user?.id || req.user?.userId || null;

      const result = await db.query(`
        INSERT INTO research_questions (title, description, question_text, category, language, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [title, description, question_text, category, language, createdBy]);

      logger.info('Question created', { questionId: result.rows[0].id });

      res.status(201).json({
        success: true,
        question: result.rows[0]
      });

    } catch (error) {
      logger.error('Create question API error:', error);
      res.status(500).json({ error: 'Failed to create question' });
    }
  }

  // Update research question
  async updateQuestion(req, res) {
    try {
      const { questionId } = req.params;
      const { title, description, question_text, category, is_active } = req.body;

      const existingResult = await db.query('SELECT * FROM research_questions WHERE id = $1', [questionId]);
      if (existingResult.rows.length === 0) {
        return res.status(404).json({ error: 'Question not found' });
      }

      const result = await db.query(`
        UPDATE research_questions 
        SET title = COALESCE($1, title),
            description = COALESCE($2, description),
            question_text = COALESCE($3, question_text),
            category = COALESCE($4, category),
            is_active = COALESCE($5, is_active),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *
      `, [title, description, question_text, category, is_active, questionId]);

      logger.info('Question updated', { questionId });

      res.json({
        success: true,
        question: result.rows[0]
      });

    } catch (error) {
      logger.error('Update question API error:', error);
      res.status(500).json({ error: 'Failed to update question' });
    }
  }

  // Delete research question
  async deleteQuestion(req, res) {
    try {
      const { questionId } = req.params;

      const responsesResult = await db.query('SELECT COUNT(*) FROM research_responses WHERE question_id = $1', [questionId]);
      const responseCount = parseInt(responsesResult.rows[0].count);

      if (responseCount > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete question with existing responses',
          responseCount 
        });
      }

      const result = await db.query('DELETE FROM research_questions WHERE id = $1 RETURNING *', [questionId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Question not found' });
      }

      logger.info('Question deleted', { questionId });

      res.json({
        success: true,
        message: 'Question deleted successfully'
      });

    } catch (error) {
      logger.error('Delete question API error:', error);
      res.status(500).json({ error: 'Failed to delete question' });
    }
  }

  // Get responses
  async getResponses(req, res) {
    try {
      const { 
        page = 1, 
        limit = 50, 
        type, 
        phone, 
        questionId, 
        startDate, 
        endDate
      } = req.query;
      
      const offset = (page - 1) * limit;

      let query = `
        SELECT r.*, q.title as question_title, q.question_text
        FROM research_responses r
        LEFT JOIN research_questions q ON r.question_id = q.id
      `;

      const conditions = [];
      const params = [];
      let paramIndex = 1;

      if (type) {
        conditions.push(`r.response_type = $${paramIndex}`);
        params.push(type);
        paramIndex++;
      }

      if (phone) {
        conditions.push(`r.phone_number LIKE $${paramIndex}`);
        params.push(`%${phone}%`);
        paramIndex++;
      }

      if (questionId) {
        conditions.push(`r.question_id = $${paramIndex}`);
        params.push(questionId);
        paramIndex++;
      }

      if (startDate && endDate) {
        conditions.push(`r.created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
        params.push(startDate, endDate);
        paramIndex += 2;
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);

      let countQuery = 'SELECT COUNT(*) FROM research_responses r';
      if (conditions.length > 0) {
        countQuery += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      const countResult = await db.query(countQuery, params.slice(0, -2));
      const total = parseInt(countResult.rows[0].count);

      res.json({
        success: true,
        responses: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      logger.error('Get responses API error:', error);
      res.status(500).json({ error: 'Failed to retrieve responses' });
    }
  }

  // Get specific response
  async getResponse(req, res) {
    try {
      const { responseId } = req.params;

      const result = await db.query(`
        SELECT r.*, q.title as question_title, q.question_text
        FROM research_responses r
        LEFT JOIN research_questions q ON r.question_id = q.id
        WHERE r.id = $1
      `, [responseId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Response not found' });
      }

      res.json({
        success: true,
        response: result.rows[0]
      });

    } catch (error) {
      logger.error('Get response API error:', error);
      res.status(500).json({ error: 'Failed to retrieve response' });
    }
  }

  // Get analytics summary
  async getAnalytics(req, res) {
    try {
      const { startDate, endDate } = req.query;

      let dateFilter = '';
      const params = [];
      
      if (startDate && endDate) {
        dateFilter = 'WHERE created_at BETWEEN $1 AND $2';
        params.push(startDate, endDate);
      }

      const responseStats = await db.query(`
        SELECT 
          COUNT(*) as total_responses,
          COUNT(*) FILTER (WHERE response_type = 'ussd') as ussd_responses,
          COUNT(*) FILTER (WHERE response_type = 'voice') as voice_responses,
          COUNT(*) FILTER (WHERE response_type = 'sms') as sms_responses,
          COUNT(DISTINCT phone_number) as unique_participants,
          COUNT(DISTINCT question_id) as questions_answered
        FROM research_responses
        ${dateFilter}
      `, params);

      const topQuestions = await db.query(`
        SELECT q.id, q.title, COUNT(r.id) as response_count
        FROM research_questions q
        LEFT JOIN research_responses r ON q.id = r.question_id
        ${dateFilter.replace('created_at', 'r.created_at')}
        GROUP BY q.id, q.title
        ORDER BY response_count DESC
        LIMIT 10
      `, params);

      res.json({
        success: true,
        analytics: {
          responseStats: responseStats.rows[0],
          topQuestions: topQuestions.rows
        }
      });

    } catch (error) {
      logger.error('Get analytics API error:', error);
      res.status(500).json({ error: 'Failed to retrieve analytics' });
    }
  }

  // Test AI service
  async testAI(req, res) {
    try {
      const { text = 'This is a test message for AI analysis.' } = req.body;

      const status = aiService.getServiceStatus();

      let geminiTest = null;
      if (status.gemini.available) {
        try {
          geminiTest = await aiService.analyzeWithGemini(text, 'summary');
        } catch (error) {
          geminiTest = { error: error.message };
        }
      }

      res.json({
        success: true,
        message: 'AI service test completed',
        status,
        geminiTest,
        testText: text
      });

    } catch (error) {
      logger.error('AI test API error:', error);
      res.status(500).json({ 
        success: false,
        error: 'AI test failed',
        details: error.message 
      });
    }
  }

  // Get AI service status
  async getAIStatus(req, res) {
    try {
      const status = aiService.getServiceStatus();

      res.json({
        success: true,
        status,
        message: 'AI service status retrieved'
      });

    } catch (error) {
      logger.error('AI status API error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to get AI status',
        details: error.message 
      });
    }
  }

  // Get system health status
  async getHealth(req, res) {
    try {
      const dbResult = await db.query('SELECT NOW()');
      const dbHealthy = dbResult.rows.length > 0;

      const questionCount = await db.query('SELECT COUNT(*) as count FROM research_questions');
      const totalQuestions = parseInt(questionCount.rows[0]?.count || 0);

      res.json({
        success: true,
        health: {
          database: dbHealthy,
          timestamp: new Date().toISOString(),
          totalQuestions
        }
      });

    } catch (error) {
      logger.error('Health check API error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Health check failed',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Process AI (stub for now)
  async processAI(req, res) {
    try {
      res.json({
        success: true,
        message: 'AI processing not yet implemented',
        voiceProcessed: 0,
        ussdProcessed: 0
      });
    } catch (error) {
      logger.error('AI processing API error:', error);
      res.status(500).json({ error: 'AI processing failed' });
    }
  }
}

module.exports = new APIController();
